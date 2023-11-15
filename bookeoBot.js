/* 

MAXIM MALKIN 2022

bookeo api

bookeo app API key: JFAPJYRMLCHT
auth url: https://signin.bookeo.com/?authappid=JFAPJYRMLCHT&permissions==bookings_r_all,blocks_r_all,availability_r,subaccounts_all

list all subaccounts
curl "https://api.bookeo.com/v2/subaccounts?secretKey=rKowTdyETURD1WAiX0f33d6PIyvfYegX&apiKey=JFAPJYRMLCHT"

create a new api for the subaccount
curl -H 'Content-Type: application/json' -X POST "https://api.bookeo.com/v2/subaccounts/XXXXXXXX/apikeys?secretKey=XXXXXXXX&apiKey=XXXXXXXX" -v

response in headers: https://api.bookeo.com/v2/subaccounts/XXXXXXXX/XXXXXXXX

*/
 

const bookingsCheck = async () => {
let slackWebhookAllUrl = 'https://hooks.slack.com/services/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';

const { IncomingWebhook } = require('@slack/client');
const webhookAll = new IncomingWebhook(slackWebhookAllUrl);
  

  let keys = [
    {
      subaccount: 'artchaos',
      key: 'JFAPJYRMLCHT',
    },
    
  ];

  // APP SECRET
  let apiSecret = 'rKowTdyETURD1WAiX0f33d6PIyvfYegX';

  let tz = `America/Los_Angeles`;

  let period = [
    moment().tz(tz).startOf('day'),
    moment().tz(tz).endOf('day'),
  ];

  let stats = {
    bookings: {
      total: 0,
      new: 0,
    }
  };

  log('checking bookings...');

  for (let key of keys) {
    let url = `https://api.bookeo.com/v2/bookings?startTime=${period[0].format()}&endTime=${period[1].format()}&secretKey=${apiSecret}&apiKey=${key.key}`;

    log(url);
    let rpRes;
    try {
      rpRes = await req(url, {
        url: url,
        json: true,
        noProxy: true,
      });
    } catch (err) {
      log(`ERR:`);
      log(err);
    }

    if (!rpRes) {
      log('FATAL - NO rpRes, continue');
      continue;
    }

    for (let row of rpRes.data) {
      let bookData = {
        account: key.subaccount,
        bookingNumber: row.bookingNumber,
        startTime: moment(row.startTime).toDate(),
        endTime: moment(row.endTime).toDate(),
        canceled: row.canceled,
        accepted: row.accepted,
        creationTime: moment(row.creationTime).toDate(),
        productName: row.productName,
        productId: row.productId,
        createdAt: moment.utc().toDate(),
      };

      let ex = await await db.mongo.collection('bookings').findOne({
        bookingNumber: bookData.bookingNumber,
      });
      if (ex) {

      } else {
        bookData = _.extend(bookData, {
          notifiedAt: null,
        });
        await db.mongo.collection('bookings').insertOne(bookData);

        stats.bookings.new++;
      }

      log(`bookingNumber = ${row.bookingNumber}, ex = ${(ex)?1:0}`);

      stats.bookings.total++;
    }

    log('');
  }

  log('stats:');
  log(JSON.stringify(stats, null, 4));
  log('');

  let notificationsCheckPeriodExclude = [0, 8];
  let curHour = parseInt(moment.tz(tz).format('HH'));
  if (curHour >= notificationsCheckPeriodExclude[0] && curHour <= notificationsCheckPeriodExclude[1]) {
    log('notifications - quiet...');
  } else {
    log('checking notifications...');

    let notificationsWhere = {
      startTime: {
        $gte: period[0].toDate(),
        $lte: period[1].toDate(),
      },
      notifiedAt: null,
    };

    let rows = await db.mongo.collection('bookings').find(notificationsWhere, {
      sort: [['productName', 'asc'], ['startTime', 'asc']],
    }).toArray();

    let dateFormat = 'dddd, MMMM Do, h:mm a';

    for (let row of rows) {
      log(`[${row.account}] ${row.bookingNumber} - ${row.startTime} - ${row.endTime}`);

      let msgOut = [];
      msgOut.push(`📣 *${row.productName}* (created ${moment.utc(row.creationTime).tz(tz).format(dateFormat)})`);
      msgOut.push(`🕰 ${moment.utc(row.startTime).tz(tz).format(dateFormat)} — ${moment.utc(row.endTime).tz(tz).format('h:mm a')} • <!channel>`);
      msgOut.push(``);
      msgOut = msgOut.join(`\n`);

      let hookRes = await webhookAll.send(msgOut);
      log(`hookRes:`);
      log(hookRes);

      // send each subaccount to separate channels
      let subHookRes;
      if (row.account === 'artchaos') {
        subHookRes = await webhookAll.send(msgOut);
      } 
      log(`subHookRes:`);
      log(subHookRes);

      await db.mongo.collection('bookings').updateOne({
        _id: row._id,
      }, {
        $set: {
          notifiedAt: moment.utc().toDate(),
        }
      });

      log('');

    }

    log('');
  }

  let sleepTime = 5 * 60 * 1000;

  log(`finished, sleep ${sleepTime}`);
  await sleep(sleepTime);

  log(``);

  await bookingsCheck();
}
