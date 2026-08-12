# Third-Party Dependencies and Licenses

MedAssist AI is distributed under the Apache License 2.0 (see `LICENSE`).
This manifest lists every **direct** dependency and the license it declares,
so that any term conflicting with those terms is visible rather than assumed away.

Generated 2026-08-12 by `medassist/scripts/license-manifest.js` from the installed
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
not attach to this project, but their terms of service govern use:
Cerebras, SambaNova, OpenRouter, GitHub Models, OpenAI, Google Gemini,
Deepgram (text-to-speech), Helicone (observability), OpenFDA, and RxNorm (NIH).

### Clinical reference sources

Reference ranges and clinical constants are drawn from public guidance published
by WHO, the American Gastroenterological Association, NIH/MedlinePlus, StatPearls,
Mayo Clinic, CLSI EP28-A3c and the FDA. These are cited in-product at the point of
use; no proprietary dataset is bundled or redistributed.
