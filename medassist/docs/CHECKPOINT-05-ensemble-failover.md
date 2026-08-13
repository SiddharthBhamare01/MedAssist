# Checkpoint 05 — Blood-Report Ensemble Failover (2026-08-13)

**Date:** 2026-08-13 (Thursday) — **program Week 7**, between Gate 2 (submitted 8 Aug) and Gate 3 (due ~6 Sep).
**Stage:** v3 Month 2 ("Confirm & Track"), post-Gate-2 hardening.
**Trigger:** report upload on the deployed app produced no analysis. Reported as "the OCR pipeline is not working" — it was not OCR.
**Architecture:** unchanged. The deterministic engine still decides; this is failover plumbing around the LLM explanation layer.

> [CHECKPOINT-04](./CHECKPOINT-04-voice-safety-compliance.md) §3 fixed exactly this
> class of bug in the **voice routes**. The blood-report ensemble had a second,
> unrelated instance of it that the voice fix did not touch. If a third surfaces,
> look for provider lists that are narrowed *before* any call is attempted.

---

## 1. What the user saw, and what was actually wrong

Render log at the failure:

```
[geminiService] Text PDF detected, using text extraction path
[ensembleRunner] cerebras skipped: Cerebras GPT-OSS-120B: all 1 models unavailable (402)
[ensembleRunner] sambanova skipped: SambaNova Llama-3.3-70B: all 1 models unavailable (402)
[bloodReportAgent] Phase 2a ensemble failed: All AI providers failed in ensemble run
```

**OCR never ran.** `Text PDF detected` means the PDF carried an embedded text layer and the vision path was deliberately bypassed. Everything that failed is downstream of extraction, in the AI analysis phases.

**Exactly two providers were tried, then the phase gave up** — while a healthy third and fourth sat untried. That is the whole bug.

## 2. Root cause — the provider list was narrowed before anything was attempted

`ensembleRunner.js` `runParallel()`:

```js
const available = getAvailableProviders()
  .filter(name => !isProviderLimited(name))
  .slice(0, MAX_ENSEMBLE_PROVIDERS);   // ← cerebras + sambanova, decided up front
```

`MAX_ENSEMBLE_PROVIDERS = 2` exists to limit free-tier consumption, which is correct. But slicing the *candidate* list rather than stopping at 2 *successes* means the cap is spent on the first two names in `PRIORITY_ORDER` whether or not they answer. Both 402'd, `successful.length === 0`, and the phase threw.

Replaced with a worker pool: keep 2 calls in flight, and when one fails pull the next candidate off the queue. The cost ceiling is unchanged — still at most 2 successful analyses per phase — but exhaustion now falls through instead of terminating.

## 3. Measured provider state, 13 Aug 2026

Probed directly with the keys in `server/.env`, both bare and through the Helicone gateway (the gateway made no difference to any result):

| Provider | Status | Change since 11 Aug |
|---|---|---|
| Cerebras `gpt-oss-120b` | **Working locally** · **402 on Render** | Unchanged — the Render key is still the open item from CHECKPOINT-04 §8 |
| SambaNova | **402** — free tier requires a payment method | Unchanged |
| GitHub Models | **410 `github_models_retirement_brownout`** | The 410 itself was already recorded on 11 Aug; the error *code* naming a retirement is new |
| OpenRouter | **Working** | Recovered — the 11 Aug slug refresh holds; all six slugs still listed |
| OpenAI `gpt-4o` | **401 with the local key** · **succeeding on Render** per Helicone | The local `.env` key is stale; production's is valid |

Two of those deserve emphasis:

**GitHub Models is being retired, not merely broken.** `models.github.ai/inference` returns HTTP 410 with `{"code":"github_models_retirement_brownout"}`. A brownout is a scheduled rehearsal for permanent shutdown. It is removed from all four priority orders; the provider definition stays only so the name resolves.

**The local and Render OpenAI keys differ.** CHECKPOINT-04 §8 recorded `OPENAI_API_KEY` as invalid, which is true of `server/.env` and *not* true of Render. Anyone debugging the judge locally will see a 401 that production does not have.

## 4. A second bug the probing exposed

OpenRouter's `nemotron-3-ultra-550b-a55b:free` — the **first** entry in `analysisModels`, so the first thing every analysis phase tried — hangs for roughly two minutes and then drops the connection (`ECONNRESET`). The response body has no `choices` array, so `response.choices[0]` threw a bare `TypeError` with no `.status`.

