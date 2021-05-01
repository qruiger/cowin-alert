const fetch = require('node-fetch');
const _find = require("lodash/find");
const _compact = require("lodash/compact");
const moment = require('moment');

const checkAvailability = async () => {
    try {
        const params = new URLSearchParams({
            district_id: 395, // Mumbai
            date: moment().format("DD-MM-YYYY")
        });
        const url = "https://cdn-api.co-vin.in/api/v2/appointment/sessions/public/calendarByDistrict";
        const res = await fetch(`${url}?${params}`);
        const data = await res.json();
        const result = _compact(data.centers.map(center => {
            const sessions = _find(center.sessions, session => session.available_capacity > 0);
            if (sessions) {
                return {
                    ...center,
                    sessions
                };
            } 
        }));
        console.log(moment().format("HH:mm"));
        if (!result.length) {
            console.log("Everything booked");
        } else {
            console.log(JSON.stringify(result, null, 2));
        }
    } catch (err) {
        console.log(err);
    }
}

// run every 5 minutes
// setInterval(checkAvailability, 300000);

checkAvailability();