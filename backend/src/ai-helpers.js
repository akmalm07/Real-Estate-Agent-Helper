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
|   'sms'   — short conversational replies
|   'email' — detailed email replies with a subject line
|
| buildPrompt returns { messages, responseFormat } where responseFormat is
| a strict JSON schema object tailored to the mode.
|
| generateAiReply orchestrates the OpenAI call and parses the result.
|
| generateAiLeadScore scores a lead 0–30 using GPT-4o-mini behavioral analysis.
|
*/

export function isOptOut(message) {
  return message.trim().toLowerCase() === 'stop';
}

// ---------------------------------------------------------------------------
// Schema builders
// ---------------------------------------------------------------------------

/**
 * Returns the OpenAI `response_format` object for SMS replies.
 * Schema:
 *   {
 *     reply: string,
 *     addNote: string | null,
 *     addTask: { title: string, dueDate: string | null } | null,
 *     updateConversationState: { awaitingAnswer: boolean, pendingQuestion?: string, reason?: string } | null,
 *     readyToBook: boolean
 *   }
 */
function buildSmsResponseFormat() {
  return {
    type: 'json_schema',
    json_schema: {
      name: 'sms_reply',
      strict: true,
      schema: {
        type: 'object',
        properties: {
          reply: {
            type: 'string',
            description: 'The SMS message to send to the lead.',
          },
          addNote: {
            type: ['string', 'null'],
            description: 'A note to add to the lead record, or null if nothing important to log.',
          },
          addTask: {
            oneOf: [
              {
                type: 'object',
                properties: {
                  title: {
                    type: 'string',
                    description: 'Short task title for the agent.',
                  },
                  dueDate: {
                    type: ['string', 'null'],
                    description: 'ISO 8601 date string, or null if no specific due date.',
                  },
                },
                required: ['title', 'dueDate'],
                additionalProperties: false,
              },
              { type: 'null' },
            ],
            description: 'A follow-up task for the agent, or null if none needed.',
          },
          updateConversationState: {
            oneOf: [
              {
                type: 'object',
                properties: {
                  awaitingAnswer: {
                    type: 'boolean',
                    description: 'True if you asked the lead a question and are awaiting their reply.',
                  },
                  pendingQuestion: {
                    type: ['string', 'null'],
                    description: 'The question you asked, if awaitingAnswer is true.',
                  },
                  reason: {
                    type: ['string', 'null'],
                    description: 'Brief summary of why the lead is delayed or unavailable, if applicable.',
                  },
                },
                required: ['awaitingAnswer', 'pendingQuestion', 'reason'],
                additionalProperties: false,
              },
              { type: 'null' },
            ],
            description: 'Updated conversation state to persist, or null if nothing to track.',
          },
          readyToBook: {
            type: 'boolean',
            description: 'True only if the lead has clearly expressed they are ready to schedule a viewing or appointment.',
          },
        },
        required: ['reply', 'addNote', 'addTask', 'updateConversationState', 'readyToBook'],
        additionalProperties: false,
      },
    },
  };
}

/**
 * Returns the OpenAI `response_format` object for email replies.
 * Schema:
 *   {
 *     subject: string,
 *     body: string,
 *     addNote: string | null,
 *     addTask: { title: string, dueDate: string | null } | null,
 *     updateConversationState: { awaitingAnswer: boolean, pendingQuestion?: string, reason?: string } | null,
 *     readyToBook: boolean
 *   }
 */