`callProvider()` only continued to the next model on a known status code (`429/503/404/400/402`) and **re-threw everything else**. A `TypeError` is not in that list, so one malformed response killed the entire provider — the only healthy one left. The status-code allowlist is now inverted: abort only on `401`/`403` (a bad credential fails identically for every model on that provider), try the next model on anything else. `response?.choices?.[0]` guards the access itself.

The slug is still listed by `GET /api/v1/models`, so it is upstream instability rather than retirement. Demoted below `nemotron-3-super` rather than removed — leading with it cost ~2 minutes before every fallback.

**The same defect exists twice more, in `geminiService.js`** — both the vision OCR loop and the text-PDF parse loop read `response.choices[0].message.content` unguarded and fail over only on an allowlist of status codes, re-raising everything else. Both are fixed the same way. The text-parse one matters most: it is the path this very report took.

## 4a. The timeout needed a retry ceiling to mean anything

The first version of this fix set `timeout: 90_000` and left `maxRetries` at the OpenAI SDK default of **2**. The SDK retries timeouts, so the real ceiling was 3 × 90s = 270s per model — and with five models in `analysisModels`, one unlucky provider could burn ~22 minutes per phase. That is worse than the 2-minute hang the timeout was meant to bound.

Corrected to `maxRetries: 0`. Every caller in this codebase already loops over models and providers on failure, which recovers better than retrying the same stalled model, and `agentRunner` keeps its own explicit backoff for 429/5xx.

The client default also had to rise to **180s**, not fall. `geminiService.parseTextWithAI()` shares these clients and asks for `max_tokens: 8000`; 90s could plausibly cut off a legitimate slow parse and break the extraction step that was working. The tight 90s ceiling is now passed per-request from `ensembleRunner`, where nothing exceeds 3500 tokens.

**The vision OCR client is separate** (`geminiService.getOpenRouterClient()`) and is deliberately left alone — scanned multi-page PDFs are the one call that genuinely runs long.

## 5. Changes

**`server/agents/ensembleRunner.js`**
- `runParallel()` — worker pool replacing the up-front slice (§2).
- `callProvider()` — continue to the next model on any non-auth error; optional-chain the response (§4).
- `runConsensus()` — judge failures fall through to the next judge instead of re-throwing, matching the agent path.
- `runEnsembleWithConsensus()` — if **no** judge is reachable, return one agent's unmerged output rather than losing the phase. The agents already produced usable analyses; discarding them because the merge step is down is the worse failure.

**`server/utils/aiClients.js`**
- `github` removed from `PRIORITY_ORDER`, `TOOL_PROVIDERS_ORDER`, `JUDGE_PRIORITY_ORDER`, `VOICE_PRIORITY_ORDER`.
- SambaNova moved last in each — it 402s until billing is added, so it is only worth trying once everything else is exhausted.
- `openrouter` added to `JUDGE_PRIORITY_ORDER` (see the caveat in §7).
- `nemotron-3-ultra` demoted below `nemotron-3-super`.
- **180s client timeout + `maxRetries: 0`**, with a 90s per-request override from `ensembleRunner` (§4a).

**`server/services/geminiService.js`**
- Both provider loops — vision OCR and text-PDF parse — now optional-chain the response and fail over on any non-auth error, matching `callProvider` (§4).

**`server/routes/voice.js`** — comment updates only. Two comments named GitHub as the preferred voice provider and cited its 5/s concurrency limit. Both paths were checked against the new Cerebras-first order and need no code change: `/explain-finding` already caps at `max_tokens: 1200` with an explicit note about reasoning models charging internal tokens against the cap, and fails over on empty content; `translateSegment()` caps at 4096, strips `<think>` blocks, and falls back to English per segment.

## 6. Verification

Ran against live providers, not fixtures:

| Case | Result |
|---|---|
| Normal run | 2 providers (Cerebras + OpenRouter) → consensus merged, `agentCount=2` |
| **Cerebras benched** — reproduces the Render condition | `sambanova 402 → openrouter answers`, `agentCount=1`, valid JSON |
| **Text-PDF extraction** on `sample-cbc-reports/CBC_1_iron_deficiency_anemia.pdf` | `Text PDF detected → parsed by Cerebras`, 10 values, Hb 9.4 / MCV 74 correctly flagged low |

