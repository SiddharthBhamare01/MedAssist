/**
 * ensembleMetrics.js — measures whether the multi-provider ensemble earns its cost.
 *
 * Phase 2 faculty review (Dr. Leibovitz, Aug 2026):
 *
 *   "The six-provider ensemble does not do what the pitch claims. Majority
 *    voting across correlated models reduces variance rather than systematic
 *    error, and it cannot produce determinism. Measure and report inter-provider
 *    disagreement rate and post-vote accuracy. If disagreement is low, the
 *    design pays six times the cost and latency for no benefit."
 *
 * This module answers the first half — the disagreement rate — from the
 * `agentOutputs` the ensemble already returns. Post-vote accuracy needs a
 * labelled set and is not attempted here.
 *
 * How disagreement is measured, and its limits:
 *
 *   Agent outputs are JSON documents, not single answers, so "did they agree?"
 *   has no single definition. We compute three views, cheapest first:
 *
 *     exact      — byte-identical after normalisation. Near-zero in practice;
 *                  useful only as proof that voting cannot produce determinism.
 *     structural — same set of leaf paths (which fields were populated).
 *     value      — per-leaf agreement on the values themselves, which is the
 *                  number that actually bears on accuracy.
 *
 *   Numbers are compared with a relative tolerance, since two providers writing
 *   9.1 and 9.10 agree. Free text is compared case- and whitespace-insensitively;
 *   prose that differs in wording but not meaning counts as disagreement, so the
 *   value-level figure is an UPPER bound on real disagreement. State that when
 *   reporting it.
 *
 * Pure functions, no network and no DB, so tests/ensemble/runDisagreement.js can
 * call them directly.
 */

const NUMERIC_TOLERANCE = 0.02;  // 2% relative — 9.1 vs 9.10 agree, 9.1 vs 12.0 do not

/** Parse an agent output into a comparable object, or null when it isn't JSON. */
function parseOutput(raw) {
  if (raw == null) return null;
  const text = String(raw).replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  try { return JSON.parse(text); } catch { /* fall through */ }
  const match = text.match(/[[{][\s\S]*[\]}]/);
  if (match) {
    try { return JSON.parse(match[0]); } catch { /* not recoverable */ }
  }
  return null;
}

/**
 * Flatten a parsed output to { 'a.b[0].c': primitive }.
 * Array indices are kept: two providers listing the same conditions in a
 * different order genuinely differ in what they put first, and for a ranked
 * output that difference is the thing under measurement.
 */
function flatten(value, prefix = '', out = {}) {
  if (value === null || value === undefined) {
    out[prefix || '.'] = null;
    return out;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) out[prefix || '.'] = '[]';
    value.forEach((v, i) => flatten(v, `${prefix}[${i}]`, out));
    return out;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 0) out[prefix || '.'] = '{}';
    for (const k of keys) flatten(value[k], prefix ? `${prefix}.${k}` : k, out);
    return out;
  }
  out[prefix || '.'] = value;
  return out;
}

/** Normalise a leaf for comparison. */
function normalizeLeaf(v) {
  if (typeof v === 'string') return v.trim().toLowerCase().replace(/\s+/g, ' ');
  return v;
}

/** True when two leaves agree, with numeric tolerance. */
function leavesAgree(a, b) {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) {
    if (na === nb) return true;
    const scale = Math.max(Math.abs(na), Math.abs(nb));
    if (scale === 0) return true;
    return Math.abs(na - nb) / scale <= NUMERIC_TOLERANCE;
  }
  return normalizeLeaf(a) === normalizeLeaf(b);
}

/**
 * Measure disagreement across one ensemble run.
 *
 * @param {Array<{providerName: string, output: string}>} agentOutputs
 * @returns {object|null} null when fewer than two providers produced output —
 *          there is nothing to disagree about, and reporting 0% would be a lie.
 */
