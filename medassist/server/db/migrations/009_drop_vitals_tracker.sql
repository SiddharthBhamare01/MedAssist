-- Remove the vitals tracker.
--
-- The feature is gone from the product: the page, its navigation entry, its
-- four API routes and its locale strings were all removed. These two objects
-- are what remained in the database.
--
-- Scope, so this is not larger than it looks:
--   vitals_logs                     — the readings themselves. Self-reported
--                                     blood pressure, glucose, weight, heart
--                                     rate, SpO2 and temperature. Nothing else
--                                     referenced this table; no foreign key
--                                     pointed at it.
--   patient_profiles.vitals_insights — a JSONB cache of LLM-written
--                                     correlation text, keyed by vital type.
--                                     Derived output, regenerable by nothing
--                                     now that the feature is gone.
--
-- THIS DESTROYS DATA AND CANNOT BE UNDONE. Take a dump of vitals_logs before
-- running it if there is any chance the readings are wanted:
--
--   pg_dump "$DATABASE_URL" --data-only --table=vitals_logs > vitals_logs_backup.sql
--
-- Note that db/migrate.js runs only its own inline statements at server boot
-- and does not read this directory, so creating this file changes nothing on
-- its own — it has to be applied by hand against each database.

BEGIN;

DROP TABLE IF EXISTS vitals_logs;

ALTER TABLE patient_profiles
  DROP COLUMN IF EXISTS vitals_insights;

COMMIT;