function buildEmailResponseFormat() {
  return {
    type: 'json_schema',
    json_schema: {
      name: 'email_reply',
      strict: true,
      schema: {
        type: 'object',
        properties: {
          subject: {
            type: 'string',
            description: 'The email subject line. Prefix with "Re: " if replying to an existing thread.',
          },
          body: {
            type: 'string',
            description: 'The full email body to send to the lead.',
          },
          addNote: {
            type: ['string', 'null'],
            description: 'A note to add to the lead record, or null if nothing important to log.',
          },
          addTask: {
            oneOf: [
              {
                type: 'object',
                properties: {
                  title: {
                    type: 'string',
                    description: 'Short task title for the agent.',
                  },
                  dueDate: {
                    type: ['string', 'null'],
                    description: 'ISO 8601 date string, or null if no specific due date.',
                  },
                },
                required: ['title', 'dueDate'],
                additionalProperties: false,
              },
              { type: 'null' },
            ],
            description: 'A follow-up task for the agent, or null if none needed.',
          },
          updateConversationState: {
            oneOf: [
              {
                type: 'object',
                properties: {
                  awaitingAnswer: {
                    type: 'boolean',
                    description: 'True if you asked the lead a question and are awaiting their reply.',
                  },
                  pendingQuestion: {
                    type: ['string', 'null'],
                    description: 'The question you asked, if awaitingAnswer is true.',
                  },
                  reason: {
                    type: ['string', 'null'],
                    description: 'Brief summary of why the lead is delayed or unavailable, if applicable.',
                  },
                },
                required: ['awaitingAnswer', 'pendingQuestion', 'reason'],
                additionalProperties: false,
              },
              { type: 'null' },
            ],
            description: 'Updated conversation state to persist, or null if nothing to track.',
          },
          readyToBook: {
            type: 'boolean',
            description: 'True only if the lead has clearly expressed they are ready to schedule a viewing or appointment.',
          },
        },
        required: ['subject', 'body', 'addNote', 'addTask', 'updateConversationState', 'readyToBook'],
        additionalProperties: false,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// buildPrompt
// ---------------------------------------------------------------------------

/**
 * Builds the OpenAI messages array and the strict response_format schema.
 *
 * Parameters:
 *   mode:                'sms' | 'email'
 *   lead:                object | null
 *   conversation:        object | null
 *   inboundText:         string
 *   inboundSubject:      string | null  (email mode only)
 *   propertyDescription: string | null
 *   history:             Array
 *   notes:               Array
 *
 * Returns:
 *   { messages: Array, responseFormat: object }
 */
export function buildPrompt(mode, lead, conversation, inboundText, inboundSubject, propertyDescription, history, notes) {
  const leadName = lead?.name || null;
  const leadReference = leadName ? `named ${leadName}` : 'whose name is unknown';
  const leadSource = lead?.source || 'an unknown source';

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

  // Build conversation context section
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
- If you are asking the lead a question and need to remember it for next time, set awaitingAnswer to true and populate pendingQuestion.
- If the lead asked for space or gave a reason for delay, set awaitingAnswer to false and populate reason.
- If nothing notable needs to be tracked, return null.`;

  const sharedNoteTaskGuidelines = `
Guidelines for addNote:
- Add a note if the lead revealed something important (budget, timeline, preferences, concerns, etc.)
- Return null if the message was small talk or nothing noteworthy was said.

Guidelines for addTask:
- Create a task if the lead requested a callback, a showing, more info, or anything that requires agent follow-up.
- Return null if no agent action is required.

Guidelines for readyToBook:
- Set to true ONLY if the lead has clearly expressed they are ready to schedule a viewing, meeting, or appointment.
- Strong signals include: "I'd like to schedule a visit", "When can we meet?", "I'm ready to see the property", "Can we book a showing?", or similar direct expressions of readiness.
- Do NOT set to true for general interest, questions about the property, or vague positive responses.
- Set to false in all other cases.`;

  const smsOptOutGuideline = `
Opt-out instructions:
- If the lead expresses that they no longer want to be contacted, politely let them know they can reply with the word STOP to end all future messages.
- Do not end the conversation yourself — the system will automatically stop messaging them if they reply STOP.
- Never pressure the lead to stay in the conversation.`;

  let systemPrompt;

  if (mode === 'sms') {
    systemPrompt = `You are a friendly and professional real estate agent assistant communicating via SMS.
Keep replies short and conversational — this is SMS, not email.
Never make up property details. If you don't know something, say you'll follow up.
${sharedContext}

${smsOptOutGuideline}

${conversationStateGuideline}

${sharedNoteTaskGuidelines}`;
  } else {
    systemPrompt = `You are a friendly and professional real estate agent assistant communicating via email.
Write replies that are polite, clear, and appropriately detailed — this is email, not SMS.
Never make up property details. If you don't know something, say you'll follow up.
${sharedContext}

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

  // Add the new inbound message
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

  // Build the mode-specific strict response schema
  const responseFormat = mode === 'sms'
    ? buildSmsResponseFormat()
    : buildEmailResponseFormat();

  return { messages, responseFormat };
}

// ---------------------------------------------------------------------------
// generateAiReply
// ---------------------------------------------------------------------------

/**
 * Calls OpenAI and parses the structured JSON response.
 *
 * SMS mode returns:
 *   { reply, addNote, addTask, updateConversationState, readyToBook, optedOut }
 *
 * Email mode returns:
 *   { subject, body, addNote, addTask, updateConversationState, readyToBook }
 *
 * Parameters:
 *   mode:                'sms' | 'email'
 *   lead:                object | null
 *   conversation:        object | null
 *   inboundText:         string
 *   inboundSubject:      string | null
 *   propertyDescription: string | null
 *   history:             Array
 *   notes:               Array
 */
export async function generateAiReply(mode, lead, conversation, inboundText, inboundSubject, propertyDescription, history, notes) {
  // SMS opt-out: halt immediately if the lead replied exactly "STOP"
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

  const { messages, responseFormat } = buildPrompt(
    mode, lead, conversation, inboundText, inboundSubject, propertyDescription, history, notes
  );

  const maxTokens = mode === 'sms' ? 400 : 800;

  let parsed;
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      max_tokens: maxTokens,
      response_format: responseFormat,
    });

    const raw = completion.choices[0].message.content.trim();
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error(`Failed to call OpenAI or parse response (${mode}):`, err);

    // Graceful fallback
    if (mode === 'sms') {
      return { reply: null, addNote: null, addTask: null, updateConversationState: null, readyToBook: false, optedOut: false };
    } else {
      return { subject: inboundSubject || 'Re: Your Inquiry', body: null, addNote: null, addTask: null, updateConversationState: null, readyToBook: false };
    }
  }

  if (mode === 'sms') {
    return {
      reply:                   parsed.reply   ?? null,
      addNote:                 parsed.addNote ?? null,
      addTask:                 parsed.addTask ?? null,
      updateConversationState: parsed.updateConversationState ?? null,
      readyToBook:             parsed.readyToBook === true,
      optedOut:                false,
    };
  } else {
    return {
      subject:                 parsed.subject ?? inboundSubject ?? 'Re: Your Inquiry',
      body:                    parsed.body    ?? null,
      addNote:                 parsed.addNote ?? null,
      addTask:                 parsed.addTask ?? null,
      updateConversationState: parsed.updateConversationState ?? null,
      readyToBook:             parsed.readyToBook === true,
    };
  }
}

// ---------------------------------------------------------------------------
// generateAiLeadScore
// ---------------------------------------------------------------------------

/**
 * Uses GPT-4o-mini to assess a lead's behavior and intent, returning a score
 * from 0–30 and a short reasoning string.
 *
 * Parameters:
 *   lead:                object | null
 *   history:             Array
 *   notes:               Array<string>
 *   propertyDescription: string | null
 *
 * Returns:
 *   { score: number (0–30), reasoning: string }
 */
export async function generateAiLeadScore(lead, history, notes, propertyDescription) {
  const leadName   = lead?.name   || 'Unknown';
  const leadSource = lead?.source || 'Unknown';
  const leadStatus = lead?.status || 'Unknown';
  const isReferral = leadSource === 'referral';

  const historyText = history.length > 0
    ? history.map((m) => `[${m.direction}] ${m.body || ''}`).join('\n')
    : 'No conversation history.';

  const notesText = notes.length > 0
    ? notes.map((n, i) => `${i + 1}. ${n}`).join('\n')
    : 'No notes.';

  const propertyText = propertyDescription || 'No property linked.';

  const referralInstruction = isReferral
    ? `\nNOTE: This lead came in via a personal referral. Referral leads have an inherent trust advantage ` +
      `and higher baseline conversion likelihood. Weight this positively in your score.`
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
${referralInstruction}`;

  const userPrompt = `Lead name: ${leadName}
Lead source: ${leadSource}
Lead status: ${leadStatus}

Property of interest:
${propertyText}

Conversation history:
${historyText}

Agent notes:
${notesText}`;

  const scoreResponseFormat = {
    type: 'json_schema',
    json_schema: {
      name: 'lead_score',
      strict: true,
      schema: {
        type: 'object',
        properties: {
          score: {
            type: 'integer',
            description: 'Lead quality score from 0 to 30.',
          },
          reasoning: {
            type: 'string',
            description: 'One or two sentences explaining the score.',
          },
        },
        required: ['score', 'reasoning'],
        additionalProperties: false,
      },
    },
  };

  let parsed;
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt },
      ],
      max_tokens: 200,
      response_format: scoreResponseFormat,
    });

    const raw = completion.choices[0].message.content.trim();
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error('Failed to generate AI lead score:', err);
    return { score: 0, reasoning: 'AI scoring unavailable.' };
  }

  const score     = Math.min(30, Math.max(0, Math.round(parsed.score ?? 0)));
  const reasoning = parsed.reasoning || 'No reasoning provided.';

  return { score, reasoning };
}
