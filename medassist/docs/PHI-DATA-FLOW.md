# PHI data flow and vendor posture

**Phase 2 review, Week 7 deliverable.** Team Alpha · 24 Aug 2026
**Status: gap analysis. Nothing here is a compliance claim.**

---

The review's framing is the one to take seriously:

> Six providers means six vendor relationships touching PHI. Establish business
> associate agreements or de-identify before transmission, and document data
> residency and retention per provider. **A single non-covered provider in the
> fan-out invalidates the compliance story.**

## 1. What leaves the system today

A patient uploads a photograph of a lab report. From that single action:

| Stage | What is transmitted | To whom |
| --- | --- | --- |
| OCR | **The report image itself** — patient name, MRN, date of birth and address if printed on it | Google Gemini; OpenRouter vision models on failover |
| Analysis | Extracted lab values + age, sex, pregnancy status, existing conditions, allergies, current medications, smoking and alcohol status | Up to 2 of: Groq, Cerebras, OpenRouter, SambaNova (per-run cap) |
| Consensus | The candidate analyses from the above | OpenAI, OpenRouter or SambaNova |
| Observability | **Every prompt and response above**, when `HELICONE_API_KEY` is set | Helicone |
| Voice | Text of report findings, for speech synthesis | Deepgram |
| Drug lookup | Drug names only — no patient identifiers | openFDA, RxNorm (NIH) |
| Storage | Everything, at rest | Render (PostgreSQL) |
| Clinic lookup | Patient location | OpenStreetMap / Nominatim |

The OCR row is the most sensitive and the least discussed: **we send the whole
document image, not just the numbers.** Identifiers printed on the report leave
the system before any extraction or redaction happens.

Helicone is the second under-appreciated one. It is configured as a *gateway*,
not a sidecar — when the key is set, every model call is proxied through it, so
it sees the full prompt content.

## 2. Current posture

- **Business associate agreements: none.** Not with any provider.
- **De-identification before transmission: none.** Values and profile fields are
  sent as-is; report images are sent whole.
- **Data residency: undocumented.** No provider has been configured for a
  specific region, and `render.yaml` pins the backend to `oregon` only.
- **Retention: undocumented.** We have not confirmed, for any provider, how long
  prompt content is retained or whether it may be used for training.
- **Aggregator risk: unbounded.** OpenRouter routes to further model hosts that
  we do not select, so the downstream vendor set is not fixed by us.

Eleven services are in the manifest, plus four infrastructure subprocessors. The
review estimated at least eight; the real number is higher.

## 3. What has to happen before real patient data

In dependency order. Steps 1–3 are prerequisites, not improvements.

1. **Decide the model: BAAs, or de-identify, or both.** De-identification is the
   cheaper path and the more robust one, because it removes the dependency on
   eleven separate legal relationships. It is also the harder engineering task
   for the OCR stage, since redaction has to happen on-device or server-side
   before the image is transmitted at all.
2. **Reduce the provider set.** This is the highest-leverage step and it is now
   measurable: `utils/ensembleMetrics.js` reports inter-provider disagreement on
   every ensemble run. If the providers agree as often as we expect, then cutting
   from four to one or two fixes cost, latency and PHI exposure in a single
   change — and that is the review's own argument turned into an action.
3. **Strip identifiers before OCR.** Crop or redact the header block before the
   image is transmitted, or extract locally.
4. **Document residency and retention per vendor**, and record it in
   `THIRD-PARTY-LICENSES.md` alongside the terms.
5. **Confirm the RxNorm/UMLS position** — some source vocabularies within RxNorm
   require UMLS Metathesaurus credentials.
6. **Decide the Helicone question.** An observability gateway that sees every
   prompt is either in scope for the same agreement as the model providers, or it
   must be disabled for real-data deployments.

## 4. Position

The product is safe to run on **synthetic data, or on a team member's own
results with their consent**, which is what the current demonstration uses.

It is **not ready for any deployment involving another person's health data**,
and no amount of application-level safety work changes that — this is a
contractual and architectural gap, not a code-quality one.

We would rather state that plainly now than discover it during a pilot.

---

*Companion documents: `SAMD-POSTURE-MEMO.md`,
`../../THIRD-PARTY-LICENSES.md` (per-vendor terms table).*