The second case is the one that used to throw `All AI providers failed in ensemble run`. Case 1 also exercised the judge fallback for free: the local OpenAI key 401'd, and OpenRouter picked up the merge. The third is the exact path the failing upload took, re-run after the `geminiService` changes.

`node --check` clean on all four modified files; the three deterministic harnesses re-run and passing (§9).

**Not verified:** nothing was exercised through the deployed app. No report was uploaded to Render after the fix, and the browser rendering of a `agentCount=1` analysis has not been seen. The failing upload's user-visible symptom was never established either — Phase 2a's `catch` leaves `medical = null` and the report should render with sections missing rather than erroring outright, but that was not confirmed against what the user actually saw.

## 6a. Where the time actually goes — "OCR is slow" was the wrong suspect

Measured on `sample-cbc-reports/CBC_1_iron_deficiency_anemia.pdf`, 13 Aug:

| Stage | Time |
|---|---|
| `pdf-parse` text layer | **285 ms** |
| Full text path (pdf-parse + Cerebras parse) | **1.4 s** — 10 values |
| Gemini direct on the raw PDF | 6.3 s (`flash-lite`) · 7.4 s (`flash`) — 10 values |
| **Phase 2a ensemble** (2000 tok, 2 providers + judge) | **119 s** |
| **Phase 2b ensemble** (3500 tok, 2 providers + judge) | **157 s** |
| Phase 2a with Cerebras benched — Render's situation | 39 s, `agentCount=1` |

**Extraction is 1.4 s. The two analysis phases are ~4.6 minutes.** Whatever a user experiences as a slow upload is almost entirely the ensemble, and no OCR change affects it.

The long pole inside a phase is the **OpenRouter free models** — Cerebras answers in ~1 s, so a two-provider phase runs at OpenRouter's speed, and the judge is a further OpenRouter call whenever OpenAI is unavailable. Note the counter-intuitive row: benching Cerebras made Phase 2a *faster* (39 s), because one provider skips consensus entirely. Restoring Cerebras buys real cross-checking, not lower latency.

One 90 s stall appeared in the Phase 2b judge (`Request timed out` from OpenAI). It did **not** reproduce — four consecutive calls on that key returned 401 in 84–582 ms — so it was a one-off gateway stall rather than a systematic cost.

## 6b. ⚠️ A blank image produces a fabricated blood report

Found while verifying the Gemini routing. Uploading a **blank white PNG** returns a full set of invented values:

```
BLANK WHITE IMAGE returned 9 values:
{ "parameter": "Hemoglobin", "value": "13.2", "unit": "g/dL",
  "normal_range": "13.5–17.5", "status": "low" }
```

Those are the numbers from the few-shot example inside `VISION_PARSE_PROMPT` itself. With nothing to read, the model copies the example and presents it as extracted data.

**This is pre-existing and not caused by enabling Gemini** — the OpenRouter vision path does the same thing (11 fabricated values on the same image). It matters more than a normal extraction bug because the deterministic anemia classifier runs on whatever comes out: a failed photo can yield a confident, sourced, WHO-cutoff-anchored anemia verdict built on values no one ever measured.

Not fixed here. The fix is a prompt change plus a sanity gate, and neither can be validated without a scanned or photographed sample report to test against — the three files in `sample-cbc-reports/` are all text-layer PDFs that never reach a vision model. Tracked in §8.

## 6c. Gemini enabled

`GEMINI_API_KEY` was commented out in `server/.env` (two distinct keys, both verified working against the live API) and absent from `render.yaml`. Now active locally and declared in the blueprint, alongside `OPENAI_API_KEY`, which was also missing.

- `geminiModels` corrected: `gemini-2.5-flash` returns 404 *"no longer available to new users"*, so it could never have served as a fallback. The list is now `gemini-3.1-flash-lite` → `gemini-3.5-flash`, flash-lite first on the measured 6.3 s vs 7.4 s.
- Verified routing: an image upload now logs `Gemini Vision OCR — gemini-3.1-flash-lite` instead of falling through to OpenRouter.

**What this buys:** scanned PDFs stop failing outright on a host without the `pdftoppm` binary — `extractFromPDF` sends the raw PDF to Gemini in that case, which read the sample PDF natively and returned all 10 values. **What it does not buy: any speed.** See §6a.

