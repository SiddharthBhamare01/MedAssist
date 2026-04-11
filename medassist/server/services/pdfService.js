const PDFDocument = require('pdfkit');

/**
 * Generate a medical report PDF from session data.
 * Returns a Promise<Buffer>.
 *
 * sessionData shape:
 *   patientName, disease, symptoms,
 *   analysis: { summary, abnormal_findings, treatment_solutions, diet_plan, recovery_ingredients },
 *   tabletRecommendations, riskScores, followUp
 */
function generateSessionPDF(sessionData) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const {
        patientName = 'Patient',
        disease = 'N/A',
        symptoms = [],
        analysis = {},
        tabletRecommendations = [],
        riskScores = null,
        followUp = null,
      } = sessionData;

      const blue = '#2563eb';
      const darkGray = '#1f2937';
      const lightGray = '#6b7280';

      // Explicitly register built-in fonts to ensure selectable text
      doc.font('Helvetica');

      // --- Header ---
      doc.font('Helvetica-Bold').fontSize(22).fillColor(blue).text('MedAssist AI', { align: 'center' });
      doc.fontSize(10).fillColor(lightGray).text('AI-Powered Medical Report', { align: 'center' });
      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e5e7eb').stroke();
      doc.moveDown(0.5);

      // --- Patient info ---
      doc.font('Helvetica').fontSize(12).fillColor(darkGray);
      doc.text(`Patient: ${patientName}`, { continued: true });
      doc.text(`    Date: ${new Date().toLocaleDateString()}`, { align: 'right' });
      doc.text(`Primary Diagnosis: ${disease}`);
      doc.moveDown(0.5);

      // --- Summary ---
      if (analysis.summary) {
        sectionHeader(doc, 'Summary');
        const s = analysis.summary;
        if (typeof s === 'object') {
          if (s.overall_assessment) doc.fontSize(10).fillColor(darkGray).text(s.overall_assessment);
          if (s.root_cause) doc.text(`Root Cause: ${s.root_cause}`);
          if (s.complexity) doc.text(`Complexity: ${s.complexity}`);
        } else {
          doc.fontSize(10).fillColor(darkGray).text(String(s));
        }
        doc.moveDown(0.5);
      }

      // --- Symptoms ---
      if (symptoms.length > 0) {
        sectionHeader(doc, 'Reported Symptoms');
        const symList = symptoms.map((s) => (typeof s === 'string' ? s : s.symptom || s.name || JSON.stringify(s)));
        doc.fontSize(10).fillColor(darkGray).text(symList.join(', '));
        doc.moveDown(0.5);
      }

      // --- Abnormal Findings ---
      if (analysis.abnormal_findings && analysis.abnormal_findings.length > 0) {
        sectionHeader(doc, 'Abnormal Findings');
        analysis.abnormal_findings.forEach((f) => {
          doc.fontSize(10).fillColor(darkGray);
          doc.text(`${f.parameter}: ${f.your_value} (Normal: ${f.normal_range}) — ${f.status}`, { indent: 10 });
          if (f.interpretation) {
            doc.fontSize(9).fillColor(lightGray).text(f.interpretation, { indent: 20 });
          }
        });
        doc.moveDown(0.5);
      }

      // --- Treatment Solutions ---
      if (analysis.treatment_solutions && analysis.treatment_solutions.length > 0) {
        sectionHeader(doc, 'Treatment Recommendations');
        analysis.treatment_solutions.forEach((t, i) => {
          doc.fontSize(10).fillColor(darkGray).text(`${i + 1}. ${t}`, { indent: 10 });
        });
        doc.moveDown(0.5);
      }

      // --- Tablet Recommendations ---
      if (tabletRecommendations.length > 0) {
        sectionHeader(doc, 'Medication Plan');
        tabletRecommendations.forEach((tab) => {
          doc.fontSize(10).fillColor(darkGray);
          doc.text(`${tab.name} (${tab.generic_name || 'N/A'})`, { indent: 10 });
          doc.fontSize(9).fillColor(lightGray);
          doc.text(`Dosage: ${tab.dosage || 'N/A'} | Frequency: ${tab.frequency || 'N/A'} | Duration: ${tab.duration || 'N/A'}`, { indent: 20 });
          if (tab.reason) doc.text(`Reason: ${tab.reason}`, { indent: 20 });
        });
        doc.moveDown(0.5);
      }

      // --- Diet Plan ---
      if (analysis.diet_plan) {
        sectionHeader(doc, 'Diet Plan');
        if (typeof analysis.diet_plan === 'string') {
          doc.fontSize(10).fillColor(darkGray).text(analysis.diet_plan);
        } else if (typeof analysis.diet_plan === 'object') {
          Object.entries(analysis.diet_plan).forEach(([key, val]) => {
            doc.fontSize(10).fillColor(darkGray).text(`${key}: ${Array.isArray(val) ? val.join(', ') : val}`, { indent: 10 });
          });
        }
        doc.moveDown(0.5);
      }

      // --- Recovery Ingredients ---
      if (analysis.recovery_ingredients && analysis.recovery_ingredients.length > 0) {
        sectionHeader(doc, 'Recovery Ingredients');
        doc.fontSize(10).fillColor(darkGray).text(analysis.recovery_ingredients.join(', '), { indent: 10 });
        doc.moveDown(0.5);
      }

      // --- Risk Scores ---
      if (riskScores && typeof riskScores === 'object') {
        sectionHeader(doc, 'Clinical Risk Score');
        doc.font('Helvetica').fontSize(10).fillColor(darkGray);
        if (riskScores.composite_score != null) {
          doc.text(`Composite Score: ${riskScores.composite_score}/100 — ${riskScores.risk_level || 'N/A'} Risk`, { indent: 10 });
        }
        if (riskScores.summary) {
          doc.text(riskScores.summary, { indent: 10 });
        }
        if (Array.isArray(riskScores.breakdown)) {
          riskScores.breakdown.forEach((b) => {
            doc.text(`${b.area}: ${b.score ?? 'N/A'}/100 — ${b.note || ''}`, { indent: 20 });
          });
        }
        doc.moveDown(0.5);
      }

      // --- Follow-up Schedule ---
      if (followUp && Array.isArray(followUp) && followUp.length > 0) {
        sectionHeader(doc, 'Follow-up Schedule');
        followUp.forEach((f) => {
          doc.fontSize(10).fillColor(darkGray);
          doc.text(`${f.test} — Recheck in ${f.recheck_in}`, { indent: 10 });
          if (f.reason) doc.fontSize(9).fillColor(lightGray).text(f.reason, { indent: 20 });
        });
        doc.moveDown(0.5);
      }

      // --- Footer ---
      doc.moveDown(1);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e5e7eb').stroke();
      doc.moveDown(0.3);
      doc.fontSize(8).fillColor(lightGray)
        .text('This report is AI-generated and should not replace professional medical advice. Always consult a healthcare provider.', { align: 'center' });
      doc.text('Generated by MedAssist AI', { align: 'center' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function sectionHeader(doc, title) {
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#2563eb').text(title);
  doc.font('Helvetica');
  doc.moveDown(0.2);
}

module.exports = { generateSessionPDF };
