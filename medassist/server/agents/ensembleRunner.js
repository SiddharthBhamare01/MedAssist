/**
 * ensembleRunner.js
 *
 * Runs the same prompt on all configured AI providers in parallel, then uses a
 * "consensus judge" call to merge the outputs into a single higher-accuracy result.
 *
 * Usage:
 *   const { runEnsembleWithConsensus } = require('./ensembleRunner');
 *   const { consensusRaw, agentCount, agentOutputs } = await runEnsembleWithConsensus(
 *     systemPrompt, userMessage, 'disease_diagnosis'
 *   );
 */

const { getProviders, getAvailableProviders, getPrimaryProvider } = require('../utils/aiClients');

// ─── Low-level helpers ────────────────────────────────────────────────────────

async function callProvider(provider, systemPrompt, userMessage, maxTokens = 2000) {
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: userMessage });

  // If provider has fallback models, try each in order until one works
  const modelsToTry = provider.fallbackModels || [provider.model];

  let lastErr;
  for (const model of modelsToTry) {
    try {
      const response = await provider.client.chat.completions.create({
        model,
        messages,
        temperature: 0.2,
        max_tokens: maxTokens,
      });
      const msg = response.choices[0]?.message;
      // Some models (reasoning/thinking) put output in reasoning_content with null content
      const text = msg?.content || msg?.reasoning_content || '';
      if (!text) {
        const noContentErr = new Error(`${provider.name} model ${model} returned empty content`);
        noContentErr.status = 400;
        throw noContentErr;
      }
      if (model !== provider.model) {
        console.log(`[ensembleRunner] ${provider.name}: using fallback model ${model}`);
      }
      return text.trim();
    } catch (err) {
      // 429 = overloaded, 404 = model unavailable, 400 = provider error — try next model
      if (err.status === 429 || err.status === 404 || err.status === 400) {
        lastErr = err;
        continue;
      }
      throw err; // non-retryable error
    }
  }
  // All models exhausted — throw with clean message (not the raw API error object)
  const exhaustedErr = new Error(`${provider.name}: all ${modelsToTry.length} models unavailable (${lastErr?.status})`);
  exhaustedErr.status = lastErr?.status;
  throw exhaustedErr;
}

// ─── Consensus task instructions ─────────────────────────────────────────────

const TASK_INSTRUCTIONS = {
  disease_diagnosis: `
Compare the disease diagnosis lists from each agent.
- Diseases predicted by 2+ agents: assign confidence 0.8–1.0
- Diseases predicted by only 1 agent: assign confidence 0.4–0.6
- Merge into a single ranked JSON array of top 5 diseases (highest confidence first)
- Add "consensus_count" (how many agents predicted it) and "confidence" (0–1) fields to each item
- Keep all original fields: disease, icd_code, icd_description, probability, description, matched_symptoms, reasoning
- Return ONLY the JSON array, no markdown fences`,

  blood_analysis: `
Compare the medical analyses from each agent.
- Where agents agree, use the consensus value
- For conflicts, prefer the more conservative/safer medical recommendation
- Merge into one comprehensive JSON object preserving all sections
- Add a "consensus_note" field to each top-level section indicating agreement level (high/medium/low)
- Return ONLY the JSON object, no markdown fences`,

  test_recommendations: `
Compare blood test recommendation lists from each agent.
- Tests recommended by 2+ agents are high priority — keep them all
- Tests from only 1 agent: include if clinically important, mark with lower urgency
- Deduplicate (same test with different names counts as one — be fuzzy)
- Return a single JSON array sorted by how many agents recommended each test
- Add "consensus_count" field to each item
- Return ONLY the JSON array, no markdown fences`,
};

// ─── Core functions ───────────────────────────────────────────────────────────

/**
 * Run the same prompt on all available providers in parallel.
 * Returns array of { provider, providerName, output } for successful calls.
 */
async function runParallel(systemPrompt, userMessage, maxTokens = 2000) {
  const available = getAvailableProviders();
  if (available.length === 0) throw new Error('No AI providers configured');

  const providers = getProviders();

  const results = await Promise.allSettled(
    available.map(async (name) => {
      const provider = providers[name];
      const output = await callProvider(provider, systemPrompt, userMessage, maxTokens);
      return { provider: name, providerName: provider.name, output };
    })
  );

  const successful = results
    .filter((r) => r.status === 'fulfilled')
    .map((r) => r.value);

  // Map failures back to provider names using index into available[]
  const failed = results
    .map((r, i) => ({ status: r.status, provider: available[i], error: r.reason?.message }))
    .filter((r) => r.status === 'rejected');

  if (failed.length > 0) {
    // Info-level only — app works fine with remaining providers
    console.log(
      '[ensembleRunner] Skipped (overloaded):',
      failed.map((f) => f.provider).join(', ')
    );
  }

  if (successful.length === 0) throw new Error('All AI providers failed in ensemble run');
  return successful;
}

/**
 * Run a consensus/judge call to merge multiple agent outputs.
 */
async function runConsensus(agentOutputs, taskType) {
  const primary = getPrimaryProvider();
  const instruction = TASK_INSTRUCTIONS[taskType] || 'Merge the outputs, preferring items that appear in multiple outputs. Return ONLY JSON.';

  const judgePrompt = `You are a medical AI consensus judge.
${agentOutputs.length} independent AI agents analyzed the same medical case.
Your job: compare their outputs and produce one merged, higher-accuracy result.

${instruction}

--- Agent outputs ---
${agentOutputs.map((a, i) => `=== Agent ${i + 1} (${a.providerName}) ===\n${a.output}`).join('\n\n')}`;

  const raw = await callProvider(primary, '', judgePrompt, 3000);
  const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  return clean;
}

/**
 * Main export: run ensemble (parallel + consensus).
 *
 * If only 1 provider is available, skips consensus and returns that output directly.
 * Returns: { consensusRaw, agentCount, agentOutputs }
 */
async function runEnsembleWithConsensus(systemPrompt, userMessage, taskType, maxTokens = 2000) {
  const agentOutputs = await runParallel(systemPrompt, userMessage, maxTokens);

  // Single provider — no consensus needed
  if (agentOutputs.length === 1) {
    console.log(`[ensembleRunner] Single provider (${agentOutputs[0].providerName}) — skipping consensus`);
    const clean = agentOutputs[0].output
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();
    return { consensusRaw: clean, agentCount: 1, agentOutputs };
  }

  console.log(`[ensembleRunner] Running consensus across ${agentOutputs.length} providers: ${agentOutputs.map((a) => a.providerName).join(', ')}`);
  const consensusRaw = await runConsensus(agentOutputs, taskType);

  return { consensusRaw, agentCount: agentOutputs.length, agentOutputs };
}

module.exports = { runParallel, runConsensus, runEnsembleWithConsensus };
