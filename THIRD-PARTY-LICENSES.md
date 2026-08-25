# Third-Party Dependencies and Licenses

MedAssist AI is distributed under the Apache License 2.0 (see `LICENSE`).
This manifest lists every **direct** dependency and the license it declares,
so that any term conflicting with those terms is visible rather than assumed away.

Generated 2026-08-25 by `medassist/scripts/license-manifest.js` from the installed
dependency tree. Regenerate after any dependency change rather than editing by hand.

## server (23 direct dependencies)

| Package | Version | License |
| --- | --- | --- |
| `@google/generative-ai` | 0.24.1 | Apache-2.0 |
| `@sparticuz/chromium` | 133.0.0 | MIT |
| `axios` | 1.16.0 | MIT |
| `bcryptjs` | 3.0.3 | BSD-3-Clause |
| `cors` | 2.8.6 | MIT |
| `crypto` | 1.0.1 | ISC |
| `dotenv` | 17.3.1 | BSD-2-Clause |
| `express` | 5.2.1 | MIT |
| `express-rate-limit` | 8.3.0 | MIT |
| `form-data` | 4.0.5 | MIT |
| `google-auth-library` | 10.6.2 | Apache-2.0 |
| `groq-sdk` | 0.37.0 | Apache-2.0 |
| `jsonwebtoken` | 9.0.3 | MIT |
| `multer` | 2.1.1 | MIT |
| `node-fetch` | 2.7.0 | MIT |
| `nodemailer` | 8.0.7 | MIT-0 |
| `openai` | 6.27.0 | Apache-2.0 |
| `pdf-parse` | 1.1.1 | MIT |
| `pdfkit` | 0.18.0 | MIT |
| `pg` | 8.20.0 | MIT |
| `puppeteer-core` | 24.42.0 | Apache-2.0 |
| `qrcode` | 1.5.4 | MIT |
| `speakeasy` | 2.0.0 | MIT |

## client (14 direct dependencies)

| Package | Version | License |
| --- | --- | --- |
| `@react-oauth/google` | 0.13.5 | MIT |
| `axios` | 1.13.6 | MIT |
| `framer-motion` | 12.38.0 | MIT |
| `i18next` | 26.0.8 | MIT |
| `i18next-browser-languagedetector` | 8.2.1 | MIT |
| `leaflet` | 1.9.4 | BSD-2-Clause |
| `react` | 19.2.4 | MIT |
| `react-dom` | 19.2.4 | MIT |
| `react-hook-form` | 7.71.2 | MIT |
| `react-hot-toast` | 2.6.0 | MIT |
| `react-i18next` | 17.0.6 | MIT |
| `react-leaflet` | 5.0.0 | Hippocratic-2.1 |
| `react-router-dom` | 7.13.1 | MIT |
| `recharts` | 3.8.1 | MIT |

## Compatibility review

No copyleft (GPL/AGPL/LGPL) dependency is present. Every other direct dependency
declares a permissive license (MIT, ISC, Apache-2.0, BSD, 0BSD or equivalent).

The following declare terms the automated check could not clear, and are
disclosed here for the program to confirm:

#### `react-leaflet` (client) — Hippocratic-2.1

Hippocratic License 2.1 is an "ethical source" license: it permits use, modification and redistribution but adds human-rights use restrictions, which means it is not OSI-approved and not classed as free/open source. It does not prevent this project from being licensed under Apache 2.0, but it is a non-standard term the program should be told about. Used in one place only (client/src/pages/Patient/NearbyClinics.jsx, the nearby-clinics map). The underlying mapping library, leaflet, is BSD-2-Clause; only the React binding carries this license, so swapping the binding would remove the term if LOF requires a strictly OSI-approved tree.


### Services accessed over the network

These are called as hosted APIs. No code is redistributed, so their licenses do
not attach to this project, but their **terms of service** govern use, and every
row that carries report data is a separate relationship to account for before
any deployment handling real patient data.

| Service | Used for | Report data sent | Terms / restrictions to confirm |
| --- | --- | --- | --- |
| Groq | Lead LLM provider (analysis, voice) | Extracted lab values + patient profile | Commercial API terms; no BAA in place |
| Cerebras | LLM provider (analysis, voice) | Extracted lab values + patient profile | Commercial API terms; no BAA in place |
| OpenRouter | LLM provider + vision OCR fallback | Extracted lab values, profile, report images | Commercial API terms. **Aggregator** — sub-routes to further model hosts, so the downstream vendor set is not fixed by us |
| SambaNova | LLM provider (analysis, voice) | Extracted lab values + patient profile | Commercial API terms; no BAA in place |
| OpenAI | Consensus-judge provider | Candidate analyses from other providers | Commercial API terms; no BAA in place |
| GitHub Models | **Retired, not called.** Provider is still defined at `server/utils/aiClients.js` but appears in none of the three priority orders (endpoint returns HTTP 410 since 13 Aug 2026) | none | Remove the definition once the retirement is confirmed permanent |
| Google Gemini | Vision OCR of uploaded reports | **The report image itself** — the highest-sensitivity payload we transmit | Commercial API terms; no BAA in place |
| Deepgram | Text-to-speech for spoken explanations | Text of report findings sent for synthesis — exact payload to be confirmed | Commercial API terms; no BAA in place |
| Helicone | Observability gateway | **All LLM prompts and responses**, when `HELICONE_API_KEY` is set every provider call is proxied through it (`aiClients.js`) | Commercial terms; retention and data-residency settings to be confirmed |
| openFDA (FDA) | Drug label lookup | Drug names only — no patient identifiers or lab values | Public US Government API; label text is unstructured and is not a curated interaction graph |
| RxNorm (NIH/NLM) | Drug name normalization | Drug names only — no patient identifiers or lab values | Public NIH API. **Some source vocabularies within RxNorm require UMLS Metathesaurus credentials** — confirm which subsets we touch before redistribution |

Ten services are live; GitHub Models is defined but disabled. Rows marked "to be
confirmed" are unverified at the time of writing and should not be relied on as
compliance statements.

**Not yet addressed:** none of the commercial providers above is covered by a
business associate agreement, and report data is transmitted without
de-identification. A single uncovered provider in the fan-out is enough to
invalidate a HIPAA compliance claim, so this must be resolved — by BAAs, by
de-identifying before transmission, or by reducing the provider set — before
any pilot with real patient data. Data residency and retention per provider are
likewise undocumented.

#### Infrastructure subprocessors

Distinct from the API terms above, but they hold or transit the same data:
Render (backend hosting + PostgreSQL), Vercel (frontend), the configured SMTP
provider (outbound email), and OpenStreetMap/Nominatim (nearby-clinic lookup,
which receives patient location). These need the same treatment as the API
vendors before a real-data deployment.

### Clinical reference sources

Reference ranges and clinical constants are drawn from public guidance published
by WHO, the American Gastroenterological Association, NIH/MedlinePlus, StatPearls,
Mayo Clinic, CLSI EP28-A3c and the FDA. These are cited in-product at the point of
use; no proprietary dataset is bundled or redistributed.