function measureDisagreement(agentOutputs) {
  if (!Array.isArray(agentOutputs) || agentOutputs.length < 2) return null;

  const parsed = agentOutputs.map((a) => ({
    provider: a.providerName,
    obj: parseOutput(a.output),
    raw: String(a.output ?? ''),
  }));

  const usable = parsed.filter((p) => p.obj !== null);
  const unparseable = parsed.filter((p) => p.obj === null).map((p) => p.provider);

  if (usable.length < 2) {
    return {
      providers: parsed.map((p) => p.provider),
      provider_count: parsed.length,
      comparable: false,
      reason: 'Fewer than two providers returned parseable JSON',
      unparseable_providers: unparseable,
    };
  }

  // ── Exact ──────────────────────────────────────────────────────────────────
  const canonical = usable.map((p) => JSON.stringify(p.obj));
  const allExact = canonical.every((c) => c === canonical[0]);

  // ── Structural: which leaf paths each provider populated ───────────────────
  const flats = usable.map((p) => flatten(p.obj));
  const pathSets = flats.map((f) => new Set(Object.keys(f)));
  const allPaths = new Set(pathSets.flatMap((s) => [...s]));
  const sharedPaths = [...allPaths].filter((path) => pathSets.every((s) => s.has(path)));
  const structuralAgreement = allPaths.size === 0 ? 1 : sharedPaths.length / allPaths.size;

  // ── Value: per-shared-leaf unanimity ───────────────────────────────────────
  let unanimous = 0;
  const conflicts = [];
  for (const path of sharedPaths) {
    const values = flats.map((f) => f[path]);
    const agree = values.every((v) => leavesAgree(v, values[0]));
    if (agree) {
      unanimous += 1;
    } else {
      conflicts.push({
        path,
        values: usable.map((p, i) => ({
          provider: p.provider,
          value: typeof values[i] === 'string' && values[i].length > 80
            ? `${values[i].slice(0, 80)}…`
            : values[i],
        })),
      });
    }
  }
  const valueAgreement = sharedPaths.length === 0 ? 1 : unanimous / sharedPaths.length;

  return {
    providers: usable.map((p) => p.provider),
    provider_count: usable.length,
    comparable: true,
    unparseable_providers: unanimous >= 0 ? unparseable : unparseable,
    exact_match: allExact,
    structural_agreement: Number(structuralAgreement.toFixed(4)),
    value_agreement: Number(valueAgreement.toFixed(4)),
    // The headline number the review asks for.
    disagreement_rate: Number((1 - valueAgreement).toFixed(4)),
    shared_leaf_count: sharedPaths.length,
    total_leaf_count: allPaths.size,
    conflicting_leaf_count: conflicts.length,
    // Capped: this is diagnostic detail for a log line, not a full audit trail.
    sample_conflicts: conflicts.slice(0, 5),
  };
}

/** One-line log summary, or null when there was nothing to compare. */
function formatDisagreement(m, taskType) {
  if (!m) return null;
  if (!m.comparable) {
    return `[ensembleMetrics] ${taskType}: not comparable — ${m.reason}` +
      (m.unparseable_providers?.length ? ` (unparseable: ${m.unparseable_providers.join(', ')})` : '');
  }
  const pct = (n) => `${(n * 100).toFixed(1)}%`;
  return `[ensembleMetrics] ${taskType}: ${m.provider_count} providers, ` +
    `disagreement ${pct(m.disagreement_rate)} ` +
    `(${m.conflicting_leaf_count}/${m.shared_leaf_count} shared fields differ), ` +
    `structural agreement ${pct(m.structural_agreement)}, ` +
    `exact match ${m.exact_match ? 'yes' : 'no'}` +
    (m.unparseable_providers?.length ? `, unparseable: ${m.unparseable_providers.join(', ')}` : '');
}

module.exports = {
  measureDisagreement,
  formatDisagreement,
  parseOutput,
  flatten,
  leavesAgree,
  NUMERIC_TOLERANCE,
};
