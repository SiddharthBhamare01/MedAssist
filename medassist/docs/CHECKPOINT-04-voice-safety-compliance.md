# Checkpoint 04 — Voice Pipeline, Chatbot Safety, and Program Compliance (2026-08-11)

**Date:** 2026-08-11 (Tuesday) — **program Week 7**, between Gate 2 (submitted 8 Aug) and Gate 3 (due ~6 Sep).
**Stage:** v3 Month 2 ("Confirm & Track"), post-Gate-2 hardening. **Status:** complete, deployed on `main` at `2cd4839`.
**Architecture:** unchanged — the deterministic engine decides, the LLM only explains. This checkpoint adds a *third* deterministic gate (chatbot scope) and rebuilds the voice delivery path.

> Read this first in a new session. It carries the open items, the credentials
> that still need setting, and one **schedule correction that changes the plan**
> (see §7).

---

## 1. Where the program actually stands

Corrected against `LOF_LABS_Participant_Guide.docx`, which defines the gates. Program weeks run from ~29 Jun 2026.

| Gate | Due | Award | Status |
|---|---|---|---|
| Gate 1 — Concept approved | End Week 2 (~12 Jul) | $500 | **Passed, 89/100.** Feedback received 10 Aug. |
| Gate 2 — Working prototype | End Week 6 (**9 Aug**) | $1,250 | **Submitted 8 Aug**, on time. Awaiting result. |
| Gate 3 — Feature-complete beta | End Week 10 (**~6 Sep**) | $1,250 | Not started. See §7. |
| Final demo | Week 13 (~27 Sep) | $2,000 | Not started. |

Gate 2 evidence submitted: `MedAssist_AI_Sprint_Update_2026-08-07`, `MedAssist_AI_Demo_Script_5min`, plus `Demo Video 8-9-26.mp4` (recorded 9 Aug, after submission — confirm the panel has a replayable copy).

**Self-assessment of the Gate 2 submission:** ~88/100 as submitted; ~93 against the repo as it stands today. Five of six Gate 2 checkboxes were solidly met on the day. The sixth — "repository, license file, and dependency/license manifest remain current" — was **not** satisfied on 8 Aug and was closed on 11 Aug (§6). Worth telling the panel, since it is a scored box that is now filled.

---

## 2. Voice: ElevenLabs → Deepgram Aura-2

ElevenLabs credits were exhausted. Both TTS call sites now use one helper, `synthesizeSpeech()` in `server/routes/voice.js`.

- Model `aura-2-thalia-en`, overridable via `DEEPGRAM_TTS_MODEL`.
- **`encoding=mp3` is not optional.** Deepgram defaults to raw linear16 PCM (`audio/l16`), which `AudioContext.decodeAudioData` rejects outright. A port without it fails at decode with no useful error.
- **Aura-2 caps at 2000 characters** (413 above). The old `/speak` sliced at 3000.
- 401/402 pass through as themselves rather than collapsing to 502, so "bad key" stays distinguishable from "out of credits".
- Spanish never reaches Deepgram — `ReportChatbot.jsx` and `Analysis.jsx` short-circuit to browser `speechSynthesis` first, so the English-only voice is never handed Spanish text.

---

## 3. Provider failover — the bug behind the 402s

`/narrate-report` and `/report-chat` retried only on 429/503 and **re-raised everything else**. Express 5 forwards async throws to the handler in `index.js`, which uses `err.status` — so SambaNova's 402 became the API's own response while the remaining providers went untried. `/explain-finding` already handled this correctly; the other two now match it.

**Measured provider state, 11 Aug 2026:**

| Provider | Status |
|---|---|
| Cerebras `gpt-oss-120b` | Working — 5/5 rapid calls, ~0.6s for a 250-word script |
| SambaNova | **402** — free tier now requires payment |
| GitHub Models | **404** on the old endpoint; **410** on `models.github.ai` ("temporarily unavailable") |
| OpenRouter | **404** — every configured `:free` slug had retired |
| OpenAI `gpt-4o` | **401 — the key in `.env` is invalid** |

