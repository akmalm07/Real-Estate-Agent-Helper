//import dotenv from 'dotenv'
//dotenv.config();

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
|   'sms'   — short conversational replies, returns { reply, addNote, addTask, updateConversationState, readyToBook }
|   'email' — detailed email replies with a subject line, returns { subject, body, addNote, addTask, updateConversationState, readyToBook }
|
| Also exports:
|   generateAiLeadScore — scores a lead 0–30 using GPT-4o-mini behavioral analysis
|
*/
export function isOptOut(message) {
  return message.trim().toLowerCase() === 'stop';
}

/* Builds the OpenAI messages array with full context for either SMS or email.
 *
 * Parameters:
 *   mode:                'sms' | 'email'
 *   lead:                object | null — the lead record from the database
 *   conversation:        object | null — the conversation record from the database
 *   inboundText:         string        — the inbound message body
 *   inboundSubject:      string | null — subject line (email mode only)
 *   propertyDescription: string | null
 *   history:             Array         — prior messages from loadSmsHistory() or loadEmailHistory()
 *   notes:               Array         — lead note strings from loadLeadNotes()
 *
 * Returns:
 *   Array of OpenAI message objects
 */
export function buildPrompt(mode, lead, conversation, inboundText, inboundSubject, propertyDescription, history, notes) {
  const leadName = lead?.name || null;
  const leadReference = leadName ? `named ${leadName}` : 'whose name is unknown';
  const leadSource = lead?.source || 'an unknown source';

  // Referral leads are warm — they were personally referred and have higher trust/intent.
  // Give the AI explicit guidance so it greets them more personally and warmly.
  const isReferral = leadSource === 'referral';
  const referralGuidance = isReferral
    ? `\nIMPORTANT: This lead came in via a personal referral. They are a warm lead with an existing trust connection. ` +
      `Greet them especially warmly, acknowledge the referral relationship if possible, and treat them as a high-priority contact. ` +
      `Do not use generic cold-outreach language.`
    : '';

  const notesSection = notes.length > 0
    ? `Agent notes about this lead:\n${notes.map((n, i) => `  ${i + 1}. ${n}`).join('\n')}`
    : 'There are no existing notes about this lead.';

  const propertySection = propertyDescription
    ? `Here is a description of the property this lead is interested in:\n${propertyDescription}`
    : 'This lead is not currently linked to a specific property.';

  // Build conversation context section from the new schema fields
  let conversationContextLines = [];

  if (conversation) {
    const status = conversation.status || 'active';
    const unansweredFollowups = conversation.unansweredFollowups ?? 0;
    const doNotContactUntil = conversation.doNotContactUntil
      ? new Date(conversation.doNotContactUntil).toISOString()
      : null;
    const state = conversation.conversationState || null;

    conversationContextLines.push(`Conversation status: ${status}`);
    conversationContextLines.push(`Unanswered follow-ups sent so far: ${unansweredFollowups}`);

    if (doNotContactUntil) {
      conversationContextLines.push(`The lead asked not to be contacted until: ${doNotContactUntil}. Acknowledge this if relevant.`);
    }

    if (state) {
      if (state.awaitingAnswer && state.pendingQuestion) {
        conversationContextLines.push(`You previously asked the lead: "${state.pendingQuestion}" and are still awaiting their answer.`);
      }
      if (state.reason) {
        conversationContextLines.push(`Context note from previous interaction: ${state.reason}`);
      }
    }

    if (unansweredFollowups >= 2) {
      conversationContextLines.push(`This lead has not responded to ${unansweredFollowups} follow-up(s). Keep the tone warm but do not be pushy. Consider varying your approach.`);
    }
  }

  const conversationContext = conversationContextLines.length > 0
    ? `Conversation context:\n${conversationContextLines.map((l) => `  - ${l}`).join('\n')}`
    : '';

  const sharedContext = `
${propertySection}

You are communicating with a real estate lead ${leadReference}, who came from ${leadSource}.${referralGuidance}

${conversationContext}

${notesSection}`;

  const conversationStateGuideline = `
Guidelines for updateConversationState:
- If you are asking the lead a question and need to remember it for next time, set:
  { "awaitingAnswer": true, "pendingQuestion": "<your question>" }
- If the lead asked for space or gave a reason for delay, set:
  { "awaitingAnswer": false, "reason": "<brief summary of why>" }
- If nothing notable needs to be tracked, set to null.`;

  const sharedNoteTaskGuidelines = `
Guidelines for addNote:
- Add a note if the lead revealed something important (budget, timeline, preferences, concerns, etc.)
- Set to null if the message was small talk or nothing noteworthy was said.

Guidelines for addTask:
- Create a task if the lead requested a callback, a showing, more info, or anything that requires agent follow-up.
- Set to null if no agent action is required.

Guidelines for readyToBook:
- Set to true ONLY if the lead has clearly expressed they are ready to schedule a viewing, meeting, or appointment.
- Strong signals include: "I'd like to schedule a visit", "When can we meet?", "I'm ready to see the property", "Can we book a showing?", or similar direct expressions of readiness.
- Do NOT set to true for general interest, questions about the property, or vague positive responses.
- Set to false in all other cases.

You MUST always return valid JSON. Do not include any text outside the JSON object.`;

  const smsOptOutGuideline = `
Opt-out instructions:
- If the lead expresses that they no longer want to be contacted, do not want to continue the conversation, or asks to be left alone, politely let them know they can reply with the word STOP to end all future messages.
- Do not end the conversation yourself — the system will automatically stop messaging them if they reply STOP.
- Never pressure the lead to stay in the conversation.`;

  let systemPrompt;

  if (mode === 'sms') {
    systemPrompt = `You are a friendly and professional real estate agent assistant communicating via SMS.
Keep replies short and conversational — this is SMS, not email.
Never make up property details. If you don't know something, say you'll follow up.
${sharedContext}

${smsOptOutGuideline}

After reading the conversation and the new message, you must respond with a JSON object in this exact format:
{
  "reply": "<the SMS reply to send to the lead>",
  "addNote": "<a note to add to this lead's record, to help remember vital information, or null if nothing important to log>",
  "addTask": {
    "title": "<short task title for the agent>",
    "dueDate": "<ISO 8601 date string, or null if no specific due date>"
  } or null if no task is needed,
  "updateConversationState": { ... } or null,
  "readyToBook": true or false
}
${conversationStateGuideline}

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
  } or null if no task is needed,
  "updateConversationState": { ... } or null,
  "readyToBook": true or false
}

Guidelines for subject:
- If replying to an existing thread, prefix the original subject with "Re: " if not already present.
- If this is a new conversation, write a relevant subject line.
${conversationStateGuideline}

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
 *   { reply: string, addNote: string | null, addTask: { title: string, dueDate: string | null } | null, updateConversationState: object | null, readyToBook: boolean }
 *
 * Email mode returns:
 *   { subject: string, body: string, addNote: string | null, addTask: { title: string, dueDate: string | null } | null, updateConversationState: object | null, readyToBook: boolean }
 *
 * Parameters:
 *   mode:                'sms' | 'email'
 *   lead:                object | null
 *   conversation:        object | null — the conversation record from the database
 *   inboundText:         string        — the message body
 *   inboundSubject:      string | null — email subject (email mode only, pass null for sms)
 *   propertyDescription: string | null
 *   history:             Array
 *   notes:               Array
 *
 * Returns:
 *   object — shape depends on mode (see above)
 */
export async function generateAiReply(mode, lead, conversation, inboundText, inboundSubject, propertyDescription, history, notes) {
  // SMS opt-out: if the lead replied exactly "STOP" (case-INsensitive), halt immediately.
  // The caller is responsible for updating the conversation status to 'opted_out'.
  if (isOptOut(inboundText)) {
    if (mode === 'sms') {
      return {
        reply: null,
        addNote: 'Lead opted out by replying STOP.',
        addTask: null,
        updateConversationState: null,
        readyToBook: false,
        optedOut: true,
      };
    }
  }

  const messages = buildPrompt(mode, lead, conversation, inboundText, inboundSubject, propertyDescription, history, notes);

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
      return { reply: raw, addNote: null, addTask: null, updateConversationState: null, readyToBook: false };
    } else {
      return { subject: inboundSubject || 'Re: Your Inquiry', body: raw, addNote: null, addTask: null, updateConversationState: null, readyToBook: false };
    }
  }

  if (mode === 'sms') {
    return {
      reply: parsed.reply || ' ',
      addNote: parsed.addNote || null,
      addTask: parsed.addTask || null,
      updateConversationState: parsed.updateConversationState || null,
      readyToBook: parsed.readyToBook === true,
      optedOut: false,
    };
  } else {
    return {
      subject: parsed.subject || 'Re: Your Inquiry',
      body: parsed.body || '',
      addNote: parsed.addNote || null,
      addTask: parsed.addTask || null,
      updateConversationState: parsed.updateConversationState || null,
      readyToBook: parsed.readyToBook === true,
    };
  }
}

/* Uses GPT-4o-mini to assess a lead's behavior and intent, returning a score from 0–30
 * and a short reasoning string to display to the agent.
 *
 * This is criterion 1 of the lead scoring system and carries the most weight (30 of 100 pts).
 *
 * Parameters:
 *   lead:                object | null  — the lead record from the database
 *   history:             Array          — all messages for this lead (email or SMS)
 *   notes:               Array<string>  — lead note strings from loadLeadNotes()
 *   propertyDescription: string | null  — from loadPropertyDescription()
 *
 * Returns:
 *   { score: number (0–30), reasoning: string }
 */
export async function generateAiLeadScore(lead, history, notes, propertyDescription) {
  const leadName = lead?.name || 'Unknown';
  const leadSource = lead?.source || 'Unknown';
  const leadStatus = lead?.status || 'Unknown';
  const isReferral = leadSource === 'referral';

  const historyText = history.length > 0
    ? history
        .map((m) => `[${m.direction}] ${m.body || ''}`)
        .join('\n')
    : 'No conversation history.';

  const notesText = notes.length > 0
    ? notes.map((n, i) => `${i + 1}. ${n}`).join('\n')
    : 'No notes.';

  const propertyText = propertyDescription || 'No property linked.';

  // Referral leads start with an inherent trust advantage — instruct the AI
  // to weight this positively when scoring, consistent with scoreLeadSource()
  // returning 8 pts (the highest source score) for referrals.
  const referralInstruction = isReferral
    ? `\nNOTE: This lead came in via a personal referral. Referral leads have an inherent trust advantage ` +
      `and higher baseline conversion likelihood. Weight this positively in your score — ` +
      `all else being equal, a referral lead should score higher than a cold lead with the same engagement level.`
    : '';

  const systemPrompt = `You are an expert real estate lead analyst.
You will be given information about a lead and their conversation history.
Your job is to assess the lead's overall quality, intent, and likelihood to convert, and assign a score from 0 to 30.

Scoring guide:
   0–6:  Very low intent, unresponsive, or clearly not interested.
   7–12: Low intent, minimal engagement, vague interest.
  13–18: Moderate intent, some engagement, unclear timeline.
  19–24: High intent, responsive, clear interest in a property.
  25–30: Very high intent, actively engaged, strong buying signals.
${referralInstruction}

You MUST respond with a JSON object in this exact format:
{
  "score": <integer from 0 to 30>,
  "reasoning": "<one or two sentences explaining the score>"
}

Do not include any text outside the JSON object.`;

  const userPrompt = `Lead name: ${leadName}
Lead source: ${leadSource}
Lead status: ${leadStatus}

Property of interest:
${propertyText}

Conversation history:
${historyText}

Agent notes:
${notesText}`;

  let parsed;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-o4-mini', // stronger reasoning model
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 200,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0].message.content.trim();
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error('Failed to generate AI lead score:', err);
    return { score: 0, reasoning: 'AI scoring unavailable.' };
  }

  const score = Math.min(30, Math.max(0, Math.round(parsed.score ?? 0)));
  const reasoning = parsed.reasoning || 'No reasoning provided.';

  return { score, reasoning };
}
