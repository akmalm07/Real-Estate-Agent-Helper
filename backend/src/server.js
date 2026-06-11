import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import path from 'path'
import cookieParser from 'cookie-parser';

import googleAuthRouter from './google-auth.js';
import microsoftAuthRouter from './microsoft-auth.js';

import pubsubEmailWebhook from './gmail-email-webhook.js'
import outlookEmailWebhook from './outlook-email-webhook.js'

import schaduledGmailWatchRouter from './shaduled-gmail-watch.js'
import scheduledUnreplyRouter from './scheduled-unreply-handler.js'

import smsWebhookRouter from './sms-webhook.js';
import emailDraftWebhookRouter from './email-webhook.js';


const app = express();

app.use(cookieParser());
app.use(cors());
app.use(express.json());

/*
const frontendPath = path.resolve('../frontend/dist');

app.use(express.static(frontendPath));

app.get('*', (req, res) => {
  res.sendFile(
    path.join(frontendPath, 'index.html')
  );
});
*/

app.use('/google', googleAuthRouter);
// app.use('/microsoft', microsoftAuthRouter);
app.use('/webhook', pubsubEmailWebhook);
app.use('/webhook', smsWebhookRouter);
app.use('/webhook', emailDraftWebhookRouter);
app.use('/webhook', outlookEmailWebhook);
app.use('/schaduler', schaduledGmailWatchRouter);
app.use('/schaduler', scheduledUnreplyRouter);

const PORT = process.env.PORT || 3000;

console.log(PORT);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
