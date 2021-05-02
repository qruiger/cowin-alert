const fetch = require('node-fetch');
const nodemailer = require('nodemailer');
const moment = require('moment');
const crypto = require('crypto');
const { SSMClient, GetParameterCommand, PutParameterCommand } = require("@aws-sdk/client-ssm");

const ssmClient = new SSMClient({ region: 'ap-south-1' });
const ssmKey = process.env.PREVIOUS_EMAIL_TEXT;

const mailTransporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS
  }
});

const mailDetails = {
  from: process.env.GMAIL_USER,
  to: 'viditvora116@gmail.com',
  subject: 'Vaccine Availability'
};

const getHash = (message) => crypto.createHash('md5').update(message).digest('hex');

const getPreviousEmailText = async () => {
  const params = {
    Name: ssmKey
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
    Name: ssmKey,
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
    center.sessions.forEach((session) => {
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
    const filters = {
      preferredPincodes: [400053, 400058, 400059, 400064, 400093, 400102, 400104]
    };
    const params = new URLSearchParams({
      district_id: 395, // Mumbai
      date: moment().format('DD-MM-YYYY')
    });
    const url = 'https://cdn-api.co-vin.in/api/v2/appointment/sessions/public/calendarByDistrict';
    const res = await fetch(`${url}?${params}`);
    const data = await res.json();

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
      const previousEmailTextHash = await getPreviousEmailText();
      const currentEmailTextHash = getHash(currentEmailText);

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