**`.env` is untracked**, so this commit changes nothing in production by itself. `GEMINI_API_KEY` must be set in the Render dashboard.

## 7. ⚠️ Two degradations to be aware of

**The ensemble will probably not be ensembling on Render.** With Cerebras 402ing there, the only healthy provider is OpenRouter — so `agentCount=1`, the single-provider path, no consensus. The pipeline produces a report; the accuracy claim that rests on cross-provider agreement does not hold. **Fixing `CEREBRAS_API_KEY` in Render is the single highest-value action** and restores two-provider consensus immediately.

**The consensus judge is no longer guaranteed independent.** `JUDGE_PRIORITY_ORDER` is now `['openai', 'openrouter', 'sambanova']`. OpenRouter is also an ensemble *agent*, so when OpenAI is unreachable it merges output it partly wrote — and the `consensus_note` field it emits (`high`/`medium`/`low` agreement) is a model agreeing with itself. This was observed live in the §6 test run, which produced `"consensus_note": "high"`.

Deliberate: a self-judged merge beats a dead analysis phase. But for a medical tool the consensus figure *is* the accuracy claim, so it should not be read as independent unless OpenAI served as judge. Worth surfacing in the UI if the ensemble stays single-provider.

## 8. Open items

Carried forward from CHECKPOINT-04 §8, still open and now higher priority:

- [ ] **Set a working `CEREBRAS_API_KEY` in Render.** Now the difference between a real ensemble and a single-model analysis, not just narration latency. The key currently active in `server/.env` works and answers in ~1s; Render's does not. Note this buys *accuracy*, not speed (§6a).
- [ ] **Add `SAMBANOVA_API_KEY` billing or drop the provider.** 402 "A payment method is required" — an account-level state with no code remedy. It has 402'd continuously since 11 Aug and costs a round trip on every phase. It is last in every order and self-benches for 5 minutes, so leaving it is defensible; removing it from `PRIORITY_ORDER` is a one-line alternative.

New:

- [ ] **⚠️ Stop vision OCR fabricating values from an unreadable image (§6b).** Highest-severity item here. Needs a scanned/photographed sample report before the prompt and sanity gate can be validated.
- [ ] **Set `GEMINI_API_KEY` in the Render dashboard** — declared `sync: false`, so Render will not create it, and `.env` is untracked.
- [ ] **Confirm whether `pdftoppm` exists on Render.** Upload a scanned PDF and look for `pdftoppm: PDF → JPEG` versus `pdftoppm unavailable or failed`. With Gemini now enabled either branch works, but only one reads every page.
- [ ] **Multi-page scanned reports lose everything after page 1** — `convertScannedPDFToImage` runs `pdftoppm -singlefile -f 1 -l 1`. Sending the raw PDF to Gemini instead would read all pages; untested on a scanned input, so not changed.
- [ ] **Consider running Phase 2a and 2b concurrently.** They share one context and are independent; serially they are ~4.6 minutes (§6a). Deferred — it doubles concurrent load on the free tiers that are already 402ing.

- [ ] **Add `OPENAI_API_KEY` to `render.yaml`.** It is set in the Render dashboard but absent from the blueprint, so a rebuild from the blueprint would silently lose the judge.
- [ ] **Refresh the local `server/.env` OpenAI key** — 401 locally, which makes judge behavior untestable off-Render.
- [ ] **Upload a report end-to-end on the deployed app** and confirm the analysis renders (§6, "not verified").
- [ ] **Decide whether `agentCount=1` should be surfaced in the UI.** The report currently looks identical whether one model or two produced it.
- [ ] **Plan for GitHub Models' permanent removal** — delete the provider definition once the retirement is confirmed.

## 9. Verification commands

```bash
cd medassist/server
node --check agents/ensembleRunner.js utils/aiClients.js routes/voice.js

node tests/anemia/runClassifier.js     # 140/140, 0 false negatives
node tests/recovery/runForecast.js     #  97/97,  0 missed non-responders
node tests/guardrail/runGuardrail.js   #  29/29 guardrail cases
```

All three re-run on 13 Aug and passing. They are unaffected by this change — they exercise the deterministic engines, which do not call providers — so they confirm no regression rather than confirming the fix.
