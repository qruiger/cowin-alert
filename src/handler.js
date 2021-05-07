const fetch = require('node-fetch');
const nodemailer = require('nodemailer');
const moment = require('moment');
const crypto = require('crypto');
const {
  SSMClient,
  GetParameterCommand,
  PutParameterCommand,
} = require('@aws-sdk/client-ssm');
const subscriber = require('./subscriber');

const mailTransporter = nodemailer.createTransport({
  service: process.env.SMTP_SERVICE,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS,
  },
});

const mailDetails = {
  from: process.env.GMAIL_USER,
  to: subscriber.email,
  subject: 'Vaccine Availability',
};

const getHash = (message) =>
  crypto.createHash('md5').update(message).digest('hex');

const ssmClient = new SSMClient({ region: 'ap-south-1' });

const isNullOrDefined = (value) => value === null || value === undefined;

const getPreviousEmailText = async () => {
  const params = {
    Name: process.env.EMAIL_TEXT_KEY,
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
};

const saveCurrentEmailText = async (hashedEmailText) => {
  const params = {
    Value: hashedEmailText,
    DataType: 'text',
    Name: process.env.EMAIL_TEXT_KEY,
    Type: 'String',
    Overwrite: true,
  };
  const putParameter = new PutParameterCommand(params);
  try {
    await ssmClient.send(putParameter);
    return true;
  } catch (error) {
    throw error;
  }
};

const constructMailText = (data) => {
  let text = '';
  data.forEach((center) => {
    text += `Center Name: ${center.name}  Pincode: ${center.pincode}  Free: ${
      center.fee_type === 'Paid' ? 'No' : 'Yes'
    } \n`;
    center.sessions.forEach((session) => {
      text += `Date: ${session.date}\n`;
      text += `Available Capacity: ${session.available_capacity}  Age Limit: ${
        session.min_age_limit === 18 ? '18-44' : '44+'
      }  `;
      if (session.vaccine) {
        text += `Vaccine: ${session.vaccine}`;
      }
      text += '\n';
    });
    text += '\n\n';
  });
  return text;
};

const filterCenters = (centers) => {
  const { preferredPincodes, vaccineType, free, above45 } = subscriber;
  let result = centers.map((center) => {
    if (
      ((preferredPincodes && preferredPincodes.indexOf(center.pincode) > -1) ||
        isNullOrDefined(preferredPincodes) ||
        !preferredPincodes.length) &&
      ((free === true && center.fee_type === 'Free') ||
        (free === false && center.fee_type === 'Paid') ||
        isNullOrDefined(free))
    ) {
      const sessions = center.sessions.filter(
        (session) =>
          session.available_capacity > 0 &&
          ((session.vaccine && session.vaccine === vaccineType) ||
            isNullOrDefined(vaccineType)) &&
          ((above45 === true && session.min_age_limit === 45) ||
            (above45 === false && session.min_age_limit === 18) ||
            isNullOrDefined(above45))
      );
      if (sessions.length) {
        return {
          ...center,
          sessions,
        };
      }
    }
  });
  result = result.filter((r) => !!r);
  return result;
};

const getAvailability = async () => {
  const { districtId } = subscriber;
  const promises = [];
  const totalWeeks = 4;
  for (let week = 0; week < totalWeeks; week++) {
    const headers = {
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36\
        (KHTML, like Gecko) Chrome/90.0.4430.93 Safari/537.36',
      'content-type': 'application/json',
    };
    const params = {
      headers,
      method: 'GET',
    };
    const queryParams = new URLSearchParams({
      district_id: districtId || 395,
      date: moment()
        .utcOffset('+05:30')
        .add(7 * week, 'd')
        .format('DD-MM-YYYY'),
    });
    const url =
      'https://cdn-api.co-vin.in/api/v2/appointment/sessions/public/calendarByDistrict';
    promises.push(fetch(`${url}?${queryParams}`, params));
  }
  const responses = await Promise.all(promises);
  const weeksData = await Promise.all(
    responses.map((response) => response.json())
  );
  const centers = weeksData.flatMap((weekData) => weekData.centers);
  return filterCenters(centers);
};

module.exports.mailer = async (event, context) => {
  try {
    if (!subscriber.email) {
      throw 'email not defined';
    }
    const availability = await getAvailability();

    if (availability.length) {
      const currentEmailText = constructMailText(availability);
      const currentEmailTextHash = getHash(currentEmailText);
      const previousEmailTextHash = await getPreviousEmailText();

      if (currentEmailTextHash !== previousEmailTextHash) {
        await saveCurrentEmailText(currentEmailTextHash);
        const info = await mailTransporter.sendMail({
          ...mailDetails,
          text: currentEmailText,
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
