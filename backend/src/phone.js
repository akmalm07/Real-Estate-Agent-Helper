import twilio from 'twilio';

const twilioClient = twilio(
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


