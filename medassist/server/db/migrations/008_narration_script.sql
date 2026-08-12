-- Migration 008 — cached doctor-style narration script
--
-- POST /api/voice/narrate-report regenerated the 250-word script on every press,
-- costing a full LLM round trip (up to ~53s when it fell through to a reasoning
-- model) before a single word could be spoken. A report's analysis is immutable
-- once written, so the narration derived from it is too — storing it turns a
-- repeat play into a pure TTS call.
--
-- Also mirrored in db/migrate.js, which is what actually runs at server boot.

ALTER TABLE blood_reports
  ADD COLUMN IF NOT EXISTS narration_script TEXT;