Fixes: failover continues on any error; 401/402/404 bench a provider for 5 minutes via the existing `markProviderLimited` machinery; the OpenRouter model list was refreshed against the live `/api/v1/models` catalogue.

**Watch out:** `nemotron-3-nano` leaks chain-of-thought into `content` (a test reply began *"User wants answer as doctor, warm tone…"*), where sibling models keep it in a separate `reasoning` field. It is ranked below the clean models and both routes now run output through `cleanExplanation()`.

Verified by reproducing the deployed condition with Cerebras excluded: `sambanova 402 → github 404 → openrouter answers cleanly`.

---

## 4. Voice performance — 106s → 4.2s to first audio

Measured end to end before the change: 1.2s on dead providers + 52.9s generating the script on a reasoning model + 52.0s synthesizing the full two-minute MP3 before the client could start.

**Deepgram was never the bottleneck** — first byte arrives in ~300ms. The cost was buffering the complete 759KB file server-side, then buffering it again client-side for `decodeAudioData`.

`/narrate-report` **changed contract**: it now returns `{ chunks: string[] }` instead of `audio/mpeg`. The client synthesizes each chunk via `/speak` and plays it while the next downloads.

**Chunk sizing is not about latency.** Speech *plays* at ~53ms/char but *synthesizes* at ~19ms/char, so a chunk stays gapless only while it is under roughly twice the length of the one before it. A short opener followed by a long second chunk stalls — the first attempt (172 then 461 chars) had a ~3s gap. Current defaults `firstMax=110, restMax=220` produce `[124, 227, 291, 235, 319, 175]`, verified gapless.

**Caching:** `blood_reports.narration_script` (**migration 008**, in `db/migrate.js` and `db/migrations/008_narration_script.sql`). A report's analysis is immutable, so its narration is too. The cache read is best-effort — an unmigrated database regenerates and logs `[narrate-report] Script cache unavailable` rather than failing.

**Also fixed:** `audioManager.playAudio` swallowed `play()` rejections with an empty catch, so an undecodable clip produced no sound, no error, and no `onEnd` — hanging any caller awaiting playback. It now reports through `onError`, and narration falls back to the browser voice.

---

## 5. Chatbot treatment guardrail

`server/utils/treatmentGuardrail.js`, enforced in `/report-chat` **before any LLM call**. Returns 200 with a normal `{ reply }` so it renders in the transcript and is spoken by TTS — a 4xx would send the client down its catch path and the patient would hear nothing.

Two-tier matching, because a single keyword list breaks the product — *"What foods should I eat?"* is one of the four chatbot suggestion chips:

- **Always defer:** medication/dosing/procedure terms (`medicine`, `tablet`, `dose`, `mg`, `prescribe`, `injection`, `transfusion`, `supplement`) + Spanish equivalents.
- **Defer unless the question is about diet/lifestyle:** `treat`, `cure`, `therapy`, `should I take`. So *"What foods should I eat to treat my anemia?"* still answers.

Judgment call to revisit if challenged: **supplement questions defer**, even though the app ships a `recovery_ingredients` section, because the work plan excludes drug-safety decisions.

Validated by `tests/guardrail/runGuardrail.js` — 29 labelled cases, both languages, reporting missed deferrals and over-blocks separately since only the first is a safety failure. Exits non-zero on either.

Scope: `/report-chat` only. `/explain-finding` takes a parameter name drawn from the report, not free text, so it has no equivalent surface.

---

## 6. Licensing and third-party compliance

Closes required follow-up 5 from the Milestone 1 review, and Gate 2 checkbox 6.

- `LICENSE` at repo root — Apache 2.0 verbatim (201 lines), `Copyright 2026 Vaishnav Bhujbal and Siddharth Bhamare`.
- `"license": "Apache-2.0"` in both `server/` and `client/` `package.json` (server previously said ISC; client declared nothing).
- `THIRD-PARTY-LICENSES.md` — all 37 direct dependencies, generated by `medassist/scripts/license-manifest.js` from the installed tree. Exits non-zero on anything it cannot clear, so it can gate a build.

