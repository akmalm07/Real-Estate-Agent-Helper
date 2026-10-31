import { localRuntime, lazyClient } from './testing/local-boundary.js';
if (!localRuntime()) await import('dotenv/config');

import twilio from 'twilio';
import Telnyx from 'telnyx';


export const twilioClient = lazyClient(() => twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_API_KEY_SID,     
  process.env.TWILIO_API_KEY_SECRET, 
));


export const telnyx = lazyClient(() => new Telnyx({ apiKey: process.env.TELNYX_API_KEY }));

export async function sendSMS(to, body) {
  try {
    const response = await telnyx.messages.send({
      from: process.env.TELNYX_PHONE_NUMBER,
      to,
      text: body,
    });

    return {
      success: true,
      provider: 'telnyx',
      messageId: response.data.id,
      raw: response,
    };
  } catch (error) {
    console.error('Telnyx SMS failed:', error);

    return {
      success: false,
      provider: 'telnyx',
      error: error.message,
    };
  }
}

export async function sendEmail(email, subject, html, text = '') {
  const response = await fetch(
  'https://comms.twilio.com/v1/Emails',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:
        'Basic ' +
        Buffer.from(
          `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
        ).toString('base64'),
    },
    body: JSON.stringify({
      from: {
        address: process.env.TWILIO_FROM_EMAIL,
        name: 'CRM Bot',
      },
      to: [
        {
          address: email,
        },
      ],
      content: {
        subject: subject,
        html: html,
        text: text,
      },
    }),
  }
);

console.log(await response.json());
}
