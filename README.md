# MedAssist AI — CS 595: Medical Informatics & AI
### Full-Stack AI-Powered Medical Assistant Web Application
### 15-Day Build Plan | Gemini API (Free Tier)

---

> **IMPORTANT DISCLAIMER**: This application is an educational CS 595 project and is NOT a substitute for professional medical advice.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Why Gemini Instead of Claude](#2-why-gemini-instead-of-claude)
3. [Tech Stack](#3-tech-stack)
4. [Folder Structure](#4-folder-structure)
5. [Database Schema](#5-database-schema)
6. [Gemini Agent Architecture](#6-gemini-agent-architecture)
7. [API Routes](#7-api-routes)
8. [Frontend Pages](#8-frontend-pages)
9. [15-Day Detailed Build Plan](#9-15-day-detailed-build-plan)
10. [Environment Setup](#10-environment-setup)
11. [Free APIs Used](#11-free-apis-used)
12. [Gemini vs Claude — Code Differences](#12-gemini-vs-claude--code-differences)
13. [Deliverables Checklist](#13-deliverables-checklist)

---

## 1. Project Overview

**MedAssist AI** is a full-stack web application that provides AI-powered medical assistance for two user roles:

| Role | Capabilities |
|------|-------------|
| **Patient** | Symptom collection → Disease prediction → Blood test guidance → Blood report analysis (OCR) → Tablet recommendations → Doctor referral |
| **Doctor** | AI assistant that reviews patient info and flags missing blood tests from prescriptions |

The AI core uses **Google Gemini** with **function calling (tool use)** to create autonomous agents that reason over real medical data from free APIs (OpenFDA, RxNorm, NIH ICD-10).

---

## 2. Why Gemini Instead of Claude

We replace the Anthropic Claude API with **Google Gemini API** because:

- **Free tier available**: Gemini 1.5 Flash is free at 15 RPM / 1 million tokens/day — sufficient for this project
- **Full function calling support**: Gemini supports multi-turn agentic loops with tool use, identical in concept to Claude
- **Vision/OCR support**: Gemini 1.5 Flash supports image input for blood report analysis
- **No billing required**: Google AI Studio API key works without a credit card

**Gemini model to use**: `gemini-2.0-flash-lite` (free, fast, supports function calling + vision)
**SDK**: `@google/generative-ai` (official Google SDK)

---

## 3. Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18 + Vite + TailwindCSS + shadcn/ui |
| **Backend** | Node.js + Express.js |
| **Database** | PostgreSQL (Supabase free tier OR Docker) |
| **AI / LLM** | Google Gemini 1.5 Flash via `@google/generative-ai` |
| **OCR / Vision** | Gemini Vision (same model, image input) |
| **Drug Data** | OpenFDA API (free, no key needed) |
| **Drug Names** | RxNorm API (free, NIH) |
| **ICD-10 Codes** | NIH ClinicalTables API (free) |
| **Auth** | JWT (jsonwebtoken + bcrypt) |
| **File Uploads** | Multer (backend) |
| **Maps** | Leaflet.js + OpenStreetMap (free) |
| **Real-time** | Server-Sent Events (SSE) for agent status |
| **Deployment** | Docker Compose (local) or Vercel + Railway |

---

## 4. Folder Structure

```
medassist/
├── client/                         # React + Vite frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── AgentStatus/        # Live agent step tracker UI
│   │   │   ├── Layout/             # Navbar, Sidebar, Footer
│   │   │   └── ui/                 # shadcn/ui components
│   │   ├── pages/
│   │   │   ├── Auth/
│   │   │   │   ├── Login.jsx
│   │   │   │   └── Register.jsx
│   │   │   ├── Patient/
│   │   │   │   ├── Intake.jsx      # Symptom collection wizard
│   │   │   │   ├── Results.jsx     # Disease prediction results
│   │   │   │   ├── Tests.jsx       # Recommended blood tests
│   │   │   │   ├── UploadReport.jsx
│   │   │   │   ├── Analysis.jsx    # Blood report analysis
│   │   │   │   └── Doctors.jsx     # Doctor finder + map
│   │   │   └── Doctor/
│   │   │       ├── Dashboard.jsx
│   │   │       └── Assist.jsx      # AI test suggestion tool
│   │   ├── hooks/
│   │   │   ├── useAuth.js
│   │   │   └── useAgentStatus.js   # SSE hook for live agent steps
│   │   ├── services/
│   │   │   ├── api.js              # Axios instance + interceptors
│   │   │   ├── authService.js
│   │   │   ├── patientService.js
│   │   │   └── doctorService.js
│   │   ├── context/
│   │   │   └── AuthContext.jsx
│   │   └── utils/
│   │       └── helpers.js
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── package.json
│
├── server/                         # Express backend
│   ├── routes/
│   │   ├── auth.js
│   │   ├── patient.js
│   │   ├── disease.js
│   │   ├── bloodReport.js
│   │   ├── doctors.js
│   │   ├── doctorAssist.js
│   │   └── agentStatus.js          # SSE endpoint
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── diseaseController.js
│   │   ├── bloodReportController.js
│   │   └── doctorAssistController.js
│   ├── middleware/
│   │   ├── auth.js                 # JWT verification middleware
│   │   └── upload.js               # Multer config
│   ├── services/
│   │   ├── geminiService.js        # Direct single-turn Gemini calls
│   │   └── locationService.js      # Haversine distance calc
│   ├── agents/
│   │   ├── diagnosticAgent.js      # Symptom → disease pipeline
│   │   ├── bloodReportAgent.js     # OCR → analysis → medication
│   │   ├── doctorAssistAgent.js    # Missing test detection
│   │   ├── agentRunner.js          # Shared agentic loop executor
│   │   └── tools/
│   │       ├── medicalTools.js     # Tool definitions + implementations
│   │       └── labTools.js         # Lab reference range lookup table
│   ├── models/
│   │   └── queries.js              # DB query functions
│   ├── db/
│   │   ├── schema.sql
│   │   ├── seed.sql
│   │   └── pool.js                 # pg Pool connection
│   ├── utils/
│   │   └── eventEmitter.js         # Session-scoped SSE emitter
│   ├── .env.example
│   └── index.js
│
├── docker-compose.yml
├── .gitignore
└── README.md
```

---

## 5. Database Schema

```sql
-- server/db/schema.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users (patients and doctors)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('patient', 'doctor')),
  full_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Patient health profile
CREATE TABLE patient_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  age INT,
  gender VARCHAR(20),
  weight_kg FLOAT,
  height_cm FLOAT,
  blood_group VARCHAR(10),
  existing_conditions TEXT[],
  allergies TEXT[],
  current_medications TEXT[],
  smoking_status VARCHAR(30),
  alcohol_use VARCHAR(30),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Patient symptom sessions
CREATE TABLE symptom_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES users(id),
  symptoms JSONB NOT NULL,
  predicted_diseases JSONB,
  selected_disease VARCHAR(255),
  recommended_tests TEXT[],
  created_at TIMESTAMP DEFAULT NOW()
);

-- Blood report uploads and AI analysis
CREATE TABLE blood_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES symptom_sessions(id),
  patient_id UUID REFERENCES users(id),
  image_path TEXT NOT NULL,
  extracted_values JSONB,
  analysis JSONB,
  tablet_recommendations JSONB,
  complexity_flag BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Doctor profiles
CREATE TABLE doctor_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  specialization VARCHAR(255),
  hospital_name VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(100),
  latitude FLOAT,
  longitude FLOAT,
  phone VARCHAR(30),
  available BOOLEAN DEFAULT TRUE
);

-- Doctor assist sessions
CREATE TABLE doctor_assist_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID REFERENCES users(id),
  patient_summary JSONB,
  suggested_tests TEXT[],
  created_at TIMESTAMP DEFAULT NOW()
);

-- Agent execution audit log (required for course submission)
CREATE TABLE agent_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID,
  agent_name VARCHAR(100),
  steps JSONB,
  total_turns INT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 6. Gemini Agent Architecture

### How Gemini Function Calling Works

Gemini's function calling is equivalent to Claude's tool use. The agent loop:

```
User Request
     |
     v
Gemini Agent (Reasoning Loop)
     |
     |---> Calls Tool A (e.g., OpenFDA drug search)
     |           └── Gets drug data back
     |---> Calls Tool B (e.g., RxNorm interaction check)
     |           └── Gets interaction warnings back
     |---> Reasons over all tool results
     |
     v
Final Structured Answer (JSON)
```

### Gemini SDK Setup (`server/services/geminiService.js`)

```js
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Standard text model
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });

// Vision model (same model, different input)
const visionModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });
```

### Shared Agentic Loop (`server/agents/agentRunner.js`)

```js
const { GoogleGenerativeAI, FunctionCallingMode } = require('@google/generative-ai');
const { executeToolCall } = require('./tools/medicalTools');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const MAX_TURNS = 10;

async function runAgentLoop(systemPrompt, userMessage, toolDefinitions, sessionId, emitStep) {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash-lite',
    systemInstruction: systemPrompt,
    tools: [{ functionDeclarations: toolDefinitions }],
    toolConfig: { functionCallingConfig: { mode: FunctionCallingMode.AUTO } }
  });

  const chat = model.startChat({ history: [] });
  const steps = [];
  let turns = 0;

  let response = await chat.sendMessage(userMessage);

  while (turns < MAX_TURNS) {
    turns++;
    const candidate = response.response.candidates[0];
    const parts = candidate.content.parts;

    // Check if agent wants to call tools
    const functionCalls = parts.filter(p => p.functionCall);

    if (functionCalls.length === 0) {
      // Agent finished — extract final text answer
      const finalText = parts.find(p => p.text)?.text || '';
      await saveAgentLog(sessionId, 'agent', steps, turns);
      return parseJsonFromText(finalText);
    }

    // Execute all tool calls
    const toolResults = [];
    for (const part of functionCalls) {
      const { name, args } = part.functionCall;

      if (emitStep) emitStep({ tool: name, input: args, status: 'running' });

      const result = await executeToolCall(name, args);
      steps.push({ tool_called: name, input: args, output: result, timestamp: new Date() });

      if (emitStep) emitStep({ tool: name, input: args, output: result, status: 'done' });

      toolResults.push({
        functionResponse: { name, response: { result } }
      });
    }

    // Feed tool results back to Gemini
    response = await chat.sendMessage(toolResults);
  }

  throw new Error('Agent exceeded max turns limit');
}

function parseJsonFromText(text) {
  const match = text.match(/```json\n?([\s\S]*?)\n?```/) || text.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
  if (!match) throw new Error('Could not parse JSON from agent response');
  return JSON.parse(match[1] || match[0]);
}

module.exports = { runAgentLoop };
```

### Tool Definitions (`server/agents/tools/medicalTools.js`)

```js
// Gemini uses "functionDeclarations" format (not "tools" like Claude)
const toolDefinitions = [
  {
    name: 'search_drug_by_condition',
    description: 'Search OpenFDA for FDA-approved drugs used to treat a specific medical condition.',
    parameters: {
      type: 'OBJECT',
      properties: {
        condition: { type: 'STRING', description: 'Medical condition name, e.g. Type 2 Diabetes' },
        limit: { type: 'INTEGER', description: 'Max results to return', default: 5 }
      },
      required: ['condition']
    }
  },
  {
    name: 'check_drug_interactions',
    description: 'Check for known interactions between a list of drugs using RxNorm API.',
    parameters: {
      type: 'OBJECT',
      properties: {
        drug_names: {
          type: 'ARRAY',
          items: { type: 'STRING' },
          description: 'List of drug names to check interactions between'
        }
      },
      required: ['drug_names']
    }
  },
  {
    name: 'get_drug_details',
    description: 'Get detailed drug info from OpenFDA: warnings, contraindications, dosage, side effects.',
    parameters: {
      type: 'OBJECT',
      properties: {
        drug_name: { type: 'STRING', description: 'Generic or brand drug name' }
      },
      required: ['drug_name']
    }
  },
  {
    name: 'get_lab_reference_range',
    description: 'Get standard clinical reference range for a blood test parameter.',
    parameters: {
      type: 'OBJECT',
      properties: {
        parameter: { type: 'STRING', description: 'Blood test parameter name, e.g. Hemoglobin' },
        age: { type: 'INTEGER' },
        gender: { type: 'STRING', enum: ['male', 'female', 'other'] }
      },
      required: ['parameter']
    }
  },
  {
    name: 'lookup_icd_code',
    description: 'Look up ICD-10 code for a disease name using NIH ClinicalTables API.',
    parameters: {
      type: 'OBJECT',
      properties: {
        disease_name: { type: 'STRING' }
      },
      required: ['disease_name']
    }
  }
];

// Tool implementations
async function executeToolCall(name, args) {
  switch (name) {
    case 'search_drug_by_condition':   return await searchDrugByCondition(args.condition, args.limit || 5);
    case 'check_drug_interactions':    return await checkDrugInteractions(args.drug_names);
    case 'get_drug_details':           return await getDrugDetails(args.drug_name);
    case 'get_lab_reference_range':    return getReferenceRange(args.parameter, args.age, args.gender);
    case 'lookup_icd_code':            return await lookupIcdCode(args.disease_name);
    default:                           return { error: 'Unknown tool: ' + name };
  }
}

async function searchDrugByCondition(condition, limit = 5) {
  const url = `https://api.fda.gov/drug/label.json?search=indications_and_usage:"${encodeURIComponent(condition)}"&limit=${limit}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.results) return { drugs: [] };
  return {
    drugs: data.results.map(d => ({
      generic_name: d.openfda?.generic_name?.[0] || 'Unknown',
      brand_name: d.openfda?.brand_name?.[0] || 'Unknown',
      dosage: d.dosage_and_administration?.[0]?.substring(0, 300) || 'See label'
    }))
  };
}

async function checkDrugInteractions(drugNames) {
  const names = drugNames.join('+');
  const url = `https://rxnav.nlm.nih.gov/REST/interaction/list.json?names=${encodeURIComponent(names)}`;
  const res = await fetch(url);
  const data = await res.json();
  const pairs = data.fullInteractionTypeGroup?.[0]?.fullInteractionType || [];
  return {
    interactions: pairs.map(p => ({
      drugs: p.minConcept.map(c => c.name),
      severity: p.fullInteraction?.[0]?.interactionPair?.[0]?.severity || 'unknown',
      description: p.fullInteraction?.[0]?.interactionPair?.[0]?.description || ''
    }))
  };
}

async function getDrugDetails(drugName) {
  const url = `https://api.fda.gov/drug/label.json?search=openfda.generic_name:"${encodeURIComponent(drugName)}"&limit=1`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.results?.[0]) return { error: 'Drug not found' };
  const d = data.results[0];
  return {
    warnings: d.warnings?.[0]?.substring(0, 400) || '',
    contraindications: d.contraindications?.[0]?.substring(0, 400) || '',
    dosage: d.dosage_and_administration?.[0]?.substring(0, 400) || '',
    side_effects: d.adverse_reactions?.[0]?.substring(0, 400) || ''
  };
}

async function lookupIcdCode(diseaseName) {
  const url = `https://clinicaltables.nlm.nih.gov/api/icd10cm/v3/search?terms=${encodeURIComponent(diseaseName)}&maxList=1`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data[3]?.[0]) return { icd_code: 'Unknown', description: diseaseName };
  return { icd_code: data[3][0][0], description: data[3][0][1] };
}

function getReferenceRange(parameter, age, gender) {
  // Hardcoded lookup table for ~40 common parameters
  const ranges = {
    'hemoglobin':     { male: '13.5-17.5 g/dL', female: '12.0-15.5 g/dL', unit: 'g/dL' },
    'wbc':            { male: '4.5-11.0 x10^9/L', female: '4.5-11.0 x10^9/L', unit: 'x10^9/L' },
    'platelets':      { male: '150-400 x10^9/L', female: '150-400 x10^9/L', unit: 'x10^9/L' },
    'glucose':        { male: '70-99 mg/dL', female: '70-99 mg/dL', unit: 'mg/dL' },
    'creatinine':     { male: '0.7-1.3 mg/dL', female: '0.6-1.1 mg/dL', unit: 'mg/dL' },
    'bun':            { male: '8-20 mg/dL', female: '8-20 mg/dL', unit: 'mg/dL' },
    'sodium':         { male: '136-145 mEq/L', female: '136-145 mEq/L', unit: 'mEq/L' },
    'potassium':      { male: '3.5-5.1 mEq/L', female: '3.5-5.1 mEq/L', unit: 'mEq/L' },
    'cholesterol':    { male: '<200 mg/dL', female: '<200 mg/dL', unit: 'mg/dL' },
    'ldl':            { male: '<100 mg/dL', female: '<100 mg/dL', unit: 'mg/dL' },
    'hdl':            { male: '>40 mg/dL', female: '>50 mg/dL', unit: 'mg/dL' },
    'triglycerides':  { male: '<150 mg/dL', female: '<150 mg/dL', unit: 'mg/dL' },
    'tsh':            { male: '0.4-4.0 mIU/L', female: '0.4-4.0 mIU/L', unit: 'mIU/L' },
    'alt':            { male: '7-56 U/L', female: '7-45 U/L', unit: 'U/L' },
    'ast':            { male: '10-40 U/L', female: '10-35 U/L', unit: 'U/L' },
    'hba1c':          { male: '<5.7%', female: '<5.7%', unit: '%' },
    'ferritin':       { male: '24-336 ng/mL', female: '11-307 ng/mL', unit: 'ng/mL' },
    'vitamin d':      { male: '20-50 ng/mL', female: '20-50 ng/mL', unit: 'ng/mL' },
    'vitamin b12':    { male: '200-900 pg/mL', female: '200-900 pg/mL', unit: 'pg/mL' },
    'uric acid':      { male: '3.4-7.0 mg/dL', female: '2.4-6.0 mg/dL', unit: 'mg/dL' }
  };
  const key = parameter.toLowerCase();
  const found = ranges[key];
  if (!found) return { parameter, range: 'Not in local table — consult lab reference', unit: '' };
  const range = gender === 'female' ? found.female : found.male;
  return { parameter, range, unit: found.unit };
}

module.exports = { toolDefinitions, executeToolCall };
```

### Three Agents

| Agent | File | Purpose |
|-------|------|---------|
| **Diagnostic Agent** | `diagnosticAgent.js` | Symptoms → Top 5 diseases with verified ICD codes |
| **Blood Report Agent** | `bloodReportAgent.js` | OCR values → Analysis → FDA-verified medication plan |
| **Doctor Assist Agent** | `doctorAssistAgent.js` | Doctor's prescription → Missing blood test suggestions |

---

## 7. API Routes

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/api/auth/register` | None | Register patient or doctor |
| POST | `/api/auth/login` | None | Login, returns JWT |
| PUT | `/api/patient/profile` | Patient | Save/update health profile |
| POST | `/api/disease/predict` | Patient | Run Diagnostic Agent |
| POST | `/api/disease/tests` | Patient | Get recommended blood tests |
| POST | `/api/blood-report/upload` | Patient | Upload image → run Blood Report Agent |
| GET | `/api/doctors/nearby` | Patient | Get nearby doctors (Haversine) |
| POST | `/api/doctor-assist/suggest-tests` | Doctor | Run Doctor Assist Agent |
| GET | `/api/agent/status/:sessionId` | Any | SSE stream of live agent steps |

---

## 8. Frontend Pages

| Route | Component | Description |
|-------|-----------|-------------|
| `/login` | `Auth/Login.jsx` | Email + password login |
| `/register` | `Auth/Register.jsx` | Role selection + registration |
| `/patient/intake` | `Patient/Intake.jsx` | 3-step symptom wizard |
| `/patient/results` | `Patient/Results.jsx` | Top 5 diseases (ranked cards) |
| `/patient/tests` | `Patient/Tests.jsx` | Recommended blood tests |
| `/patient/upload-report` | `Patient/UploadReport.jsx` | Drag-drop image upload |
| `/patient/analysis` | `Patient/Analysis.jsx` | Full blood report analysis |
| `/patient/doctors` | `Patient/Doctors.jsx` | Leaflet map + doctor list |
| `/doctor/dashboard` | `Doctor/Dashboard.jsx` | Recent sessions |
| `/doctor/assist` | `Doctor/Assist.jsx` | AI test suggestion tool |

---

## 9. 15-Day Detailed Build Plan

> **Start Date**: Day 1 = March 7, 2026 | **Deadline**: March 21, 2026
> **Daily commitment**: ~4-6 hours of focused work

---

### DAY 1 — Project Scaffold & Database Setup
**Goal**: Running skeleton with DB connected

**Tasks**:
- [ ] Create `medassist/` root folder
- [ ] Init `client/` with Vite + React: `npm create vite@latest client -- --template react`
- [ ] Install client deps: `npm install react-router-dom axios tailwindcss react-hook-form react-hot-toast leaflet react-leaflet`
- [ ] Set up Tailwind: `npx tailwindcss init -p`
- [ ] Install shadcn/ui: `npx shadcn@latest init`
- [ ] Init `server/` with Express: `npm init -y`
- [ ] Install server deps: `npm install express cors dotenv pg bcryptjs jsonwebtoken multer @google/generative-ai express-rate-limit`
- [ ] Install server dev deps: `npm install -D nodemon`
- [ ] Create `server/db/pool.js` — pg Pool using `DATABASE_URL`
- [ ] Create `server/db/schema.sql` — full schema (all 7 tables)
- [ ] Create `server/db/seed.sql` — 2 patients, 2 doctors, 5 doctor profiles
- [ ] Set up PostgreSQL (Supabase free tier OR `docker-compose.yml` with postgres image)
- [ ] Run schema + seed
- [ ] Create `server/index.js` with basic Express app, all routes stubbed (return 501)
- [ ] Create `.env.example` and `.env`
- [ ] Create `.gitignore`
- [ ] Verify: `node server/index.js` starts without errors, DB connection succeeds

**Deliverable**: Server starts, DB schema created, all tables present.

---

### DAY 2 — Authentication Backend + Frontend
**Goal**: Full working login/register system

**Tasks**:

*Backend*:
- [ ] `server/routes/auth.js` — POST `/register`, POST `/login`
- [ ] `server/controllers/authController.js`:
  - `register`: hash password with bcrypt, insert user, insert profile row, return JWT
  - `login`: verify email + password, return JWT with `{ userId, role, name }`
- [ ] `server/middleware/auth.js` — verify JWT, attach `req.user`
- [ ] Test both endpoints with Postman/curl

*Frontend*:
- [ ] `client/src/context/AuthContext.jsx` — store JWT in React state (NOT localStorage)
- [ ] `client/src/services/api.js` — Axios instance with base URL + auth interceptor
- [ ] `client/src/pages/Auth/Register.jsx` — form with: name, email, password, role toggle (Patient/Doctor), doctor-only fields (specialization, hospital, city)
- [ ] `client/src/pages/Auth/Login.jsx` — email + password form
- [ ] `client/src/components/PrivateRoute.jsx` — redirect if no JWT or wrong role
- [ ] Set up `App.jsx` with React Router: public routes (login, register), protected patient routes, protected doctor routes
- [ ] Add Navbar component with logout button

**Deliverable**: Can register as patient or doctor, login redirects to correct dashboard.

---

### DAY 3 — Patient Profile + Symptom Intake Form
**Goal**: Multi-step symptom collection wizard complete

**Tasks**:

*Backend*:
- [ ] `server/routes/patient.js` — PUT `/api/patient/profile`
- [ ] `server/models/queries.js` — `upsertPatientProfile(userId, profileData)`, `getPatientProfile(userId)`
- [ ] `server/routes/disease.js` — stub POST `/api/disease/predict` (return mock data for now)

*Frontend*:
- [ ] `client/src/pages/Patient/Intake.jsx` — 3-step wizard using `react-hook-form`:
  - **Step 1 — Personal Info**: Age, gender, weight (kg), height (cm), blood group (select)
  - **Step 2 — Medical History**: Existing conditions (multi-checkbox), allergies (tag input), current medications (tag input), smoking status, alcohol use
  - **Step 3 — Symptoms**: Organized by body system with checkboxes. For each selected symptom: duration input, severity slider (1-10), onset (sudden/gradual radio)
    - General: Fever, fatigue, weight loss, night sweats, chills
    - Respiratory: Cough, shortness of breath, chest pain, wheezing
    - Digestive: Nausea, vomiting, abdominal pain, diarrhea, constipation
    - Neurological: Headache, dizziness, numbness, memory issues
    - Musculoskeletal: Joint pain, muscle weakness, swelling
    - Skin: Rash, jaundice, pallor, bruising
    - Urinary: Frequency, burning, dark urine, blood in urine
- [ ] Progress bar between steps
- [ ] Form validation on each step before proceeding
- [ ] On submit: save profile (step 1+2), then call `/api/disease/predict` (step 3 symptoms)
- [ ] Loading state with spinner

**Deliverable**: Full 3-step form submits and saves profile data. Disease predict returns mock response.

---

### DAY 4 — Gemini Service + Diagnostic Agent (Core Agent)
**Goal**: Diagnostic Agent running with real Gemini API + ICD tool calls

**Tasks**:

*Backend*:
- [ ] Add `GEMINI_API_KEY` to `.env`
- [ ] `server/agents/tools/medicalTools.js` — implement all 5 tool definitions + functions:
  - `lookup_icd_code` (NIH ClinicalTables API)
  - `get_lab_reference_range` (local hardcoded JSON table, ~40 parameters)
  - `search_drug_by_condition` (OpenFDA)
  - `check_drug_interactions` (RxNorm)
  - `get_drug_details` (OpenFDA)
- [ ] `server/agents/agentRunner.js` — shared Gemini agentic loop (see code above)
- [ ] `server/utils/eventEmitter.js` — session-scoped EventEmitter map for SSE
- [ ] `server/agents/diagnosticAgent.js`:
  ```
  System prompt: Expert diagnostic AI. Analyze symptoms. Call lookup_icd_code for each
  top disease. Call get_lab_reference_range to suggest confirmatory tests.
  Return JSON: [{ disease_name, icd_code, probability_score, description, key_symptoms_matched, confirmatory_tests }]
  ```
- [ ] `server/controllers/diseaseController.js` — wire `runDiagnosticAgent()` into `/api/disease/predict`
- [ ] `server/models/queries.js` — `createSymptomSession()`, `updateSessionDiseases()`
- [ ] `server/routes/agentStatus.js` — SSE endpoint `GET /api/agent/status/:sessionId`
- [ ] `server/db/schema.sql` — ensure `agent_logs` table exists, add `saveAgentLog()` function

*Test*:
- [ ] POST to `/api/disease/predict` with sample symptoms — verify Gemini calls ICD tool, returns 5 diseases with ICD codes
- [ ] Check `agent_logs` table has entry with tool call steps

**Deliverable**: Diagnostic Agent runs, calls real NIH ICD API, returns verified diseases with ICD codes.

---

### DAY 5 — Disease Results Page + Agent Status UI
**Goal**: Patient sees live agent steps then disease prediction results

**Tasks**:

*Frontend*:
- [ ] `client/src/hooks/useAgentStatus.js` — custom hook using `EventSource` to subscribe to SSE stream
- [ ] `client/src/components/AgentStatus/AgentStatusPanel.jsx`:
  ```
  [spinner] Analyzing symptoms...                  [checkmark] Complete
  [spinner] Verifying ICD codes (3 diseases)...    [running]  Running...
  [spinner] Searching FDA drug database...          [clock]    Waiting
  ```
  Show each step as it fires. Animate transitions.
- [ ] `client/src/pages/Patient/Results.jsx` — disease prediction results:
  - Show `AgentStatusPanel` while agent runs
  - Once done, show top 5 disease cards
  - Each card: disease name, ICD code, probability bar (color-coded: green >70%, yellow 40-70%, red <40%), description, matched symptoms
  - Radio select to pick one disease
  - "Get Recommended Blood Tests" button → POST `/api/disease/tests` → navigate to `/patient/tests`

*Backend*:
- [ ] `server/services/geminiService.js` — `getRecommendedBloodTests(disease, patientProfile)`: single-turn Gemini call returning JSON array of `{ test_name, reason, normal_range }`
- [ ] `server/routes/disease.js` — POST `/api/disease/tests`
- [ ] `server/models/queries.js` — `updateSessionTests(sessionId, tests)`

**Deliverable**: Patient submits symptoms, watches agent steps live, sees 5 disease cards, selects one.

---

### DAY 6 — Blood Tests Page + Report Upload UI
**Goal**: Blood tests list displayed, upload page working

**Tasks**:

*Frontend*:
- [ ] `client/src/pages/Patient/Tests.jsx`:
  - Display recommended tests as cards: test name, why needed, normal range
  - Print-friendly CSS (`@media print`)
  - "Upload My Blood Report" CTA button
- [ ] `client/src/pages/Patient/UploadReport.jsx`:
  - Drag-and-drop zone (use `react-dropzone` or custom HTML5 drag)
  - Accept: JPG, PNG, PDF
  - Image preview after drop
  - Upload progress bar
  - "Analyze Report" button — POST multipart form to `/api/blood-report/upload`
  - Loading state: "Our AI is analyzing your report..." with animated pulse

*Backend*:
- [ ] `server/middleware/upload.js` — Multer config: accept image/pdf, save to `server/uploads/`, max 10MB
- [ ] `server/routes/bloodReport.js` — POST `/api/blood-report/upload` (stub — return mock analysis)
- [ ] `server/services/geminiService.js` — `extractBloodValuesFromImage(base64Image)`:
  - Use Gemini Vision: `model.generateContent([{ inlineData: { data: base64, mimeType } }, prompt])`
  - System prompt: "You are a medical OCR system. Extract ALL blood test parameters visible. Return ONLY JSON: [{ parameter_name, value, unit, reference_range }]"
- [ ] Test OCR with a sample blood report image

**Deliverable**: Upload page works, image previewed, Gemini Vision extracts blood values from uploaded image.

---

### DAY 7 — Blood Report Agent (Most Complex)
**Goal**: Full Blood Report Agent with FDA drug verification running

**Tasks**:

*Backend*:
- [ ] `server/agents/bloodReportAgent.js`:
  ```
  System prompt: Clinical pharmacology AI.
  RULES:
  1. Call get_lab_reference_range for EVERY extracted blood value
  2. Call search_drug_by_condition to find FDA-approved drugs for the condition
  3. Call get_drug_details for each candidate drug
  4. If patient has existing medications, call check_drug_interactions
  5. Adjust all dosages for patient weight/height
  6. Set doctor_referral_needed=true if: 3+ critical abnormalities, drug interaction found, age>70

  Return JSON: {
    root_cause,
    abnormal_findings: [{ parameter, value, reference_range, status, interpretation }],
    overall_assessment,
    treatment_solutions: [string],
    tablet_recommendations: [{ name, generic_name, fda_approved, dosage, frequency, duration, contraindication_check, note }],
    complexity_level: 'low'|'medium'|'high',
    doctor_referral_needed: bool,
    referral_reason
  }
  ```
- [ ] Wire into `POST /api/blood-report/upload` controller:
  1. Save image with Multer
  2. Convert image to base64
  3. Call `extractBloodValuesFromImage()` (Gemini Vision OCR)
  4. Call `runBloodReportAgent(extractedValues, disease, patientProfile)`
  5. Save to `blood_reports` table
  6. Return full analysis
- [ ] `server/models/queries.js` — `saveBloodReport()`, `getBloodReport()`

*Test*:
- [ ] Upload real blood report image
- [ ] Verify agent calls: get_lab_reference_range (per parameter), search_drug_by_condition, get_drug_details
- [ ] Verify drug interaction check runs if patient has existing medications
- [ ] Check agent_logs has all tool call steps

**Deliverable**: Blood Report Agent runs full agentic loop, produces FDA-grounded medication recommendations.

---

### DAY 8 — Blood Report Analysis Page
**Goal**: Full analysis results displayed beautifully

**Tasks**:

*Frontend*:
- [ ] `client/src/pages/Patient/Analysis.jsx` with 5 sections:

  **Section 1 — Summary**:
  - Overall health assessment text
  - Root cause
  - Complexity badge: Low (green) / Medium (yellow) / High (red)

  **Section 2 — Abnormal Findings Table**:
  - Columns: Parameter | Your Value | Normal Range | Status | Interpretation
  - Color rows: red for critical, orange for borderline, green for normal
  - Sortable by status

  **Section 3 — Treatment & Solutions**:
  - Bulleted list of treatment recommendations

  **Section 4 — Tablet Recommendations**:
  - Card per tablet: name, generic name, dosage, frequency, duration, FDA-approved badge, notes
  - Contraindication check badge: "Passed" (green) or "Flagged" (red)

  **Section 5 — Doctor Referral** (shown only if `doctor_referral_needed = true`):
  - Alert banner with referral reason
  - "Find a Doctor Near Me" button → navigate to `/patient/doctors`

- [ ] `AgentStatusPanel` shown during analysis loading

**Deliverable**: Complete analysis page with all sections, color-coded, personalized dosages shown.

---

### DAY 9 — Doctor Finder Map
**Goal**: Geolocation + Leaflet map + doctor list working

**Tasks**:

*Backend*:
- [ ] `server/services/locationService.js` — Haversine distance function
- [ ] `server/routes/doctors.js` — GET `/api/doctors/nearby?lat=&lng=&specialty=`:
  - Query `doctor_profiles` table
  - Calculate distance for each doctor
  - Filter by specialty if provided
  - Return sorted by distance
- [ ] Ensure `seed.sql` has 5 realistic doctors with lat/lng for one city

*Frontend*:
- [ ] `client/src/pages/Patient/Doctors.jsx`:
  - Request `navigator.geolocation` from browser
  - `useEffect` → GET `/api/doctors/nearby?lat=&lng=`
  - Leaflet map centered on user location with markers for each doctor
  - Sidebar list: doctor name, specialization, hospital, distance, phone
  - Click marker or list item → highlight + show popup
  - Filter dropdown by specialization
  - "Get Directions" link → `https://www.openstreetmap.org/directions?to=LAT,LNG`
- [ ] Install `leaflet` + `react-leaflet`: `npm install leaflet react-leaflet`

**Deliverable**: Map shows user location + nearby doctors. Filter by specialization works.

---

### DAY 10 — Doctor Auth + Dashboard + Assist Agent
**Goal**: Doctor login, dashboard, Doctor Assist Agent

**Tasks**:

*Backend*:
- [ ] `server/agents/doctorAssistAgent.js`:
  ```
  System prompt: Clinical decision support AI for doctors.
  Given patient info and existing prescribed tests:
  1. Call lookup_icd_code to confirm clinical context
  2. Call get_lab_reference_range to list standard tests for the condition
  3. Compare against existing tests — identify gaps
  Return JSON: [{ test_name, reason, urgency: 'routine'|'urgent'|'critical' }]
  Only return tests NOT in the existing prescription.
  ```
- [ ] `server/routes/doctorAssist.js` — POST `/api/doctor-assist/suggest-tests`
- [ ] `server/models/queries.js` — `saveDoctorAssistSession()`, `getDoctorAssistHistory(doctorId)`

*Frontend*:
- [ ] `client/src/pages/Doctor/Dashboard.jsx`:
  - Welcome header with doctor name
  - Recent sessions list (last 5 assist sessions)
  - "New Patient Assist" button
- [ ] `client/src/pages/Doctor/Assist.jsx`:
  - **Left panel — Patient Info Form**: age, gender, weight, height, chief complaint, symptoms (multi-select, same list as patient form), duration of illness, known conditions
  - **Right panel — Existing Prescription**: multi-select common tests OR free text. Common tests: CBC, CMP, LFT, Lipid Panel, HbA1c, TSH, Urinalysis, Blood Culture, etc.
  - "Get AI Suggestions" button → POST `/api/doctor-assist/suggest-tests`
  - AgentStatusPanel while running
  - Results table: Test Name | Reason | Urgency badge (Routine=green, Urgent=orange, Critical=red)
  - "Copy to Clipboard" button (formats as plain text list)

**Deliverable**: Doctor can submit patient case, agent suggests missing tests with urgency levels.

---

### DAY 11 — Agent Log Viewer + Error Handling
**Goal**: Agent audit trail visible, all errors handled gracefully

**Tasks**:

*Backend*:
- [ ] `server/routes/agentStatus.js` — add GET `/api/agent/logs/:sessionId` to return agent_logs entry
- [ ] Add max-turn error handling in `agentRunner.js` — if MAX_TURNS hit, fall back to direct Gemini call without tools
- [ ] Add `express-rate-limit` to all agent routes (5 req/min per IP)
- [ ] Handle OpenFDA 404s / RxNorm empty results gracefully — return `{ note: 'Data unavailable — recommend pharmacist review' }`
- [ ] Add try/catch to all controller functions with proper HTTP status codes (400, 401, 403, 500)
- [ ] Validate all request bodies (check required fields before calling agents)

*Frontend*:
- [ ] Doctor Dashboard — add "View Agent Log" button per session → modal showing tool call steps
  - Each step: tool name, input params, output summary, timestamp
  - Total turns count
  - This is your professor demo feature — show the agent's reasoning!
- [ ] Add `react-hot-toast` to all API calls:
  - Success: green toast with message
  - Error: red toast with error message
- [ ] Add Error Boundary component wrapping each page
- [ ] Handle network errors in Axios interceptor — toast on 500/network failure

**Deliverable**: Agent logs viewable in UI. All errors show user-friendly messages. Rate limiting active.

---

### DAY 12 — Full UI Polish Pass
**Goal**: Responsive, accessible, professional UI

**Tasks**:

- [ ] Color scheme audit: medical blue (#1A73E8 primary), white backgrounds, gray cards
- [ ] Mobile responsiveness: test all pages at 375px, 768px, 1280px
- [ ] Navbar: shows username + role badge, logout button
- [ ] All forms: validate on blur + on submit, show inline error messages
- [ ] Loading states: every API call shows spinner or skeleton
- [ ] Empty states: meaningful messages when no data (e.g., "No sessions yet — start a new analysis")
- [ ] Disclaimer banner on every page: "This is an educational CS 595 project. Not a substitute for professional medical advice."
- [ ] ARIA labels on all interactive elements (inputs, buttons, modals)
- [ ] Keyboard navigation: Tab order correct, modals trapfocus
- [ ] Print CSS for `/patient/tests` page
- [ ] Favicon + page titles (`<title>MedAssist AI | ...</title>`)
- [ ] Test all pages in Chrome DevTools mobile view

**Deliverable**: UI looks professional, works on mobile, accessible.

---

### DAY 13 — End-to-End Integration Testing
**Goal**: Complete patient + doctor flows tested, bugs fixed

**Tasks**:

*Patient Flow E2E*:
- [ ] Register new patient → login
- [ ] Fill 3-step intake form with realistic symptoms (e.g., fatigue + weight loss + increased thirst)
- [ ] Watch Diagnostic Agent run → verify 5 diseases returned (expect Diabetes, Hypothyroidism, etc.)
- [ ] Select disease → get blood test list → print it
- [ ] Upload a sample blood report image (use a realistic sample from internet)
- [ ] Watch Blood Report Agent run → verify: OCR extracts values, FDA drug search runs, interaction check runs
- [ ] View full analysis: abnormal findings table, tablet recommendations with personalized dosage
- [ ] Trigger doctor referral (upload a report with many abnormal values) → see referral alert
- [ ] Navigate to doctor finder map → verify doctors shown on map

*Doctor Flow E2E*:
- [ ] Register doctor → login → see dashboard
- [ ] Enter patient case + existing tests → watch Doctor Assist Agent run
- [ ] View suggested missing tests with urgency badges
- [ ] View agent log — verify tool call steps visible

*Bug fixes*:
- [ ] Fix any broken flows discovered above
- [ ] Verify no console errors in browser
- [ ] Verify all API responses are saved to DB correctly

**Deliverable**: Both complete flows work without errors.

---

### DAY 14 — Documentation
**Goal**: All required docs for course submission

**Tasks**:

- [ ] `docs/ai-prompts.md` — document all agent system prompts + tool definitions:
  - Diagnostic Agent prompt
  - Blood Report Agent prompt
  - Doctor Assist Agent prompt
  - OCR extraction prompt
  - Blood test recommendation prompt
  - Tool definitions for all 5 tools
- [ ] Update this `README.md` with:
  - Architecture diagram (Mermaid)
  - Setup instructions (clone → install → configure env → run)
  - How to run with Docker Compose
  - How to run without Docker (local PostgreSQL)
- [ ] `docs/architecture.md` — Mermaid diagram of system components + data flow
- [ ] Fill in `CS595_2026_Project_Info_Template.docx`:
  - LOF Pillar: Patient Engagement
  - Architecture diagram
  - Functional requirements list
  - User stories (patient + doctor)
  - Sprint history mapping to 15-day plan
  - AI tools used (Gemini 1.5 Flash, OpenFDA, RxNorm, NIH APIs)
- [ ] Push all code to GitHub
- [ ] Verify `.gitignore` excludes `.env`, `uploads/`, `node_modules/`

**Deliverable**: All documentation complete, code on GitHub.

---

### DAY 15 — Demo Preparation & Final Submission
**Goal**: Demo-ready, submitted

**Tasks**:

- [ ] Seed fresh demo data: reset DB, run seed.sql, create 2 demo accounts
- [ ] Prepare demo script (5-7 min walkthrough):
  1. Show patient registration
  2. Fill symptom form → watch agent steps live
  3. Show disease results with ICD codes
  4. Upload blood report → watch agent call FDA API
  5. Show analysis page with personalized dosages
  6. Show doctor referral flow + map
  7. Switch to doctor account → run Assist Agent
  8. Show agent log with tool call audit trail
- [ ] Record demo video (use OBS or Loom, screen + audio)
- [ ] Final GitHub push with clean commit history
- [ ] Submit: GitHub URL + video + Project Info Template

**Deliverable**: Project submitted. Demo video recorded.

---

## 10. Environment Setup

### Prerequisites
- Node.js 18+
- PostgreSQL 15+ (or Docker)
- Google AI Studio account (free): https://aistudio.google.com

### Get Free Gemini API Key
1. Go to https://aistudio.google.com
2. Click "Get API Key" → "Create API Key"
3. Copy the key — no billing required for free tier

### `.env` file (server/)
```
DATABASE_URL=postgresql://user:password@localhost:5432/medassist
GEMINI_API_KEY=your_gemini_api_key_here
JWT_SECRET=your_random_secret_here_min_32_chars
PORT=5000
CLIENT_URL=http://localhost:5173
```

### Install & Run

```bash
# Clone repo
git clone <your-repo-url>
cd medassist

# Setup database (with Docker)
docker run --name medassist-db -e POSTGRES_PASSWORD=password -e POSTGRES_DB=medassist -p 5432:5432 -d postgres:15
psql -h localhost -U postgres -d medassist -f server/db/schema.sql
psql -h localhost -U postgres -d medassist -f server/db/seed.sql

# Install + run backend
cd server
npm install
npm run dev   # uses nodemon

# Install + run frontend (new terminal)
cd client
npm install
npm run dev   # Vite dev server on http://localhost:5173
```

### Docker Compose (alternative)
```yaml
# docker-compose.yml
version: '3.8'
services:
  db:
    image: postgres:15
    environment:
      POSTGRES_DB: medassist
      POSTGRES_PASSWORD: password
    ports:
      - "5432:5432"
    volumes:
      - ./server/db/schema.sql:/docker-entrypoint-initdb.d/01-schema.sql
      - ./server/db/seed.sql:/docker-entrypoint-initdb.d/02-seed.sql

  server:
    build: ./server
    ports:
      - "5000:5000"
    env_file: ./server/.env
    depends_on:
      - db

  client:
    build: ./client
    ports:
      - "5173:5173"
    depends_on:
      - server
```

---

## 11. Free APIs Used

| API | Purpose | Rate Limit | Key Required |
|-----|---------|-----------|-------------|
| **Google Gemini 1.5 Flash** | All AI reasoning + Vision OCR | 15 RPM / 1M tokens/day free | Yes (free) |
| **OpenFDA** | Drug search + drug details | 240 req/min (no key), 1000/min (free key) | Optional (free) |
| **RxNorm (NIH)** | Drug interaction checking | No hard limit | No |
| **NIH ClinicalTables** | ICD-10 code lookup | No hard limit | No |
| **OpenStreetMap + Nominatim** | Map tiles + geocoding | Tile server: unlimited | No |

**Register for free OpenFDA key** (increases rate limit):
https://open.fda.gov/apis/authentication/
Store as `OPENFDA_API_KEY` in `.env`

---

## 12. Gemini vs Claude — Code Differences

If you encounter Claude-specific code examples anywhere, here are the translation patterns:

| Feature | Claude (Anthropic SDK) | Gemini (`@google/generative-ai`) |
|---------|----------------------|----------------------------------|
| Init client | `new Anthropic()` | `new GoogleGenerativeAI(apiKey)` |
| Get model | `client.messages.create(...)` | `genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' })` |
| System prompt | `system: '...'` param | `systemInstruction: '...'` in `getGenerativeModel` |
| Tool definitions | `tools: [{ name, description, input_schema }]` | `tools: [{ functionDeclarations: [{ name, description, parameters }] }]` |
| Tool schema type | `input_schema: { type: 'object', properties: {} }` | `parameters: { type: 'OBJECT', properties: {} }` (uppercase types) |
| Detect tool call | `response.stop_reason === 'tool_use'` | `part.functionCall` exists in response parts |
| Tool result format | `{ type: 'tool_result', tool_use_id, content }` | `{ functionResponse: { name, response: { result } } }` |
| Vision input | `{ type: 'image', source: { type: 'base64', ... } }` | `{ inlineData: { data: base64, mimeType } }` |
| Multi-turn chat | Manual `messages` array | `model.startChat()` + `chat.sendMessage()` |
| Final text | `response.content[0].text` | `response.response.text()` |

---

## 13. Deliverables Checklist

### Code (GitHub)
- [ ] Full source code pushed to GitHub
- [ ] `.env.example` with all required variables documented
- [ ] `README.md` with setup instructions
- [ ] `docs/ai-prompts.md` with all agent prompts
- [ ] Docker Compose file working

### Course Submission
- [ ] `CS595_2026_Project_Info_Template.docx` filled out
- [ ] LOF Pillar marked: Patient Engagement
- [ ] Architecture diagram (Mermaid in README)
- [ ] Functional requirements listed
- [ ] User stories for Patient and Doctor
- [ ] Sprint history (mapped to 15-day plan)
- [ ] Demo video (5-7 min, recorded)

### Feature Checklist
- [ ] Patient registration + login
- [ ] Doctor registration + login
- [ ] Patient symptom collection (3-step wizard)
- [ ] Diagnostic Agent (Gemini + ICD tool calls)
- [ ] Disease prediction results (top 5 with ICD codes)
- [ ] Blood test recommendations
- [ ] Blood report image upload
- [ ] Gemini Vision OCR extraction
- [ ] Blood Report Agent (Gemini + FDA + RxNorm tools)
- [ ] Personalized tablet recommendations
- [ ] Doctor referral trigger + alert
- [ ] Doctor finder map (Leaflet + OpenStreetMap)
- [ ] Doctor Assist Agent (missing test suggestions)
- [ ] Agent Status UI (live step tracking via SSE)
- [ ] Agent log viewer (tool call audit trail)
- [ ] Responsive design
- [ ] Error handling + toast notifications
- [ ] Rate limiting on agent routes
- [ ] Disclaimer banner on all pages

---

*Built for CS 595: Medical Informatics and AI | Powered by Google Gemini 1.5 Flash (Free Tier)*
