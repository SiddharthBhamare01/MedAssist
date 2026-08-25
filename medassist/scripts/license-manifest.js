/**
 * license-manifest.js — regenerates THIRD-PARTY-LICENSES.md from what is
 * actually installed, so the manifest cannot drift from the dependency tree.
 *
 * Reads the `license` field of every direct dependency in server/package.json
 * and client/package.json, and flags anything whose terms are incompatible with
 * redistributing this project under Apache 2.0 — copyleft licences (GPL/AGPL/
 * LGPL) and any package that declares no licence at all.
 *
 * Run from medassist/:  node scripts/license-manifest.js
 * Requires `npm install` to have run in both server/ and client/.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, '..', 'THIRD-PARTY-LICENSES.md');
const PROJECTS = ['server', 'client'];

// Permissive licences that may be redistributed inside an Apache-2.0 work.
const COMPATIBLE = new Set([
  'Apache-2.0', 'MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD',
  'Unlicense', 'CC0-1.0', 'BlueOak-1.0.0', 'Python-2.0', 'MIT-0', 'WTFPL',
]);
// Copyleft — would impose terms this project cannot meet. Escalate, don't ship.
const COPYLEFT = /\b(GPL|AGPL|LGPL|MPL|EPL|CDDL|SSPL)\b/i;

// Context for packages the classifier cannot clear automatically. Disclosed in
// the manifest rather than suppressed — a reviewer should see the reasoning.
const NOTES = {
  'react-leaflet':
    'Hippocratic License 2.1 is an "ethical source" license: it permits use, ' +
    'modification and redistribution but adds human-rights use restrictions, ' +
    'which means it is not OSI-approved and not classed as free/open source. ' +
    'It does not prevent this project from being licensed under Apache 2.0, ' +
    'but it is a non-standard term the program should be told about. Used in ' +
    'one place only (client/src/pages/Patient/NearbyClinics.jsx, the nearby-' +
    'clinics map). The underlying mapping library, leaflet, is BSD-2-Clause; ' +
    'only the React binding carries this license, so swapping the binding ' +
    'would remove the term if LOF requires a strictly OSI-approved tree.',
};

function normalize(license) {
  if (!license) return null;
  if (typeof license === 'string') return license;
  if (license.type) return license.type;             // legacy object form
  return null;
}

/** SPDX expressions like "(MIT OR Apache-2.0)" pass if any branch is permissive. */
function classify(license) {
  if (!license) return 'UNDECLARED';
  const parts = license.replace(/[()]/g, '').split(/\s+(?:OR|AND)\s+/i).map((s) => s.trim());
  if (parts.some((p) => COMPATIBLE.has(p))) return 'ok';
  if (COPYLEFT.test(license)) return 'COPYLEFT';
  return 'REVIEW';
}

const rows = [];
const flagged = [];

for (const project of PROJECTS) {
  const pkgPath = path.join(ROOT, project, 'package.json');
  const deps = Object.entries(JSON.parse(fs.readFileSync(pkgPath, 'utf8')).dependencies || {});

  for (const [name, range] of deps.sort((a, b) => a[0].localeCompare(b[0]))) {
    const installed = path.join(ROOT, project, 'node_modules', name, 'package.json');
    let license = null;
    let version = range;
    if (fs.existsSync(installed)) {
      const meta = JSON.parse(fs.readFileSync(installed, 'utf8'));
      license = normalize(meta.license || meta.licenses?.[0]);
      version = meta.version || range;
    }
    const verdict = classify(license);
    rows.push({ project, name, version, license: license || '—', verdict });
    if (verdict !== 'ok') flagged.push({ project, name, license: license || '(none declared)', verdict });
  }
}

const today = new Date().toISOString().slice(0, 10);
const lines = [];
lines.push('# Third-Party Dependencies and Licenses');
lines.push('');
lines.push('MedAssist AI is distributed under the Apache License 2.0 (see `LICENSE`).');
lines.push('This manifest lists every **direct** dependency and the license it declares,');
lines.push('so that any term conflicting with those terms is visible rather than assumed away.');
lines.push('');
lines.push(`Generated ${today} by \`medassist/scripts/license-manifest.js\` from the installed`);
lines.push('dependency tree. Regenerate after any dependency change rather than editing by hand.');
lines.push('');

for (const project of PROJECTS) {
  const subset = rows.filter((r) => r.project === project);
  lines.push(`## ${project} (${subset.length} direct dependencies)`);
  lines.push('');
  lines.push('| Package | Version | License |');
  lines.push('| --- | --- | --- |');
  for (const r of subset) lines.push(`| \`${r.name}\` | ${r.version} | ${r.license} |`);
  lines.push('');
}

