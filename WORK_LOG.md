# WORK LOG — MedAssist AI CS 595

> Auto-saved thinking log. Each session appended below.
> Purpose: resume without re-reading all code — just read this.

---

## Session: 2026-05-01 — Fix Incomplete + Slow Translation

### Problem Statement
User reports: "Only translating headings and titles — not full content in multiple cards. Also takes too much time. Want to cache so revisiting doesn't retranslate."

---

### Root Cause Analysis

#### Two translation systems exist side-by-side:

**System 1 — i18next (static UI labels)** → works fine
- Button labels, section headers, status tags — loaded from `client/src/locales/es.json`
- Instant, no API call — this is why headings/titles appear translated

**System 2 — Dynamic AI content** → broken
- `buildTranslationBatch()` in `Analysis.jsx` collects ~40–60 keys from analysis results:
  - `overall_assessment`, `root_cause`, `finding_*`, `risk_*`, `followup_*`, `diet_*`, `eat_*`, `avoid_*`, `ingr_*`
- Sends these to `POST /api/voice/translate` → backend calls **MyMemory API once per key**
- MyMemory results are cached to DB via `PUT /api/blood-report/:id/translations`
- Render uses `translatedData?.key ?? englishFallback`

#### Root Cause 1 — MyMemory makes 40+ individual HTTP calls (SLOW + UNRELIABLE)
```
40 keys ÷ 10 concurrent = 4 batches × ~200ms = ~800ms minimum
+ server round trips, MyMemory server latency, 8s timeout
= 3–15 seconds per translation, often timing out mid-batch
```
Keys that timeout → fall back to English silently → user sees partial translation.

#### Root Cause 2 — MyMemory rate limits kill entire translation silently
MyMemory free tier: 10,000 words/day per account (20,000 combined with 2 accounts).
A blood report with 40 keys × ~30 words avg = ~1,200 words per report.
When quota exceeded → MyMemory returns the original English → "poisoned cache guard" in `translateAll()` detects and invalidates cache → next attempt also fails → **no dynamic content ever gets translated**, only i18n static labels remain.

#### Root Cause 3 — Cache never gets populated when MyMemory fails
The DB cache write (`PUT /api/blood-report/:id/translations`) only runs `if (anyChanged)` — i.e., only if at least one translated value differs from the English source. When MyMemory is rate-limited, it returns English → no value changes → cache not saved → every revisit re-attempts the failing API → never cached.

#### Root Cause 4 — Chunking multiplies the problem
`translateAll()` splits keys into chunks of 20, sends each chunk as a separate `POST /voice/translate` call. Each chunk triggers 10–20 MyMemory requests. Any chunk failure leaves that chunk untranslated. Partial result = partial UI translation.

---

### Solution: Replace MyMemory with a Single LLM Call

**Core idea**: Instead of 40+ individual MyMemory HTTP calls, send the entire `{ key: "text" }` JSON to the LLM in ONE call. The LLM translates all values at once and returns the translated JSON.

Benefits:
- **Speed**: 1 LLM call (~2–4s) vs 40+ HTTP calls (3–30s)
- **Completeness**: All keys translated in one shot — no partial failures
- **Free**: Uses existing providers (Cerebras/SambaNova/GitHub) — no new quota
- **Better quality**: LLM understands medical context; MyMemory is generic MT
- **Reliable**: Uses existing `callWithFallback()` provider chain in `voice.js`
- **Cache works correctly**: Full result is always persisted after one successful call

---

### Files to Modify

| File | Change |
|---|---|
| `server/routes/voice.js` | Replace `myMemoryTranslate` + per-key loop with single LLM call |
| `client/src/pages/Patient/Analysis.jsx` | Remove chunking — single `api.post('/voice/translate', ...)` call |

**NOT changing:**
- `buildTranslationBatch()` — already collects the right keys
- DB cache GET/PUT routes in `bloodReport.js` — already correct
- i18next setup — already working

---

### Backend Change (`server/routes/voice.js`)

**Delete entirely:**
- `MYMEMORY_EMAILS` array, `_emailIndex`, `nextEmail()`, `myMemoryTranslate()` function
- The per-key concurrency loop inside `router.post('/translate', ...)`

**Replace `router.post('/translate', ...)` with:**

```js
router.post('/translate', verifyToken, async (req, res) => {
  const { lang, texts } = req.body;
  if (!lang || !texts || typeof texts !== 'object') {
    return res.status(400).json({ error: 'lang and texts are required' });
  }
  if (lang === 'en') return res.json(texts);

  const entries = Object.entries(texts).filter(([, v]) => v && typeof v === 'string' && v.trim());
  if (!entries.length) return res.json({});

  const textObj = Object.fromEntries(entries);
  const LANG_NAMES = { es: 'Spanish', fr: 'French', hi: 'Hindi', de: 'German', pt: 'Portuguese', zh: 'Chinese' };
  const langName = LANG_NAMES[lang] || lang;

  const systemPrompt = `You are a medical translation assistant. Translate values accurately, preserving clinical terminology.`;
  const userPrompt = `Translate ALL values in this JSON object from English to ${langName}.
