import twilio from 'twilio';

export const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_API_KEY_SID,     
  process.env.TWILIO_API_KEY_SECRET, 
);

const FROM_NUMBER = process.env.TWILIO_PHONE_NUMBER;

/* Sends an SMS message to a lead's phone number using Twilio.
 *
 * Parameters:
 *   to:   string — recipient phone number in E.164 format (e.g. +15551234567)
 *   body: string — the text message content
 *
 * Returns:
 *   The Twilio message object containing sid, status, etc.
 *
 * Side Effects:
 *   - Sends an SMS via the Twilio API.
 */
export async function sendSMS(to, body) {
  const message = await twilioClient.messages.create({
    from: FROM_NUMBER,
    to,
    body,
  });

  return message;
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
