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
// Free-tier models occasionally accept a request and then never respond. Without a
// ceiling, one of those stalls a whole report.
//
// This default is deliberately generous: the longest shared-client call is
// geminiService's text-PDF parse at max_tokens 8000, which a slow free model can
// legitimately spend minutes on. Callers with a smaller budget pass a tighter
// per-request timeout instead (see ensembleRunner).
const REQUEST_TIMEOUT_MS = 180_000;

// The SDK retries timeouts, so its default of 2 would silently triple every ceiling
// above. Every caller here already loops over models and providers on failure, which
// recovers better than retrying the same stalled model — and agentRunner keeps its own
// explicit backoff for 429/5xx.
const MAX_SDK_RETRIES = 0;

function makeClient(apiKey, targetURL, extraHeaders = {}, heliconePathPrefix = '/v1') {
  if (!apiKey) return null;

  const heliconeKey = process.env.HELICONE_API_KEY;
  if (heliconeKey && targetURL) {
    return new OpenAI({
      apiKey,
      baseURL: `https://gateway.helicone.ai${heliconePathPrefix}`,
      timeout: REQUEST_TIMEOUT_MS,
      maxRetries: MAX_SDK_RETRIES,
      defaultHeaders: {
        'Helicone-Auth': `Bearer ${heliconeKey}`,
        'Helicone-Target-URL': targetURL,
        ...extraHeaders,
      },
    });
  }

  return new OpenAI({
    apiKey,
    baseURL: targetURL,
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: MAX_SDK_RETRIES,
    defaultHeaders: extraHeaders,
  });
}

// Lazily constructed so .env is read after dotenv.config() runs
let _providers = null;

function getProviders() {
  if (_providers) return _providers;
  const cerebrasClient = makeClient(process.env.CEREBRAS_API_KEY, 'https://api.cerebras.ai/v1');
  _providers = {
    // OpenAI — paid key, gpt-4o, used as dedicated judge + Phase 1 tool calls
    openai: {
      name: 'OpenAI gpt-4o',
      client: makeClient(process.env.OPENAI_API_KEY, 'https://api.openai.com/v1'),
      model: 'gpt-4o',
    },
    // Cerebras GPT-OSS 120B — fast free inference, RPM-limited.
    // (Old qwen-3-235b-a22b-instruct-2507 was retired → 404; gpt-oss-120b is the
    //  current production model, free-trial + PAYG, supports tool calling.)
    cerebras: {
      name: 'Cerebras GPT-OSS-120B',
      client: cerebrasClient,
      model: 'gpt-oss-120b',
    },
    // Groq — free, and by far the fastest of the free tiers: 0.5–0.9s for a 2000-token
    // medical JSON answer against 60–120s from the OpenRouter free models. Added
    // 2026-08-13 after SambaNova's free tier ended; the key had been sitting unused
    // and commented out in .env.
    // Helicone path prefix is '/openai/v1', not '/v1' — Groq's API lives under
    // /openai/v1 and the gateway keeps the request path while swapping the origin.
    // Verified end to end through the gateway, not assumed.
    groq: {
      name: 'Groq',
      client: makeClient(process.env.GROQ_API_KEY, 'https://api.groq.com/openai/v1', {}, '/openai/v1'),
      // Both slugs verified 2026-08-13: valid JSON in `content` (not reasoning_content),
      // and both drive the real medicalTools definitions via tool_calls.
      model: 'llama-3.3-70b-versatile',
      fallbackModels: ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b'],
      // gpt-oss-120b leads for analysis — same latency, markedly fuller output.
      analysisModels: ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile'],
    },
    // SambaNova — free tier ended. Every model 402s with balance_units: 0 and
    // PAYMENT_METHOD_REQUIRED, verified across all three keys on 2026-08-13. The model
    // ID below is current (it is listed by GET /v1/models); the account, not the model,
    // is what fails. Left last in every order in case billing is ever added.
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
            timeout: REQUEST_TIMEOUT_MS,
            maxRetries: MAX_SDK_RETRIES,
            defaultHeaders: {
              'HTTP-Referer': process.env.CLIENT_URL || 'http://localhost:5173',
              'X-Title': 'MedAssist AI CS595',
            },
          })
        : null,
      // Refreshed 2026-08-11: every previous slug (llama-3.1-8b, mistral-7b,
      // gemma-3, deepseek-v3) had lost its :free tier and 404'd, which took
      // OpenRouter out of the chain entirely. Verified against
      // GET /api/v1/models — keep this list in sync when models retire.
      // Tool-calling fallbacks (need function calling support)
      model: 'nvidia/nemotron-3-super-120b-a12b:free',
      fallbackModels: [
        'nvidia/nemotron-3-super-120b-a12b:free',
        'openai/gpt-oss-20b:free',
        'google/gemma-4-31b-it:free',
        // Below leak chain-of-thought into `content` — last resort only.
        'nvidia/nemotron-3-nano-30b-a3b:free',
        'nvidia/nemotron-nano-9b-v2:free',
      ],
      // Analysis-only models (no tool calling needed — bigger/stronger free models)
      // nemotron-3-ultra is still listed by GET /api/v1/models but its upstream
      // hangs and then drops the connection (ECONNRESET), so it sits below super
      // rather than first — leading with it cost ~2 min before every fallback.
      analysisModels: [
        'nvidia/nemotron-3-super-120b-a12b:free',
        'nvidia/nemotron-3-ultra-550b-a55b:free',
        'google/gemma-4-31b-it:free',
        'openai/gpt-oss-20b:free',
        'nvidia/nemotron-3-nano-30b-a3b:free',
      ],
    },
    // GitHub Models — RETIRED by GitHub (verified 2026-08-13): the old
    // models.inference.ai.azure.com endpoint 404s and the newer
    // models.github.ai/inference returns 410 "github_models_retirement_brownout".
    // Kept here only so the name resolves; it is absent from every priority order
    // below. Delete once GitHub confirms the retirement is permanent.
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

