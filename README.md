# MedAssist AI — CS 595 Presentation Script

---

## 1. Problem Statement

> "Patients who receive blood reports often lack the medical knowledge to interpret their results — and must schedule a doctor's appointment solely for report analysis. This adds cost, time, and unnecessary friction to their healthcare journey.
>
> Existing platforms address this in silos: some tools only diagnose diseases from symptoms, others only recommend nearby doctors. No single platform bridges the full patient journey end-to-end."

---

## 2. Our Solution — MedAssist AI

> "We built MedAssist AI — a full-stack AI-powered medical informatics platform that covers the complete patient workflow in one place:
>
> - **Blood Report Upload** → OCR extracts all values, AI flags abnormal findings, generates a diet plan and risk assessment
> - **Urgency Assessment** → tells the patient how urgently they need to see a doctor based on report findings
> - **Doctor Finder** → recommends nearby doctors based on the patient's live location
>
> The AI backend runs on Groq's llama-3.3-70b model with real medical API integrations — OpenFDA, RxNorm, and NIH ClinicalTables. Let me walk you through the live application."

---

## 3. Demo — Patient Flow

---

### [Upload Blood Report]

*(Navigate to Upload Report → upload the April 29 PDF)*

> "The patient uploads their blood report — either as a PDF or by photographing it directly using the camera. We built a portrait camera viewfinder that crops to just the document, so only the report is captured.
>
> The OCR pipeline reads the PDF and extracts every parameter — hemoglobin, glucose, MCV, MCH, RDW — with their values, units, and normal ranges. Automatically."

---

### [Analysis Page — 3–4 mins]

*(Navigate to Analysis page for the April 29 report)*

> "This is the core of MedAssist AI. The Blood Report Agent runs in real time — you can see every step it's taking in the live status panel. It's making tool calls to OpenFDA and RxNorm to cross-reference each finding against medical databases."

*(Once loaded)*

**Summary Card:**
> "The Overall Summary gives the patient a personalized health snapshot written in plain language — not medical jargon. The card color changes based on complexity: amber for medium, red for high risk. The root cause is called out separately so the patient knows the primary issue."

**Parameter Progress Bars:**
> "Every abnormal parameter gets a visual gauge — this shows exactly where the patient's value sits relative to the normal range. Hemoglobin is 8% below normal, MCV is 18% below. The patient can see this at a glance without any medical background."

**Risk Score:**
> "A composite clinical risk score out of 100, broken down by organ system — cardiovascular, metabolic, and so on. This tells the patient how serious their overall picture is."

**Follow-up Schedule:**
> "The AI recommends which tests to recheck and when — with clinical reasoning for each one."

**Diet Plan:**
> "A fully personalized diet plan based on the specific deficiencies found in this patient's report — foods to eat, foods to avoid, and a daily meal schedule."

**AI Narration:**
> "The patient can hit this button and have the entire summary read aloud as audio." *(play 5 seconds, stop)* "Useful for patients who struggle to read long text."

---

### [Extra Features — on the same Analysis page]

> "We also built several additional features on this page.
>
> The patient can export the full analysis as a PDF, or print a compact summary card — a single page they can physically carry to a doctor's appointment.
>
> They can share the report via a link directly with their doctor.
>
> Every abnormal finding has an **Explain This** button — the patient clicks it and gets a plain-English AI explanation of that specific value and what it means for them personally."

*(Click Explain This on one finding — show the modal)*

> "There's also a floating AI chatbot on this page — the patient can ask things like 'what does low MCV mean for me?' or 'should I be worried about this?' and get a contextual answer based on their actual report."

---

### [Vitals Tracking]

*(Navigate to Vitals tab)*

> "Patients can log daily vitals — blood pressure, glucose, heart rate, SpO2, weight, temperature. Each is charted over the last 30 days. Below the chart, the AI generates an insight correlating the vitals data with the latest blood report — for example, connecting stable blood pressure readings with the low hemoglobin finding."

---

### [Report History]

*(Navigate to Report History)*

> "Every past report is stored here with trend charts. You can track how hemoglobin or cholesterol has moved across multiple visits — this is longitudinal monitoring, not just a one-time snapshot.
>
> We also built a **Compare Reports** feature — select any two reports and the app shows a side-by-side diff of the parameters, risk scores, and findings between visits. The patient can literally see their health improving or declining over time."

*(Select two reports to demo the comparison)*

---

### [Spanish Translation]

*(Switch language to Spanish in the navbar)*

> "The entire application is available in Spanish — including every AI-generated output. The analysis summary, diet plan, risk score, follow-up schedule — all translated. We use a batch translation system with database caching so it doesn't re-translate on every load."

*(Switch back to English)*

---

### [Doctor Finder Map]

*(Navigate to Doctors tab)*

> "Finally — if the urgency assessment flags that the patient needs medical attention, they can find a doctor right here. Built on OpenStreetMap and Leaflet — no API key required, no cost, works with the patient's live location."

---

### [Wrap Up]

> "MedAssist AI takes a patient from receiving a report they don't understand — to a full clinical interpretation, a personalized diet plan, a risk score, supplement tracking, longitudinal trend monitoring, and a nearby doctor recommendation — all in one platform, at zero cost to run.
>
> The AI layer uses Groq's llama-3.3-70b with real-world medical API integrations: OpenFDA for drug data, RxNorm for interactions, and NIH ClinicalTables for ICD-10 codes. Thank you."

---

## Pre-Demo Checklist

- [ ] Patient already logged in on dashboard
- [ ] April 29 report loaded (14 params, 5 abnormal, Score 37.5) — richest analysis
- [ ] Sample PDF ready to upload live
- [ ] Two reports selected for compare demo
- [ ] Language switcher visible in navbar
