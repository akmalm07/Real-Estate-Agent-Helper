import twilio from 'twilio';
import express from 'express';
import { db } from '../db/index.js';
import { leads, conversations, leadTasks, users, userOnboarding } from '../db/schema.js';
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

/* Returns an empty TwiML response. Twilio requires a 200 with a TwiML body
 * (or no body) — we always reply via REST API instead of TwiML, so this is
 * just the acknowledgement.
 */
function respondEmpty(res) {
  res.set('Content-Type', 'text/xml');
  return res.status(200).send('<Response></Response>');
}

/* This route is called by Twilio when an inbound SMS is received on your
 * Twilio phone number. It validates the request is from Twilio, looks up
 * the sender in the leads database by phone number, loads conversation
 * history and lead notes, generates a structured AI reply using GPT-4o-mini,
 * saves both the inbound and outbound messages to the database,
 * sends the reply back via SMS, and optionally writes a new lead note or
 * lead task to the database based on the AI's recommendation.
 *
 * Early-exits (no AI reply, no SMS sent):
 *   - Request signature is invalid                          → 403
 *   - Sender phone is not a known lead                      → 200 (empty TwiML)
 *   - Lead has aiEnabled = false (agent is handling manually) → 200 (empty TwiML)
 *   - Conversation status is not 'active'                   → 200 (empty TwiML)
 *   - AI returns reply: null (transient failure)            → 200 (empty TwiML)
 *
 * Side Effects (only when all gates pass):
 *   - Saves the inbound SMS to the sms table
 *   - Updates lastLeadMessageAt and resets unansweredFollowups
 *   - Sends an outbound SMS reply via Twilio REST API
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

    // Gate 1: Unknown sender — do not generate an AI reply.
    if (!lead) {
      console.warn(`Inbound SMS from unknown number: ${fromNumber} — ignoring.`);
      return respondEmpty(res);
    }

    // Gate 2: Agent has disabled AI for this lead — do not auto-reply.
    if (lead.aiEnabled === false) {
      console.log(`Lead ${lead.id} has aiEnabled=false — skipping auto-reply.`);
      return respondEmpty(res);
    }

    // Find or create the SMS conversation record — returns the full conversation record.
    // The signature is (leadId, leadPhone) — `fromNumber` is the lead's phone here.
    const conversation = await findOrCreateSmsConversation(lead.id, fromNumber);

    // Gate 3: Conversation is not active (e.g. converted, cold, opted_out).
    if (conversation.status !== 'active') {
      console.log(`Conversation ${conversation.id} status=${conversation.status} — skipping auto-reply.`);
      return respondEmpty(res);
    }

    // Save the inbound message — also updates lastLeadMessageAt and resets unansweredFollowups.
    await saveSmsMessage(conversation.id, 'inbound', inboundText, inboundMessageSid);

    // Load conversation history, notes, property description, and agent info.
    const [history, notes, propertyDescription, agent, onboarding] = await Promise.all([
      loadSmsHistory(lead.id),
      loadLeadNotes(lead.id),
      loadPropertyDescription(lead.id),
      db.select().from(users).where(eq(users.id, lead.userId)).limit(1),
      db.select().from(userOnboarding).where(eq(userOnboarding.userId, lead.userId)).limit(1),
    ]);

    const agentInfo = (agent && agent.length > 0)
      ? {
          name:      agent[0].name,
          email:     agent[0].email,
          phone:     agent[0].phone || null,
          brokerage: (onboarding && onboarding.length > 0) ? onboarding[0].brokerage : null,
        }
      : null;

    // Generate the AI reply — pass the full conversation record for context.
    const { reply, addNote, addTask, updateConversationState, readyToBook, optedOut } = await generateSmsReply(
      lead,
      conversation,
      inboundText,
      propertyDescription,
      history,
      notes,
      agentInfo,
    );

    // If the lead opted out, update the conversation status and stop — do not send a reply.
    if (optedOut) {
      await db
        .update(conversations)
        .set({ status: 'opted_out' })
        .where(eq(conversations.id, conversation.id));

      if (addNote) {
        await saveLeadNote(lead.id, addNote);
      }

      return respondEmpty(res);
    }

    // Gate 4: AI failure produced no reply — do not send a null/empty message.
    if (!reply) {
      console.warn(`AI returned null reply for lead ${lead.id} — skipping send.`);
      return respondEmpty(res);
    }

    // Send the reply via Twilio and get back the MessageSid.
    const twilioMessage = await sendSMS(fromNumber, reply);

    // Save the outbound reply — also updates lastAgentMessageAt.
    await saveSmsMessage(conversation.id, 'outbound', reply, twilioMessage.sid);

    // Persist AI conversation state update if provided.
    if (updateConversationState !== null && updateConversationState !== undefined) {
      await db
        .update(conversations)
        .set({ conversationState: updateConversationState })
        .where(eq(conversations.id, conversation.id));
    }

    // If the lead is ready to book, update their status and create an urgent agent task.
    if (readyToBook && lead.status !== 'ready') {
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
    if (addNote) {
      await saveLeadNote(lead.id, addNote);
    }

    // Persist task if GPT flagged one.
    if (addTask?.title) {
      await saveLeadTask(lead.id, addTask.title, addTask.dueDate || null);
    }

    return respondEmpty(res);

  } catch (err) {
    console.error('SMS webhook error:', err);
    return res.status(500).send('Internal Server Error');
  }
});

export default router;