**Disclosed finding:** `react-leaflet@5.0.0` is under the **Hippocratic License 2.1**, an ethical-source license with human-rights use restrictions — not OSI-approved. It does not block Apache 2.0 licensing but is a non-standard term. Used in one file (`NearbyClinics.jsx`); the underlying `leaflet` is BSD-2-Clause, so replacing only the React binding would clear the tree. No copyleft anywhere.

---

## 7. ⚠️ Schedule correction — the most important item here

**Gate 3 (feature-complete beta) is due end of Week 10, ~6 September — not 30 September.**

The work plan treats Month 3 as Sep 1–30. Against the actual gate that is roughly three weeks late. Gate 3 is the program's real quality filter: *every* feature in approved scope present and functional, no blocking bugs, and someone who did not build it can complete the main task.

Remaining scope for Gate 3: critical-value safety net, validation dashboard, deployment hardening, positioning brief. **Reconcile the Month 3 plan against the ~6 Sep date before doing anything else.**

---

## 8. Open items

**Credentials / deployment**

- [ ] **Rotate the Deepgram key** — it was pasted into a chat transcript. Then update `server/.env` *and* Render.
- [ ] **Set `DEEPGRAM_API_KEY` in Render** — declared `sync: false` in `render.yaml`, so Render will *not* create it. Without it both voice routes return 503.
- [ ] **Check `CEREBRAS_API_KEY` in Render.** Cerebras is first in the chain and healthy locally; for production to have reached SambaNova at all it must be missing or stale there. This is the difference between ~1s and ~53s narration.
- [ ] **`OPENAI_API_KEY` is invalid (401)** — affects the consensus judge and Phase 1 tool calling, which are silently running without their intended first choice.
- [ ] Remove the now-unused `ELEVENLABS_API_KEY` from Render.
- [ ] Confirm **migration 008** ran — look for `[narrate-report] Script cache unavailable` in Render logs.

**Program compliance**

- [ ] **Roles + weekly availability** — a Gate 1 checkbox still unsatisfied and the M1 follow-up called out most specifically. Needs numbers from both members. Placeholders in `MedAssist_AI_Milestone2_Addendum_DRAFT.md` §B.
- [ ] **Repository transfer to LOF control** — requires LOF administrative access; request it.
- [ ] **`react-leaflet` Hippocratic term** — disclose, or swap the binding. Ask the program contact.
- [ ] Tell the panel the licensing gap is closed if Gate 2 review is still open.

**Remaining M1 follow-ups** (drafted in `MedAssist_AI_Milestone2_Addendum_DRAFT.md`, at repo parent):
class-to-summer baseline, LABS gate mapping, minimum-deliverable protection, and a risks/known-limitations section — the last being weekly evidence the Participant Guide asks for and the sprint update omitted.

---

## 9. Commits in this session

| Commit | What |
|---|---|
| `0253d63` | `style(ui)` — remove emoji glyphs across the patient-facing UI (19 files; kept `✓ ✕ → ↑ ↓ ▸`) |
| `77c7f01` | `feat(voice)` — replace ElevenLabs TTS with Deepgram Aura-2 |
| `0b4ad19` | `fix(voice)` — stop one provider's 402 from failing the whole route |
| `241c18a` | `perf(voice)` — speak the first sentence in ~4s instead of ~106s |
| `50951b6` | `fix(voice)` — never fail playback silently |
| `2845aa2` | `feat(chatbot)` — defer treatment and medication questions to a doctor |
| `2cd4839` | `chore(legal)` — Apache 2.0 licensing and dependency manifest |

Note: `0253d63`'s subject line begins with a stray `@` (a here-string quoting error). Left as-is by decision rather than force-pushing a rewrite over a shared branch.

---

## 10. Verification commands

```bash
cd medassist/server
node tests/anemia/runClassifier.js     # 140/140, 0 false negatives
node tests/recovery/runForecast.js     #  97/97,  0 missed non-responders
node tests/guardrail/runGuardrail.js   #  29/29 guardrail cases

cd ../ && node scripts/license-manifest.js   # regenerate manifest; non-zero if anything needs review
```

All three harnesses were re-run on 11 Aug and reproduce the figures published in the sprint update exactly.
