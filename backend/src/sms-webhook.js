import twilio from 'twilio';
import express from 'express';
import { db } from '../db/index.js';
import { leads } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { sendSMS } from './phone.js';
import { loadSmsHistory, findOrCreateSmsConversation, saveSmsMessage, generateSmsReply } from './sms-helpers.js';
import {  loadLeadNotes, saveLeadNote, saveLeadTask, loadPropertyDescription } from './load-lead-helpers.js'

const router = express.Router();

// Used to validate that incoming requests are genuinely from Twilio.
// Requires TWILIO_AUTH_TOKEN (not the API Key Secret) in your .env file.
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;

/* This route is called by Twilio when an inbound SMS is received on your
 * Twilio phone number. It validates the request is from Twilio, looks up
 * the sender in the leads database by phone number, loads conversation
 * history and lead notes, generates a structured AI reply using GPT-4o-mini,
 * saves both the inbound and outbound messages to the database,
 * sends the reply back via SMS, and optionally writes a new lead note or
 * lead task to the database based on the AI's recommendation.
 *
 * Called by:
 *   Twilio — configure this URL in your Twilio phone number's SMS webhook settings.
 *
 * Headers:
 *   X-Twilio-Signature: string — Twilio's HMAC signature for request validation
 *
 * Request Body (application/x-www-form-urlencoded, sent by Twilio):
 *   From:        string — sender's phone number in E.164 format (e.g. +15551234567)
 *   To:          string — our Twilio phone number
 *   Body:        string — the SMS message content
 *   MessageSid:  string — unique Twilio message ID
 *
 * Response:
 *   200 with empty TwiML body (reply is sent via REST API, not TwiML response)
 *   403 if Twilio signature validation fails
 *   500 if an internal error occurs
 *
 * Side Effects:
 *   - Looks up lead by phone number in the database
 *   - Loads SMS conversation history and lead notes from the database
 *   - Calls OpenAI GPT-4o-mini to generate a structured reply
 *   - Finds or creates a conversations record for this lead's SMS thread
 *   - Saves the inbound SMS to the sms table
 *   - Sends an outbound SMS reply via Twilio REST API (sendSMS)
 *   - Saves the outbound SMS reply to the sms table
 *   - Optionally inserts a new lead note into the lead_notes table
 *   - Optionally inserts a new lead task into the lead_tasks table
 */
router.post('/sms', express.urlencoded({ extended: false }), async (req, res) => {
  // Validate that this request is genuinely from Twilio.
  const twilioSignature = req.headers['x-twilio-signature'];
  const webhookUrl = `${process.env.BASE_URL}/webhook/sms`;

  const isValid = twilio.validateRequest(
    twilioAuthToken,
    twilioSignature,
    webhookUrl,
    req.body,
  );

  if (!isValid) {
    console.warn('Invalid Twilio signature — request rejected.');
    return res.status(403).send('Forbidden');
  }

  const fromNumber = req.body.From;
  const toNumber = req.body.To;
  const inboundText = req.body.Body;
  const inboundMessageSid = req.body.MessageSid;

  if (!fromNumber || !inboundText) {
    return res.status(400).send('Bad Request');
  }

  try {
    // Look up the lead by their phone number.
    // The `From` field from Twilio is in E.164 format (e.g. +15551234567),
    // so leads must have their phone stored in the same format.
    const leadResults = await db
      .select()
      .from(leads)
      .where(eq(leads.phone, fromNumber))
      .limit(1);

    const lead = leadResults[0] || null;

    if (!lead) {
      console.warn(`Inbound SMS from unknown number: ${fromNumber}`);
    }

    // Load conversation history and notes only if we have a known lead
    const history = lead ? await loadSmsHistory(lead.id) : [];
    const notes = lead ? await loadLeadNotes(lead.id) : [];
    const propertyDescription = lead ? await loadPropertyDescription(lead.id) : null;

    const { reply, addNote, addTask } = await generateSmsReply(
      lead,
      inboundText,
      propertyDescription,
      history,
      notes,
    );

    // Find or create the SMS conversation record for this lead,
    // then save the inbound message before sending the reply.
    let conversationId = null;
    if (lead) {
      conversationId = await findOrCreateSmsConversation(lead.id, fromNumber, toNumber);
      await saveSmsMessage(conversationId, 'inbound', inboundText, inboundMessageSid);
    }

    // Send the reply via Twilio and get back the MessageSid
    const twilioMessage = await sendSMS(fromNumber, reply);

    // Save the outbound reply to the database
    if (conversationId) {
      await saveSmsMessage(conversationId, 'outbound', reply, twilioMessage.sid);
    }

    // Persist note if GPT flagged one
    if (lead && addNote) {
      await saveLeadNote(lead.id, addNote);
    }

    // Persist task if GPT flagged one
    if (lead && addTask?.title) {
      await saveLeadTask(lead.id, addTask.title, addTask.dueDate || null);
    }

    // Respond with empty TwiML so Twilio knows the webhook was received.
    res.set('Content-Type', 'text/xml');
    return res.status(200).send('<Response></Response>');
  } catch (err) {
    console.error('SMS webhook error:', err);
    return res.status(500).send('Internal Server Error');
  }
});

export default router;
