# cowin-alert
Send email alerts when vaccine is available on https://cowin.gov.in

Functionality currently is for only a single subscriber that can be configured in [subscriber.js](https://github.com/qruiger/cowin-alert/blob/master/src/subscriber.js).   
If `districtId` is not set, Mumbai will be used as default

Before running `npm run deploy`, create two parameters in parameter store in your aws account
 - `gmailPass` - gmail password of the account that will be used to send emails (daily gmail limit is 2000)
 - `emailText` - cheap workaround to have cache for the Lambda to avoid sending repetitive emails   

Ensure that you've run `aws configure` once before deploying from your local machine

TODO:
- Multi-user, multi-filters
- use SES
- connect to google sheet for saving user filters and fan-out notifications