Rules:
- Return ONLY valid JSON — no markdown fences, no explanation outside the JSON
- Keep every key exactly as-is, only translate the string values
- Preserve medical terms, drug names, and numeric references accurately
- If a value is already in ${langName}, keep it unchanged

${JSON.stringify(textObj)}`;

  try {
    const raw = await callWithFallback(userPrompt, systemPrompt, 3000);
    const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    const translated = JSON.parse(clean);
    return res.json(translated);
  } catch (err) {
    console.error('[translate] LLM translation failed:', err.message);
    // Return original English texts as fallback — client handles gracefully
    return res.json(Object.fromEntries(entries));
  }
});
```

> **Note**: `callWithFallback(userPrompt, systemPrompt, maxTokens)` already exists in `voice.js` from the voice session. Check its exact signature — it may take `(prompt, systemPrompt)` or `(messages)`. Adjust accordingly. The key is passing `maxTokens: 3000` so the full JSON fits in the response.

---

### Frontend Change (`client/src/pages/Patient/Analysis.jsx`)

**In `translateAll()`** — replace the two chunked-batch blocks (cache-miss path and incremental path) with a single API call each.

**Cache-miss path** (currently lines 447–468) — replace with:
```js
// Single LLM call for all keys at once
const newTranslated = await api.post('/voice/translate', { lang, texts })
  .then((r) => r.data)
  .catch(() => ({}));

if (Object.keys(newTranslated).length) {
  setTranslatedData(newTranslated);
  const anyChanged = Object.entries(newTranslated).some(([k, v]) => v !== texts[k]);
  if (anyChanged) {
    api.put(`/blood-report/${reportId}/translations`, { lang, data: newTranslated }).catch(() => {});
  }
}
```

**Incremental path** (currently lines 419–443) — replace chunk loop with:
```js
const toTranslate = Object.fromEntries(missingKeys.map((k) => [k, texts[k]]));
const newTranslated = await api.post('/voice/translate', { lang, texts: toTranslate })
  .then((r) => r.data)
  .catch(() => ({}));

const merged = { ...cached, ...newTranslated };
setTranslatedData(merged);
const anyNew = Object.keys(newTranslated).some((k) => newTranslated[k] !== toTranslate[k]);
if (anyNew) {
  api.put(`/blood-report/${reportId}/translations`, { lang, data: merged }).catch(() => {});
}
```

---

### How Cache Works After Fix

**First visit (cache miss):**
1. `GET /api/blood-report/:id/translations?lang=es` → empty
2. Single `POST /voice/translate` LLM call → all 40–60 keys translated in ~3s
3. `PUT /api/blood-report/:id/translations` saves full result to DB
4. `setTranslatedData(translated)` → page renders fully in Spanish

**Revisit (cache hit):**
1. `GET /api/blood-report/:id/translations?lang=es` → returns full cached JSON (~100ms)
2. `missingKeys` = [] → `setTranslatedData(cached)` immediately
3. Zero API calls, instant render

**When riskScores/followUp arrive late:**
1. `translateAll()` re-runs (dependency on `riskScores`/`followUp` state)
2. Cache hit for existing keys; only `risk_*` and `followup_*` are missing
3. One small LLM call for just the missing keys → merges with cache → saves updated cache

---

### Verification Steps
1. Switch language to Spanish on Analysis page
2. Check: Overall Summary, Abnormal Findings, Diet Plan, Recovery Ingredients, Risk Scores, Follow-Up cards all show Spanish text (not just headings)
3. Check browser Network tab: only ONE `POST /voice/translate` request fires (not 40+)
4. Revisit page and switch to Spanish: translation appears instantly (DB cache hit, no API call)
5. Check Render logs: `[translate] LLM translation...` log appears once per first visit
6. Verify cache: `GET /api/blood-report/:id/translations?lang=es` returns full JSON

---

### Key File Locations
- `server/routes/voice.js` — lines ~343–406 (entire translate section to replace)
- `client/src/pages/Patient/Analysis.jsx` — lines ~393–473 (`buildTranslationBatch` + `translateAll`)
- `client/src/pages/Patient/Analysis.jsx` — lines ~476–489 (translation `useEffect` — no change needed)
- `server/routes/bloodReport.js` — lines ~580–618 (GET/PUT translations — no change needed)
- `client/src/locales/en.json` + `es.json` — static i18n labels (no change needed)
