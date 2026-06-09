import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/*
|--------------------------------------------------------------------------
| Shared AI Helpers
|--------------------------------------------------------------------------
|
| Supports two modes:
|   'sms'   — short conversational replies, returns { reply, addNote, addTask }
|   'email' — detailed email replies with a subject line, returns { subject, body, addNote, addTask }
|
*/

/* Builds the OpenAI messages array with full context for either SMS or email.
 *
 * Parameters:
 *   mode:                'sms' | 'email'
 *   lead:                object | null — the lead record from the database
 *   inboundText:         string        — the inbound message body
 *   inboundSubject:      string | null — subject line (email mode only)
 *   propertyDescription: string | null
 *   history:             Array         — prior messages from loadSmsHistory() or loadEmailHistory()
 *   notes:               Array         — lead note strings from loadLeadNotes()
 *
 * Returns:
 *   Array of OpenAI message objects
 */
export function buildPrompt(mode, lead, inboundText, inboundSubject, propertyDescription, history, notes) {
  const leadName = lead?.name || null;
  const leadReference = leadName ? `named ${leadName}` : 'whose name is unknown';
  const leadSource = lead?.source || 'an unknown source';
  const leadStatus = lead?.status || 'unknown';

  const notesSection = notes.length > 0
    ? `Agent notes about this lead:\n${notes.map((n, i) => `  ${i + 1}. ${n}`).join('\n')}`
    : 'There are no existing notes about this lead.';

  const propertySection = propertyDescription
    ? `Here is a description of the property this lead is interested in:\n${propertyDescription}`
    : 'This lead is not currently linked to a specific property.';

  const sharedContext = `
${propertySection}

You are communicating with a real estate lead ${leadReference}, who came from ${leadSource}. Their current status is: ${leadStatus}.

${notesSection}`;

  const sharedNoteTaskGuidelines = `
Guidelines for addNote:
- Add a note if the lead revealed something important (budget, timeline, preferences, concerns, etc.)
- Set to null if the message was small talk or nothing noteworthy was said.

Guidelines for addTask:
- Create a task if the lead requested a callback, a showing, more info, or anything that requires agent follow-up.
- Set to null if no agent action is required.

You MUST always return valid JSON. Do not include any text outside the JSON object.`;

  let systemPrompt;

  if (mode === 'sms') {
    systemPrompt = `You are a friendly and professional real estate agent assistant communicating via SMS.
Keep replies short and conversational — this is SMS, not email.
Never make up property details. If you don't know something, say you'll follow up.
${sharedContext}

After reading the conversation and the new message, you must respond with a JSON object in this exact format:
{
  "reply": "<the SMS reply to send to the lead>",
  "addNote": "<a note to add to this lead's record, to help remember vital information, or null if nothing important to log>",
  "addTask": {
    "title": "<short task title for the agent>",
    "dueDate": "<ISO 8601 date string, or null if no specific due date>"
  } or null if no task is needed
}
${sharedNoteTaskGuidelines}`;
  } else {
    systemPrompt = `You are a friendly and professional real estate agent assistant communicating via email.
Write replies that are polite, clear, and appropriately detailed — this is email, not SMS.
Never make up property details. If you don't know something, say you'll follow up.
${sharedContext}

After reading the conversation and the new message, you must respond with a JSON object in this exact format:
{
  "subject": "<the email subject line to use for the reply>",
  "body": "<the full email body to send to the lead>",
  "addNote": "<a note to add to this lead's record to help remember vital information, or null if nothing important to log>",
  "addTask": {
    "title": "<short task title for the agent>",
    "dueDate": "<ISO 8601 date string, or null if no specific due date>"
  } or null if no task is needed
}

Guidelines for subject:
- If replying to an existing thread, prefix the original subject with "Re: " if not already present.
- If this is a new conversation, write a relevant subject line.
${sharedNoteTaskGuidelines}`;
  }

  const messages = [
    { role: 'system', content: systemPrompt },
  ];

  // Inject prior history as alternating user/assistant messages
  for (const message of history) {
    messages.push({
      role: message.direction === 'inbound' ? 'user' : 'assistant',
      content: message.body || '',
    });
  }

  // Add the new inbound message — prefix with subject line in email mode if available
  if (mode === 'email' && inboundSubject) {
    messages.push({
      role: 'user',
      content: `Subject: ${inboundSubject}\n\n${inboundText}`,
    });
  } else {
    messages.push({
      role: 'user',
      content: inboundText,
    });
  }

  return messages;
}

/* Calls OpenAI GPT-4o-mini and parses the structured JSON response.
 *
 * SMS mode returns:
 *   { reply: string, addNote: string | null, addTask: { title: string, dueDate: string | null } | null }
 *
 * Email mode returns:
 *   { subject: string, body: string, addNote: string | null, addTask: { title: string, dueDate: string | null } | null }
 *
 * Parameters:
 *   mode:                'sms' | 'email'
 *   lead:                object | null
 *   inboundText:         string        — the message body
 *   inboundSubject:      string | null — email subject (email mode only, pass null for sms)
 *   propertyDescription: string | null
 *   history:             Array
 *   notes:               Array
 *
 * Returns:
 *   object — shape depends on mode (see above)
 */
export async function generateAiReply(mode, lead, inboundText, inboundSubject, propertyDescription, history, notes) {
  const messages = buildPrompt(mode, lead, inboundText, inboundSubject, propertyDescription, history, notes);

  const maxTokens = mode === 'sms' ? 400 : 800;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    max_tokens: maxTokens,
    response_format: { type: 'json_object' },
  });

  const raw = completion.choices[0].message.content.trim();

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error(`Failed to parse GPT JSON response (${mode}):`, raw);

    if (mode === 'sms') {
      return { reply: raw, addNote: null, addTask: null };
    } else {
      return { subject: inboundSubject || 'Re: Your Inquiry', body: raw, addNote: null, addTask: null };
    }
  }

  if (mode === 'sms') {
    return {
      reply: parsed.reply || ' ',
      addNote: parsed.addNote || null,
      addTask: parsed.addTask || null,
    };
  } else {
    return {
      subject: parsed.subject || 'Re: Your Inquiry',
      body: parsed.body || '',
      addNote: parsed.addNote || null,
      addTask: parsed.addTask || null,
    };
  }
}