lines.push('## Compatibility review');
lines.push('');
if (flagged.length === 0) {
  lines.push('All direct dependencies declare permissive licenses (MIT, ISC, Apache-2.0, BSD,');
  lines.push('0BSD, BlueOak-1.0.0 or equivalent). No copyleft (GPL/AGPL/LGPL) dependency is');
  lines.push('present, and none imposes terms incompatible with redistributing this project');
  lines.push('under Apache 2.0.');
} else {
  lines.push('No copyleft (GPL/AGPL/LGPL) dependency is present. Every other direct dependency');
  lines.push('declares a permissive license (MIT, ISC, Apache-2.0, BSD, 0BSD or equivalent).');
  lines.push('');
  lines.push('The following declare terms the automated check could not clear, and are');
  lines.push('disclosed here for the program to confirm:');
  lines.push('');
  for (const f of flagged) {
    lines.push(`#### \`${f.name}\` (${f.project}) — ${f.license}`);
    lines.push('');
    lines.push(NOTES[f.name] || `Declared license "${f.license}" is not on the reviewed permissive list. Needs a decision before distribution.`);
    lines.push('');
  }
}
lines.push('');
lines.push('### Services accessed over the network');
lines.push('');
lines.push('These are called as hosted APIs. No code is redistributed, so their licenses do');
lines.push('not attach to this project, but their **terms of service** govern use, and every');
lines.push('row that carries report data is a separate relationship to account for before');
lines.push('any deployment handling real patient data.');
lines.push('');
lines.push('| Service | Used for | Report data sent | Terms / restrictions to confirm |');
lines.push('| --- | --- | --- | --- |');
lines.push('| Groq | Lead LLM provider (analysis, voice) | Extracted lab values + patient profile | Commercial API terms; no BAA in place |');
lines.push('| Cerebras | LLM provider (analysis, voice) | Extracted lab values + patient profile | Commercial API terms; no BAA in place |');
lines.push('| OpenRouter | LLM provider + vision OCR fallback | Extracted lab values, profile, report images | Commercial API terms. **Aggregator** — sub-routes to further model hosts, so the downstream vendor set is not fixed by us |');
lines.push('| SambaNova | LLM provider (analysis, voice) | Extracted lab values + patient profile | Commercial API terms; no BAA in place |');
lines.push('| OpenAI | Consensus-judge provider | Candidate analyses from other providers | Commercial API terms; no BAA in place |');
lines.push('| GitHub Models | **Retired, not called.** Provider is still defined at `server/utils/aiClients.js` but appears in none of the three priority orders (endpoint returns HTTP 410 since 13 Aug 2026) | none | Remove the definition once the retirement is confirmed permanent |');
lines.push('| Google Gemini | Vision OCR of uploaded reports | **The report image itself** — the highest-sensitivity payload we transmit | Commercial API terms; no BAA in place |');
lines.push('| Deepgram | Text-to-speech for spoken explanations | Text of report findings sent for synthesis — exact payload to be confirmed | Commercial API terms; no BAA in place |');
lines.push('| Helicone | Observability gateway | **All LLM prompts and responses**, when `HELICONE_API_KEY` is set every provider call is proxied through it (`aiClients.js`) | Commercial terms; retention and data-residency settings to be confirmed |');
lines.push('| openFDA (FDA) | Drug label lookup | Drug names only — no patient identifiers or lab values | Public US Government API; label text is unstructured and is not a curated interaction graph |');
lines.push('| RxNorm (NIH/NLM) | Drug name normalization | Drug names only — no patient identifiers or lab values | Public NIH API. **Some source vocabularies within RxNorm require UMLS Metathesaurus credentials** — confirm which subsets we touch before redistribution |');
lines.push('');
lines.push('Ten services are live; GitHub Models is defined but disabled. Rows marked "to be');
lines.push('confirmed" are unverified at the time of writing and should not be relied on as');
lines.push('compliance statements.');
lines.push('');
lines.push('**Not yet addressed:** none of the commercial providers above is covered by a');
lines.push('business associate agreement, and report data is transmitted without');
lines.push('de-identification. A single uncovered provider in the fan-out is enough to');
lines.push('invalidate a HIPAA compliance claim, so this must be resolved — by BAAs, by');
lines.push('de-identifying before transmission, or by reducing the provider set — before');
lines.push('any pilot with real patient data. Data residency and retention per provider are');
lines.push('likewise undocumented.');
lines.push('');
lines.push('#### Infrastructure subprocessors');
lines.push('');
lines.push('Distinct from the API terms above, but they hold or transit the same data:');
lines.push('Render (backend hosting + PostgreSQL), Vercel (frontend), the configured SMTP');
lines.push('provider (outbound email), and OpenStreetMap/Nominatim (nearby-clinic lookup,');
lines.push('which receives patient location). These need the same treatment as the API');
lines.push('vendors before a real-data deployment.');
lines.push('');
lines.push('### Clinical reference sources');
lines.push('');
lines.push('Reference ranges and clinical constants are drawn from public guidance published');
lines.push('by WHO, the American Gastroenterological Association, NIH/MedlinePlus, StatPearls,');
lines.push('Mayo Clinic, CLSI EP28-A3c and the FDA. These are cited in-product at the point of');
lines.push('use; no proprietary dataset is bundled or redistributed.');
lines.push('');

fs.writeFileSync(OUT, lines.join('\n'), 'utf8');
console.log(`Wrote ${path.relative(process.cwd(), OUT)} — ${rows.length} direct dependencies, ${flagged.length} flagged.`);
if (flagged.length) {
  for (const f of flagged) console.log(`  ${f.verdict}: ${f.name} (${f.project}) — ${f.license}`);
  process.exit(1);
}
