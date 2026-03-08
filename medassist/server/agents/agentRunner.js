const { client: defaultClient, MODEL } = require('../utils/aiClient');

const MAX_TURNS = 6;           // Each turn = 1 Groq API call; keep low to avoid RPM burnout
const INTER_TURN_DELAY_MS = 2000; // 2s between turns → max ~18 Groq calls/min per agent

/** Sleep for ms milliseconds */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Call AI with automatic retry on 429 rate-limit errors.
 */
async function groqCreateWithRetry(groq, params, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await groq.chat.completions.create(params);
    } catch (err) {
      const is429 = err.status === 429;
      if (is429 && attempt < maxRetries) {
        // Headers object (.get) or plain object ([]) — handle both
        const headers = err.headers;
        const retryAfterRaw =
          (typeof headers?.get === 'function' ? headers.get('retry-after') : null) ||
          headers?.['retry-after'] ||
          null;
        const retryAfterSec = retryAfterRaw ? parseInt(retryAfterRaw, 10) : null;
        // Exponential backoff if no retry-after: 5s, 10s, 20s, 30s
        const backoff = Math.min(5 * Math.pow(2, attempt), 30);
        const waitSec = retryAfterSec && retryAfterSec < 60 ? retryAfterSec + 1 : backoff;
        console.log(`[agentRunner] Rate limited (429). Waiting ${waitSec}s before retry ${attempt + 1}/${maxRetries}…`);
        await sleep(waitSec * 1000);
        continue;
      }
      throw err;
    }
  }
}

/**
 * Shared Groq agentic loop (OpenAI-compatible tool calling).
 * @param {object} opts
 * @param {string}   opts.systemInstruction  - System prompt
 * @param {string}   opts.userMessage        - Initial user message
 * @param {Array}    opts.tools              - Tool definitions (OpenAI function format)
 * @param {object}   opts.toolHandlers       - { toolName: async fn(args) }
 * @param {Function} [opts.onStep]           - Called after each tool execution: fn(step)
 * @param {number}   [opts.maxTokens]        - Max tokens per Groq call (default 2000)
 * @returns {{ text: string, steps: Array, turns: number }}
 */
async function runAgent({ systemInstruction, userMessage, tools, toolHandlers, onStep, maxTokens = 1500 }) {
  const groq = defaultClient;

  const messages = [
    { role: 'system', content: systemInstruction },
    { role: 'user', content: userMessage },
  ];

  const groqTools = tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: {
        type: 'object',
        properties: t.parameters.properties,
        required: t.parameters.required || [],
      },
    },
  }));

  const steps = [];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let response;
    try {
      response = await groqCreateWithRetry(groq, {
        model: MODEL,
        messages,
        tools: groqTools,
        tool_choice: 'auto',
        max_tokens: maxTokens,
      });
    } catch (err) {
      // tool_use_failed (400) — model generated malformed tool call JSON.
      // Recover: strip tools and make one final plain-text call so the model
      // can still write its answer using whatever it reasoned so far.
      if (err.status === 400 && err.error?.error?.code === 'tool_use_failed') {
        console.warn('[agentRunner] tool_use_failed — falling back to tool-free completion.');
        try {
          const fallback = await groqCreateWithRetry(groq, {
            model: MODEL,
            messages: [
              ...messages,
              {
                role: 'user',
                content: 'Please write your final answer now as a JSON array in a markdown code block, based on your reasoning so far. Do not attempt any more tool calls.',
              },
            ],
            max_tokens: maxTokens,
            // no tools — forces plain text response
          });
          const fallbackText = fallback.choices[0]?.message?.content || '';
          console.log('[agentRunner] Fallback completion succeeded.');
          return { text: fallbackText, steps, turns: turn + 1 };
        } catch (fallbackErr) {
          console.error('[agentRunner] Fallback completion also failed:', fallbackErr.message);
          return { text: '', steps, turns: turn + 1 };
        }
      }
      throw err;
    }

    const choice = response.choices[0];
    const message = choice.message;

    messages.push(message);

    // No tool calls — agent is done
    if (choice.finish_reason === 'stop' || !message.tool_calls?.length) {
      return { text: message.content || '', steps, turns: turn + 1 };
    }

    // Execute each tool call
    for (const toolCall of message.tool_calls) {
      const { name, arguments: argsStr } = toolCall.function;
      const step = { tool: name, timestamp: new Date().toISOString() };

      let args = {};
      try { args = JSON.parse(argsStr); } catch { args = {}; }
      step.args = args;

      const handler = toolHandlers[name];
      let result;
      if (!handler) {
        result = { error: `Unknown tool: ${name}` };
      } else {
        try {
          result = await handler(args);
        } catch (err) {
          result = { error: err.message };
        }
      }

      step.result = result;
      steps.push(step);
      if (onStep) onStep(step);

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      });
    }

    // Throttle between turns — Groq free tier: 30 RPM.
    // Waiting 2s here means at most ~30 Groq calls/min across all concurrent requests.
    await sleep(INTER_TURN_DELAY_MS);
  }

  // MAX_TURNS reached — make one final tool-free call to extract whatever answer the model has
  console.warn('[agentRunner] MAX_TURNS reached — requesting final tool-free completion.');
  try {
    const finalResponse = await groqCreateWithRetry(groq, {
      model: MODEL,
      messages: [
        ...messages,
        {
          role: 'user',
          content: 'You have completed your research. Now write your final answer as a JSON array or object in a markdown code block based on everything you have gathered. Do not call any more tools.',
        },
      ],
      max_tokens: maxTokens,
    });
    const finalText = finalResponse.choices[0]?.message?.content || '';
    return { text: finalText, steps, turns: MAX_TURNS };
  } catch (err) {
    console.error('[agentRunner] MAX_TURNS final completion failed:', err.message);
    return { text: '', steps, turns: MAX_TURNS };
  }
}

module.exports = { runAgent, MAX_TURNS };
