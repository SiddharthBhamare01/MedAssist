const pool = require('./pool');

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS supplement_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id UUID REFERENCES users(id) ON DELETE CASCADE,
      ingredient_name VARCHAR(255) NOT NULL,
      taken_at DATE NOT NULL DEFAULT CURRENT_DATE,
      UNIQUE(patient_id, ingredient_name, taken_at)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reminders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id UUID REFERENCES users(id) ON DELETE CASCADE,
      report_id UUID REFERENCES blood_reports(id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      send_at TIMESTAMP NOT NULL,
      sent BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS doctor_profiles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
      specialization VARCHAR(100),
      hospital_name VARCHAR(255),
      city VARCHAR(100),
      state VARCHAR(50),
      latitude FLOAT,
      longitude FLOAT,
      phone VARCHAR(30),
      available BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Migration 005 — pregnancy flag for anemia cutoff selection (WHO 2024)
  await pool.query(`
    ALTER TABLE patient_profiles
      ADD COLUMN IF NOT EXISTS pregnant BOOLEAN DEFAULT NULL
  `);

  console.log('[migrate] Tables ensured: supplement_logs, reminders, doctor_profiles; patient_profiles.pregnant');
}

module.exports = migrate;
