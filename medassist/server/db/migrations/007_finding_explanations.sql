-- Migration 007 — cached per-finding plain-English explanations
--
-- Without this, POST /api/voice/explain-finding regenerated the text on every
-- click, so the same parameter produced different wording each time. Persisting
-- it makes report+parameter+lang render identical text forever.
--
-- Shape: { "<lang>": { "<parameter>": "<text>" } }  (mirrors blood_reports.translations)
--
-- Also mirrored in db/migrate.js, which is what actually runs at server boot.

ALTER TABLE blood_reports
  ADD COLUMN IF NOT EXISTS finding_explanations JSONB DEFAULT '{}'::jsonb;
