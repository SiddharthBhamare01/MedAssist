-- Migration 006: anemia symptom logging (CBC Expert Module, Sprint 2)
-- Lets a patient log anemia symptoms over time against a blood report so the
-- Anemia Mode dashboard can track how they feel across the recovery journey.
-- Run against Supabase SQL editor or: psql $DATABASE_URL -f migrations/006_anemia_symptom_logs.sql

CREATE TABLE IF NOT EXISTS anemia_symptom_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES users(id) ON DELETE CASCADE,
  report_id UUID REFERENCES blood_reports(id) ON DELETE CASCADE,
  symptoms JSONB NOT NULL DEFAULT '[]'::jsonb,
  note TEXT,
  logged_at DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(patient_id, report_id, logged_at)
);
