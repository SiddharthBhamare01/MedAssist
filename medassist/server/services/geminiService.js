/**
 * geminiService.js — Blood report OCR service
 *
 * Strategy:
 *   PDF   → pdf-parse extracts raw text → Cerebras (primary provider) parses structured values
 *   Image → Gemini Vision if key works, otherwise clear error asking user to upload PDF
 */

const fs = require('fs');

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
 * Extract blood values from a PDF using pdf-parse + Cerebras (primary AI provider).
 */
async function extractFromPDF(filePath) {
  const pdfParse = require('pdf-parse');
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  const rawText = data.text.trim();

  if (!rawText) {
    throw new Error('PDF appears to be a scanned image with no extractable text. Please upload a text-based PDF.');
  }

  // Truncate to ~15 000 chars — enough for any blood report, avoids provider token limits
  const truncatedText = rawText.length > 15000 ? rawText.slice(0, 15000) + '\n[truncated]' : rawText;

  const { getProviders, getAvailableProviders } = require('../utils/aiClients');
  const providers = getProviders();
  const available = getAvailableProviders();

  let lastErr;
  for (const name of available) {
    const provider = providers[name];
    try {
      const response = await provider.client.chat.completions.create({
        model: provider.model,
        messages: [
          { role: 'system', content: PARSE_PROMPT },
          { role: 'user', content: `Blood report text:\n\n${truncatedText}` },
        ],
        temperature: 0.1,
        max_tokens: 8000,
      });

      const raw = response.choices[0].message.content.trim();
      const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');

      let parsed;
      try {
        parsed = JSON.parse(clean);
      } catch {
        console.error(`[geminiService] ${provider.name} returned non-JSON:`, raw.slice(0, 200));
        lastErr = new Error('Failed to parse blood values from PDF text');
        continue;
      }

      if (!Array.isArray(parsed)) { lastErr = new Error('Expected array from AI parser'); continue; }
      console.log(`[geminiService] PDF parsed by ${provider.name}`);
      return parsed;
    } catch (err) {
      if (err.status === 429 || err.status === 503 || err.status === 400) { lastErr = err; continue; }
      throw err;
    }
  }
  throw lastErr || new Error('All AI providers failed to parse PDF');
}

/**
 * Main export: routes to correct extractor based on file type.
 * Image OCR is not supported (no vision model configured) — PDF only.
 */
async function extractBloodValuesFromImage(filePath, mimeType) {
  if (mimeType === 'application/pdf') {
    return await extractFromPDF(filePath);
  }

  throw new Error(
    'Image uploads are not supported. Please convert your blood report to a text-based PDF and upload that instead.'
  );
}

module.exports = { extractBloodValuesFromImage };
