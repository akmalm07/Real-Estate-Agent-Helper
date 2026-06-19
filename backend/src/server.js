import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import googleAuthRouter from './google-auth.js';
import microsoftAuthRouter from './microsoft-auth.js';

import pubsubEmailWebhook from './pubsub-email-webhook.js'
import outlookEmailWebhook from './outlook-email-webhook.js'

import schaduledGmailWatchRouter from './shaduled-gmail-watch.js'
import scheduledUnreplyRouter from './scheduled-unreply-handler.js'

import smsWebhookRouter from './sms-webhook.js';
import emailDraftWebhookRouter from './email-webhook.js';

import frontendComRouter from './frontend-communicator.js'

const app = express();

app.use(cookieParser());
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true,
}));
app.use(express.json());

// Auth routes — mounted at /auth/google so the frontend link
// ${BACKEND_URL}auth/google/signup resolves correctly.
app.use('/auth/google', googleAuthRouter);
// app.use('/auth/microsoft', microsoftAuthRouter);

app.use('/webhook', pubsubEmailWebhook);
app.use('/webhook', smsWebhookRouter);
app.use('/webhook', emailDraftWebhookRouter);
app.use('/webhook', outlookEmailWebhook);

app.use('/schaduler', schaduledGmailWatchRouter);
app.use('/schaduler', scheduledUnreplyRouter);

app.use('/api', frontendComRouter);

const PORT = process.env.PORT || 8080;

console.log(`Starting server on port ${PORT}`);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
