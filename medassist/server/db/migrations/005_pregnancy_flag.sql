-- Migration 005: pregnancy flag on patient profiles
-- Used by the deterministic anemia classifier to pick the correct WHO
-- hemoglobin cutoff/severity scale (pregnant <11.0 g/dL vs non-pregnant <12.0).
-- Run against Supabase SQL editor or: psql $DATABASE_URL -f migrations/005_pregnancy_flag.sql

ALTER TABLE patient_profiles
  ADD COLUMN IF NOT EXISTS pregnant BOOLEAN DEFAULT NULL;
