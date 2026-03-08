/**
 * geminiService.js
 *
 * Blood report OCR service.
 *
 * Strategy (Gemini free tier quota = 0 in this region):
 *   - PDF  → pdf-parse extracts raw text → Groq parses structured blood values
 *   - Image (JPG/PNG) → Gemini Vision (attempted); falls back to helpful error
 */

const fs = require('fs');
const { client: groq, MODEL: AI_MODEL } = require('../utils/aiClient');

const PARSE_PROMPT = `You are a medical data extraction AI.
Below is raw text extracted from a blood test report.
Extract ALL blood test values and return a JSON array ONLY — no markdown, no explanation.

Required structure per item:
{
  "parameter": "Hemoglobin",
  "abbreviation": "Hb",
  "value": "13.2",
  "unit": "g/dL",
  "normal_range": "13.5–17.5",
  "status": "low"
}

Rules:
- "status" must be one of: "normal", "low", "high", "critical_low", "critical_high"
- Determine status by comparing value to normal_range
- Include ALL parameters visible in the text
- If a field is missing or unclear, use "" (empty string) for that field
- Return ONLY the JSON array, nothing else`;

/**
 * Extract blood values from a PDF file using pdf-parse + Groq.
 */
async function extractFromPDF(filePath) {
  const pdfParse = require('pdf-parse');
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  const rawText = data.text.trim();

  if (!rawText) throw new Error('PDF appears to be a scanned image with no extractable text. Please upload a text-based PDF.');

  const completion = await groq.chat.completions.create({
    model: AI_MODEL,
    messages: [
      { role: 'system', content: PARSE_PROMPT },
      { role: 'user', content: `Blood report text:\n\n${rawText}` },
    ],
    temperature: 0.1,
    max_tokens: 8000,
  });

  const raw = completion.choices[0].message.content.trim();
  const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');

  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch {
    console.error('Groq returned non-JSON:', raw);
    throw new Error('Failed to parse blood values from PDF text');
  }

  if (!Array.isArray(parsed)) throw new Error('Expected array from parser');
  return parsed;
}

/**
 * Extract blood values from an image file using Gemini Vision.
 * Note: Gemini free tier quota = 0 in some regions — throws a clear error.
 */
async function extractFromImage(filePath, mimeType) {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const base64 = fs.readFileSync(filePath).toString('base64');
  const OCR_PROMPT = `Extract all blood test values from this lab report image.
Return a JSON array ONLY (no markdown). Each item: { "parameter", "abbreviation", "value", "unit", "normal_range", "status" }
status = "normal" | "low" | "high" | "critical_low" | "critical_high"`;

  const result = await model.generateContent([
    { inlineData: { data: base64, mimeType } },
    { text: OCR_PROMPT },
  ]);

  const raw = result.response.text().trim();
  const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  const parsed = JSON.parse(clean);
  if (!Array.isArray(parsed)) throw new Error('Expected array from Gemini Vision');
  return parsed;
}

/**
 * Main export: routes to correct extractor based on file type.
 */
async function extractBloodValuesFromImage(filePath, mimeType) {
  if (mimeType === 'application/pdf') {
    return await extractFromPDF(filePath);
  }
  // Image path — Gemini Vision (may fail in regions with quota=0)
  try {
    return await extractFromImage(filePath, mimeType);
  } catch (err) {
    if (err.message?.includes('quota') || err.message?.includes('429') || err.message?.includes('404')) {
      throw new Error('Image OCR is unavailable in your region (Gemini quota). Please convert your report to PDF and upload that instead.');
    }
    throw err;
  }
}

module.exports = { extractBloodValuesFromImage };
