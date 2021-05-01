const fetch = require('node-fetch');
const nodemailer = require('nodemailer');
const _compact = require('lodash/compact');
const moment = require('moment');

const mailTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: '',
        pass: ''
    }
});
  
const mailDetails = {
    from: '',
    to: '',
    subject: 'Vaccine Availability'
};

const constructMailText = (data) => {
    let text = '';
    data.forEach(center => {
        text = text + `Center Name: ${center.name}  Pincode: ${center.pincode}  Free: ${center.fee_type === 'Paid' ? 'No' : 'Yes'} \n`;
        center.sessions.forEach((session) => {
            text = text + `Date: ${session.date}\n`;
            text = text + `Available Capacity: ${session.available_capacity}  Age Limit: ${session.min_age_limit === 18 ? '18-44' : '44+'}  `;
            if (session.vaccine) {
                text = text + `Vaccine: ${session.vaccine}`;
            }
            text = text + '\n';
        });
        text = text + '\n\n';
    });
    return text;
}

const checkAvailability = async (filters) => {
    try {
        const params = new URLSearchParams({
            district_id: 395, // Mumbai
            date: moment().format('DD-MM-YYYY')
        });
        const url = 'https://cdn-api.co-vin.in/api/v2/appointment/sessions/public/calendarByDistrict';
        const res = await fetch(`${url}?${params}`);
        const data = await res.json();

        const result = _compact(data.centers.map(center => {
            if (filters.preferredPincodes.indexOf(center.pincode) > -1) {
                const sessions = center.sessions.filter(session => session.available_capacity > 0);
                if (sessions.length) {
                    return {
                        ...center,
                        sessions
                    };
                } 
            }
        }));

        if (result.length) {
            await mailTransporter.sendMail({
                ...mailDetails,
                text: constructMailText(result)
            });
            // console.log('Message sent: %s', info.messageId);
        } else {
            // console.log('Everything Booked!');
        }
    } catch (err) {
        console.log(err);
    }
}

checkAvailability({
    preferredPincodes: [400102, 400058, 400059, 400093, 400053]
});