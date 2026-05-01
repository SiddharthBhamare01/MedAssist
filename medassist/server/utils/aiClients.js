/**
 * aiClients.js — multi-provider AI client registry
 *
 * All providers expose the OpenAI-compatible chat.completions API so existing
 * agent code works without changes.
 *
 * Priority order (first key found in .env wins as primary):
 *   1. Cerebras   — fastest free inference, no monthly cap (RPM limited)
 *   2. SambaNova  — free, fast Llama 3.3 70B, no monthly cap
 *   3. OpenRouter — free :free models, no monthly cap
 *   4. GitHub     — free with any GitHub account PAT
 *
 * Helicone observability: set HELICONE_API_KEY in .env to proxy all calls
 * through Helicone's gateway and see live traces at helicone.ai/dashboard
 */

const OpenAI = require('openai');

/**
 * Build an OpenAI-compatible client.
 * If HELICONE_API_KEY is set, routes through Helicone gateway for observability.
 *
 * heliconePathPrefix: '/v1' for providers whose API paths include /v1 (Cerebras, SambaNova, OpenRouter)
 *                    ''    for providers whose paths don't include /v1 (GitHub Models)
 */
function makeClient(apiKey, targetURL, extraHeaders = {}, heliconePathPrefix = '/v1') {
  if (!apiKey) return null;

  const heliconeKey = process.env.HELICONE_API_KEY;
  if (heliconeKey && targetURL) {
    return new OpenAI({
      apiKey,
      baseURL: `https://gateway.helicone.ai${heliconePathPrefix}`,
      defaultHeaders: {
        'Helicone-Auth': `Bearer ${heliconeKey}`,
        'Helicone-Target-URL': targetURL,
        ...extraHeaders,
      },
    });
  }

  return new OpenAI({ apiKey, baseURL: targetURL, defaultHeaders: extraHeaders });
}

// Lazily constructed so .env is read after dotenv.config() runs
let _providers = null;

function getProviders() {
  if (_providers) return _providers;
  const cerebrasClient = makeClient(process.env.CEREBRAS_API_KEY, 'https://api.cerebras.ai/v1');
  _providers = {
    // Cerebras Qwen 235B — best model for medical reasoning, use as primary
    cerebras: {
      name: 'Cerebras Qwen-235B',
      client: cerebrasClient,
      model: 'qwen-3-235b-a22b-instruct-2507',
    },
    // SambaNova — free, OpenAI-compatible, no monthly cap
    sambanova: {
      name: 'SambaNova Llama-3.3-70B',
      client: makeClient(process.env.SAMBANOVA_API_KEY, 'https://api.sambanova.ai/v1'),
      model: 'Meta-Llama-3.3-70B-Instruct',
    },
    // OpenRouter — direct client (bypasses Helicone; Helicone gateway doesn't forward
    // Authorization header correctly to OpenRouter, causing silent 401s)
    openrouter: {
      name: 'OpenRouter',
      client: process.env.OPENROUTER_API_KEY
        ? new OpenAI({
            apiKey: process.env.OPENROUTER_API_KEY,
            baseURL: 'https://openrouter.ai/api/v1',
            defaultHeaders: {
              'HTTP-Referer': process.env.CLIENT_URL || 'http://localhost:5173',
              'X-Title': 'MedAssist AI CS595',
            },
          })
        : null,
      // Fallback model list — tried in order until one works
      model: 'google/gemma-3-12b-it:free',
      fallbackModels: [
        'google/gemma-3-12b-it:free',
        'google/gemma-3-27b-it:free',
        'meta-llama/llama-3.1-8b-instruct:free',
        'mistralai/mistral-7b-instruct:free',
        'google/gemma-3n-e4b-it:free',
        'google/gemma-3-4b-it:free',
      ],
    },
    // GitHub Models — gpt-4o-mini, needs PAT with models:read scope
    // Note: GitHub's endpoint has no /v1 prefix, so heliconePathPrefix = ''
    github: {
      name: 'GitHub gpt-4o-mini',
      client: makeClient(process.env.GITHUB_TOKEN, 'https://models.inference.ai.azure.com', {}, ''),
      model: 'gpt-4o-mini',
    },
  };

  const heliconeKey = process.env.HELICONE_API_KEY;
  if (heliconeKey) {
    console.log('[aiClients] Helicone observability enabled — traces at helicone.ai/dashboard');
  }

  return _providers;
}

// Default order — heavy reasoning tasks (diagnostic agents, blood report analysis)
const PRIORITY_ORDER = ['cerebras', 'sambanova', 'openrouter', 'github'];

// Voice/lightweight order — GitHub gpt-4o-mini first (generous rate limits, fast JSON extraction)
// Falls back to Cerebras only if GitHub is unavailable
const VOICE_PRIORITY_ORDER = ['github', 'cerebras', 'sambanova', 'openrouter'];

// Providers to exclude (set via EXCLUDED_AI_PROVIDERS env var, comma-separated)
const EXCLUDED_PROVIDERS = new Set(
  (process.env.EXCLUDED_AI_PROVIDERS || '').split(',').map((s) => s.trim()).filter(Boolean)
);

function _filterAvailable(order) {
  const providers = getProviders();
  return order.filter(
    (name) => providers[name]?.client != null && !EXCLUDED_PROVIDERS.has(name)
  );
}

/** Returns provider names for heavyweight tasks (agents), in priority order */
function getAvailableProviders() {
  return _filterAvailable(PRIORITY_ORDER);
}

/** Returns provider names for lightweight tasks (voice parsing, quick JSON extraction) */
function getAvailableVoiceProviders() {
  return _filterAvailable(VOICE_PRIORITY_ORDER);
}

/** Primary provider — first available key in .env */
function getPrimaryProvider() {
  const available = getAvailableProviders();
  if (available.length === 0) {
    throw new Error(
      'No AI provider configured. Add CEREBRAS_API_KEY or GITHUB_TOKEN to your .env file.'
    );
  }
  return getProviders()[available[0]];
}

module.exports = { getProviders, getAvailableProviders, getAvailableVoiceProviders, getPrimaryProvider };
