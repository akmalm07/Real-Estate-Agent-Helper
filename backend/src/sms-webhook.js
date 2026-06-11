import twilio from 'twilio';
import express from 'express';
import { db } from '../db/index.js';
import { leads, conversations, leadTasks } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { sendSMS } from './phone.js';
import {
  loadSmsHistory,
  findOrCreateSmsConversation,
  saveSmsMessage,
  generateSmsReply,
} from './sms-helpers.js';
import {
  loadLeadNotes,
  saveLeadNote,
  saveLeadTask,
  loadPropertyDescription,
} from './load-lead-helpers.js';

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
 *   - Updates lastLeadMessageAt and resets unansweredFollowups on the conversation
 *   - Sends an outbound SMS reply via Twilio REST API (sendSMS)
 *   - Saves the outbound SMS reply to the sms table
 *   - Updates lastAgentMessageAt on the conversation
 *   - Updates conversationState if the AI returned a state update
 *   - Marks conversation as opted_out if the lead replied STOP
 *   - Marks lead status as 'ready' and creates an agent task if AI detects readyToBook
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

    // Find or create the SMS conversation record — returns the full conversation record.
    // We do this before generating the AI reply so we can pass the conversation
    // context (status, unansweredFollowups, conversationState, etc.) to the AI.
    let conversation = null;
    if (lead) {
      conversation = await findOrCreateSmsConversation(lead.id, fromNumber, toNumber);
    }

    // If the conversation is not active (e.g. converted, cold, opted_out), do not auto-reply.
    if (conversation && conversation.status !== 'active') {
      res.set('Content-Type', 'text/xml');
      return res.status(200).send('<Response></Response>');
    }

    // Save the inbound message — also updates lastLeadMessageAt and resets unansweredFollowups.
    if (conversation) {
      await saveSmsMessage(conversation.id, 'inbound', inboundText, inboundMessageSid);
    }

    // Load conversation history and notes only if we have a known lead.
    const history = lead ? await loadSmsHistory(lead.id) : [];
    const notes = lead ? await loadLeadNotes(lead.id) : [];
    const propertyDescription = lead ? await loadPropertyDescription(lead.id) : null;

    // Generate the AI reply — pass the full conversation record for context.
    const { reply, addNote, addTask, updateConversationState, readyToBook, optedOut } = await generateSmsReply(
      lead,
      conversation,
      inboundText,
      propertyDescription,
      history,
      notes,
    );

    // If the lead opted out, update the conversation status and stop — do not send a reply.
    if (optedOut && conversation) {
      await db
        .update(conversations)
        .set({ status: 'opted_out' })
        .where(eq(conversations.id, conversation.id));

      if (addNote && lead) {
        await saveLeadNote(lead.id, addNote);
      }

      res.set('Content-Type', 'text/xml');
      return res.status(200).send('<Response></Response>');
    }

    // Send the reply via Twilio and get back the MessageSid.
    const twilioMessage = await sendSMS(fromNumber, reply);

    if (conversation) {
      // Save the outbound reply — also updates lastAgentMessageAt.
      await saveSmsMessage(conversation.id, 'outbound', reply, twilioMessage.sid);

      // Persist AI conversation state update if provided.
      if (updateConversationState !== null && updateConversationState !== undefined) {
        await db
          .update(conversations)
          .set({ conversationState: updateConversationState })
          .where(eq(conversations.id, conversation.id));
      }
    }

    // If the lead is ready to book, update their status and create an urgent agent task.
    if (lead && readyToBook && lead.status !== 'ready') {
      await db
        .update(leads)
        .set({ status: 'ready' })
        .where(eq(leads.id, lead.id));

      await db.insert(leadTasks).values({
        leadId: lead.id,
        title: `${lead.name || 'Lead'} is ready to book an appointment — follow up now!`,
        dueDate: null,
      });

      console.log(`Lead ${lead.id} marked as ready to book.`);
    }

    // Persist note if GPT flagged one.
    if (lead && addNote) {
      await saveLeadNote(lead.id, addNote);
    }

    // Persist task if GPT flagged one.
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
