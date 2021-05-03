const fetch = require('node-fetch');
const nodemailer = require('nodemailer');
const moment = require('moment');
const crypto = require('crypto');
const { SSMClient, GetParameterCommand, PutParameterCommand } = require('@aws-sdk/client-ssm');
const subscriber = require('./subscriber');

const mailTransporter = nodemailer.createTransport({
  service: process.env.SMTP_SERVICE,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS
  }
});

const mailDetails = {
  from: process.env.GMAIL_USER,
  to: subscriber.email,
  subject: 'Vaccine Availability'
};

const getHash = message => crypto.createHash('md5').update(message).digest('hex');

const ssmClient = new SSMClient({ region: 'ap-south-1' });

const getPreviousEmailText = async () => {
  const params = {
    Name: process.env.EMAIL_TEXT_KEY
  };
  const getParameter = new GetParameterCommand(params);
  try {
    const data = await ssmClient.send(getParameter);
    if (data.Parameter?.Value) {
      return data.Parameter.Value;
    }
    return null;
  } catch (error) {
    if (error.name === 'ParameterNotFound') {
      return null;
    }
    throw error;
  }
}

const saveCurrentEmailText = async (hashedEmailText) => {
  const params = {
    Value: hashedEmailText,
    DataType: 'text',
    Name: process.env.EMAIL_TEXT_KEY,
    Type: 'String',
    Overwrite: true
  };
  const putParameter = new PutParameterCommand(params);
  try {
    await ssmClient.send(putParameter);
    return true;
  } catch (error) {
    throw error;
  }
}

const constructMailText = (data) => {
  let text = '';
  data.forEach(center => {
    text += `Center Name: ${center.name}  Pincode: ${center.pincode}  Free: ${center.fee_type === 'Paid' ? 'No' : 'Yes'} \n`;
    center.sessions.forEach(session => {
      text += `Date: ${session.date}\n`;
      text += `Available Capacity: ${session.available_capacity}  Age Limit: ${session.min_age_limit === 18 ? '18-44' : '44+'}  `;
      if (session.vaccine) {
        text += `Vaccine: ${session.vaccine}`;
      }
      text += '\n';
    });
    text += '\n\n';
  });
  return text;
};

module.exports.mailer = async (event, context) => {
  try {
    const filters = { ...subscriber.filters };

    const promises = [];
    // accumulate 4 week data
    for (let week = 0; week < 4; week++) {
      const params = new URLSearchParams({
        district_id: filters.districtId || 395,
        date: moment().add(7 * week, 'd').format('DD-MM-YYYY')
      });
      const url = 'https://cdn-api.co-vin.in/api/v2/appointment/sessions/public/calendarByDistrict';
      promises.push(fetch(`${url}?${params}`));
    }

    const data = { centers: [] };
    const responses = await Promise.all(promises);
    const weeksData = await Promise.all(responses.map(response => response.json()));
    data.centers = weeksData.flatMap(weekData => weekData.centers);

    let result = data.centers.map(center => {
      if (filters.preferredPincodes.indexOf(center.pincode) > -1 || !filters.preferredPincodes.length) {
        const sessions = center.sessions.filter(session => session.available_capacity > 0);
        if (sessions.length) {
          return {
            ...center,
            sessions
          };
        } 
      }
    });
    result = result.filter(r => !!r);

    if (result.length) {
      const currentEmailText = constructMailText(result);
      const currentEmailTextHash = getHash(currentEmailText);
      const previousEmailTextHash = await getPreviousEmailText();

      if (currentEmailTextHash !== previousEmailTextHash) {
        await saveCurrentEmailText(currentEmailTextHash);
        const info = await mailTransporter.sendMail({
          ...mailDetails,
          text: currentEmailText
        });
        console.log('Message sent: %s', info.messageId);
      } else {
        console.log('No new availability added since last sent email');
      }
    } else {
      console.log('Everything Booked!');
    }
  } catch (err) {
    console.log(err);
  }
};