// 'github' appears in none of these orders — GitHub Models is retired (see above).
// SambaNova is kept last in each: its free tier 402s until a payment method is
// added, so it is only worth trying once everything else is exhausted.

// Ensemble agents — free models run in parallel (OpenAI excluded: it's the dedicated judge).
// Groq and Cerebras lead because they answer in about a second; OpenRouter's free models
// take 60–120s and were the reason a report took minutes.
const PRIORITY_ORDER = ['groq', 'cerebras', 'openrouter', 'sambanova'];

// Tool-calling — OpenAI first (paid, most reliable function calling), then the fast free
// tiers. Groq was checked against the real medicalTools definitions before being added.
const TOOL_PROVIDERS_ORDER = ['openai', 'groq', 'cerebras', 'sambanova'];

// Judge — OpenAI gpt-4o first (paid, independent from ensemble agents → best accuracy).
// Groq is deliberately absent: it now leads PRIORITY_ORDER, so judging here would have it
// merging its own output. OpenRouter backs OpenAI up instead, and with Groq and Cerebras
// filling the two agent slots it is usually not an agent — so the judge stays independent.
const JUDGE_PRIORITY_ORDER = ['openai', 'openrouter', 'sambanova'];

// Voice/lightweight order — Groq first (sub-second, and returns text in `content`, which
// these routes read directly).
const VOICE_PRIORITY_ORDER = ['groq', 'cerebras', 'openrouter', 'sambanova'];

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

/** Returns provider names that reliably support tool/function calling */
function getAvailableToolProviders() {
  return _filterAvailable(TOOL_PROVIDERS_ORDER);
}

/** Returns provider names for lightweight tasks (voice parsing, quick JSON extraction) */
function getAvailableVoiceProviders() {
  return _filterAvailable(VOICE_PRIORITY_ORDER);
}

/** Returns provider names for consensus judge — OpenAI first for highest accuracy */
function getAvailableJudgeProviders() {
  return _filterAvailable(JUDGE_PRIORITY_ORDER);
}

/** Best available tool-capable provider — skips ones already rate-limited */
function getPrimaryToolProvider() {
  const providers = getProviders();
  // Prefer non-limited tool providers
  const toolAvailable = getAvailableToolProviders().filter(name => !isProviderLimited(name));
  if (toolAvailable.length > 0) return providers[toolAvailable[0]];
  // All tool providers limited — fall back to any available provider
  const anyAvailable = getAvailableProviders().filter(name => !isProviderLimited(name));
  if (anyAvailable.length > 0) return providers[anyAvailable[0]];
  // Everything limited — return first configured provider and let it retry/fail gracefully
  const all = getAvailableProviders();
  if (all.length > 0) return providers[all[0]];
  throw new Error('No AI provider configured. Add CEREBRAS_API_KEY or GITHUB_TOKEN to your .env file.');
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

// ─── Shared rate-limit tracking ───────────────────────────────────────────────
// Used by both agentRunner and ensembleRunner so a 429 in Phase 1 prevents
// wasted retries in Phase 2 ensemble.

const _limitedProviders = new Map(); // name → { blockedAt, ttl }
const HARD_LIMIT_TTL_MS = 5 * 60 * 1000; // 5 min: daily/account quota exhausted
const RPM_LIMIT_TTL_MS  = 3 * 60 * 1000; // 3 min: per-minute RPM limit (prevents rapid re-retry)

function isProviderLimited(name) {
  const entry = _limitedProviders.get(name);
  if (!entry) return false;
  if (Date.now() - entry.blockedAt > entry.ttl) {
    _limitedProviders.delete(name);
    console.log(`[aiClients] Provider ${name} rate-limit TTL expired — will retry.`);
    return false;
  }
  return true;
}

function markProviderLimited(name, ttl = HARD_LIMIT_TTL_MS) {
  const now = Date.now();
  const providers = getProviders();
  const limitedClient = providers[name]?.client;
  // Also block any sibling provider sharing the same API key
  for (const [n, p] of Object.entries(providers)) {
    if (p.client === limitedClient) _limitedProviders.set(n, { blockedAt: now, ttl });
  }
  _limitedProviders.set(name, { blockedAt: now, ttl });
}

function markProviderLimitedRPM(name) {
  markProviderLimited(name, RPM_LIMIT_TTL_MS);
}

module.exports = {
  getProviders, getAvailableProviders, getAvailableToolProviders,
  getAvailableVoiceProviders, getAvailableJudgeProviders,
  getPrimaryProvider, getPrimaryToolProvider,
  isProviderLimited, markProviderLimited, markProviderLimitedRPM,
};
