const Groq = require('groq-sdk');

const MAX_TURNS = 10;
const MODEL = 'llama-3.3-70b-versatile';

/**
 * Shared Groq agentic loop (OpenAI-compatible tool calling).
 * @param {object} opts
 * @param {string}   opts.systemInstruction  - System prompt
 * @param {string}   opts.userMessage        - Initial user message
 * @param {Array}    opts.tools              - Tool definitions (OpenAI function format)
 * @param {object}   opts.toolHandlers       - { toolName: async fn(args) }
 * @param {Function} [opts.onStep]           - Called after each tool execution: fn(step)
 * @returns {{ text: string, steps: Array, turns: number }}
 */
async function runAgent({ systemInstruction, userMessage, tools, toolHandlers, onStep }) {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

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
    const response = await groq.chat.completions.create({
      model: MODEL,
      messages,
      tools: groqTools,
      tool_choice: 'auto',
      max_tokens: 4000,
    });

    const choice = response.choices[0];
    const message = choice.message;

    // Add assistant message to history
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

      // Add tool result to messages
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      });
    }
  }

  // MAX_TURNS exceeded
  return { text: 'Agent reached maximum reasoning steps.', steps, turns: MAX_TURNS };
}

module.exports = { runAgent, MAX_TURNS };
