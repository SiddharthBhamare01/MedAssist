const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

/** Sanitize a string — strip garbled unicode, keep printable ASCII + common medical symbols */
function sanitize(str) {
  if (str === null || str === undefined) return '';
  if (typeof str !== 'string') str = String(str);
  // Replace common unicode superscripts used in lab units
  str = str
    .replace(/µ|μ/g, 'u')          // micro
    .replace(/³/g, '3')
    .replace(/²/g, '2')
    .replace(/°/g, ' deg')
    .replace(/≥/g, '>=')
    .replace(/≤/g, '<=')
    .replace(/–|—/g, '-');
  // Strip remaining non-ASCII garbage (garbled OCR artifacts)
  return str.replace(/[^\x20-\x7E\/\.,\-\+\(\)\[\]%:]/g, '').trim();
}

const STATUS_STYLE = {
  high:          'background:#fef2f2;color:#b91c1c;border:1px solid #fecaca',
  low:           'background:#fffbeb;color:#92400e;border:1px solid #fcd34d',
  critical_high: 'background:#fee2e2;color:#7f1d1d;border:1px solid #fca5a5',
  critical_low:  'background:#fee2e2;color:#7f1d1d;border:1px solid #fca5a5',
  normal:        'background:#f0fdf4;color:#166534;border:1px solid #bbf7d0',
};
const STATUS_LABEL = {
  high: 'HIGH', low: 'LOW', critical_high: 'CRIT HIGH',
  critical_low: 'CRIT LOW', normal: 'NORMAL',
};
const COMPLEXITY_STYLE = {
  High:   'background:#dc2626;color:#fff',
  Medium: 'background:#d97706;color:#fff',
  Low:    'background:#059669;color:#fff',
};

function riskColor(level) {
  return { Critical: '#ef4444', High: '#f97316', Moderate: '#f59e0b', Low: '#10b981' }[level] ?? '#64748b';
}
function barColor(score) {
  if (score >= 76) return '#ef4444';
  if (score >= 51) return '#f97316';
  if (score >= 26) return '#f59e0b';
  return '#10b981';
}

function sectionHeader(title, sub = '') {
  return `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
      <span style="font-size:10px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:#94a3b8;white-space:nowrap">${title}</span>
      ${sub ? `<span style="font-size:10px;color:#cbd5e1">${sub}</span>` : ''}
      <div style="flex:1;height:1px;background:#e2e8f0"></div>
    </div>`;
}

function buildHtml({ patientName, disease, symptoms, analysis, tabletRecommendations, riskScores, followUp }) {
  const sum = analysis.summary || {};
  const abnormal = analysis.abnormal_findings || [];
  const treatments = analysis.treatment_solutions || [];
  const dietPlan = analysis.diet_plan || null;
  const recovery = analysis.recovery_ingredients || [];
  const tabs = tabletRecommendations || [];
  const rs = riskScores || null;
  const fu = Array.isArray(followUp) ? followUp : (followUp ? [followUp] : []);
  const compStyle = COMPLEXITY_STYLE[sum.complexity] ?? 'background:#475569;color:#fff';

  // ── Abnormal findings table ──
  const findingsRows = abnormal.map((f, i) => {
    const s = STATUS_STYLE[f.status] ?? STATUS_STYLE.normal;
    const label = STATUS_LABEL[f.status] ?? f.status;
    return `
      <tr style="background:${i % 2 === 0 ? '#fff' : '#f8fafc'}">
        <td style="padding:7px 10px;font-weight:600;color:#1e293b;white-space:nowrap">${sanitize(f.parameter)}</td>
        <td style="padding:7px 10px;font-family:monospace;color:#334155;white-space:nowrap">${sanitize(f.your_value)}</td>
        <td style="padding:7px 10px;font-family:monospace;color:#64748b;font-size:11px;white-space:nowrap">${sanitize(f.normal_range)}</td>
        <td style="padding:7px 10px">
          <span style="padding:2px 7px;border-radius:3px;font-size:10px;font-weight:700;letter-spacing:0.06em;${s}">${label}</span>
        </td>
        <td style="padding:7px 10px;color:#64748b;font-size:11px;line-height:1.4;max-width:200px">${sanitize(f.interpretation)}</td>
      </tr>`;
  }).join('');

  // ── Medication rows ──
  const medRows = tabs.map((m, i) => {
    const name = sanitize(m.name || m.generic_name || 'Unknown');
    const generic = m.generic_name && m.generic_name !== m.name ? `<span style="font-family:monospace;font-size:11px;color:#94a3b8;margin-left:6px">(${sanitize(m.generic_name)})</span>` : '';
    return `
      <div style="display:flex;gap:16px;border:1px solid #e2e8f0;border-radius:6px;padding:14px;margin-bottom:10px">
        <div style="width:30px;height:30px;border-radius:50%;background:#0d9488;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0">${i + 1}</div>
        <div style="flex:1;min-width:0">
          <div style="margin-bottom:6px">
            <span style="font-weight:700;color:#0f172a;font-size:14px">${name}</span>${generic}
          </div>
          <div style="display:flex;gap:20px;font-size:12px;color:#475569;margin-bottom:4px;flex-wrap:wrap">
            ${m.dosage ? `<span><b style="color:#334155">Dosage:</b> ${sanitize(m.dosage)}</span>` : ''}
            ${m.frequency ? `<span><b style="color:#334155">Frequency:</b> ${sanitize(m.frequency)}</span>` : ''}
            ${m.duration ? `<span><b style="color:#334155">Duration:</b> ${sanitize(m.duration)}</span>` : ''}
          </div>
          ${m.reason ? `<p style="font-size:11px;color:#94a3b8;margin:0;font-style:italic">${sanitize(m.reason)}</p>` : ''}
          ${m.contraindication_note ? `<p style="font-size:11px;color:#b45309;margin:4px 0 0;background:#fffbeb;padding:4px 8px;border-radius:4px">${sanitize(m.contraindication_note)}</p>` : ''}
        </div>
      </div>`;
  }).join('');

  // ── Treatment solutions ──
  const treatRows = treatments.map((t, i) => {
    if (typeof t === 'string') {
      return `<li style="color:#334155;font-size:13px;margin-bottom:4px">${sanitize(t)}</li>`;
    }
    const name = sanitize(t.medication || t.name || '');
    const gen = t.generic_name && t.generic_name !== (t.medication || t.name) ? ` (${sanitize(t.generic_name)})` : '';
    return `<li style="color:#334155;font-size:13px;margin-bottom:8px">
      <b>${name}${gen}</b>
      ${t.dosage ? ` — ${sanitize(t.dosage)}` : ''}${t.frequency ? `, ${sanitize(t.frequency)}` : ''}${t.duration ? ` for ${sanitize(t.duration)}` : ''}
      ${t.evidence ? `<br><span style="color:#64748b;font-size:11px">${sanitize(t.evidence)}</span>` : ''}
    </li>`;
  }).join('');

  // ── Diet plan ──
  let dietHtml = '';
  if (dietPlan) {
    const eatItems = (dietPlan.foods_to_eat || []).map(f =>
      typeof f === 'string' ? `<li>${sanitize(f)}</li>` :
      `<li><b>${sanitize(f.food)}</b>${f.reason ? ` — ${sanitize(f.reason)}` : ''}</li>`
    ).join('');
    const avoidItems = (dietPlan.foods_to_avoid || []).map(f =>
      typeof f === 'string' ? `<li>${sanitize(f)}</li>` :
      `<li><b>${sanitize(f.food)}</b>${f.reason ? ` — ${sanitize(f.reason)}` : ''}</li>`
    ).join('');
    const mealItems = (dietPlan.meal_schedule || []).map(m =>
      `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:8px 12px;margin-bottom:6px">
        <b style="font-size:11px;color:#166534;text-transform:uppercase">${sanitize(m.meal)}</b>
        <p style="margin:2px 0 0;font-size:12px;color:#334155">${sanitize(m.suggestion)}</p>
      </div>`
    ).join('');

    dietHtml = `
      <section style="margin-bottom:32px">
        ${sectionHeader('Personalized Diet Plan')}
        ${dietPlan.overview ? `<p style="font-size:13px;color:#475569;margin-bottom:12px">${sanitize(dietPlan.overview)}</p>` : ''}
        ${mealItems ? `<div style="margin-bottom:14px">${mealItems}</div>` : ''}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          ${eatItems ? `<div><p style="font-size:12px;font-weight:700;color:#166534;margin:0 0 8px">Foods to Eat</p><ul style="margin:0;padding-left:18px;color:#334155;font-size:12px">${eatItems}</ul></div>` : ''}
          ${avoidItems ? `<div><p style="font-size:12px;font-weight:700;color:#dc2626;margin:0 0 8px">Foods to Avoid</p><ul style="margin:0;padding-left:18px;color:#334155;font-size:12px">${avoidItems}</ul></div>` : ''}
        </div>
      </section>`;
  }

  // ── Recovery ingredients ──
  let recoveryHtml = '';
  if (recovery.length > 0) {
    const items = recovery.map(item => {
      if (typeof item === 'string') return `<li style="font-size:12px;color:#334155;margin-bottom:4px">${sanitize(item)}</li>`;
      return `<li style="font-size:12px;color:#334155;margin-bottom:6px">
        <b>${sanitize(item.ingredient)}</b>${item.benefit ? ` — ${sanitize(item.benefit)}` : ''}
        ${item.how_to_use ? `<br><span style="color:#0d9488;font-size:11px">${sanitize(item.how_to_use)}</span>` : ''}
      </li>`;
    }).join('');
    recoveryHtml = `
      <section style="margin-bottom:32px">
        ${sectionHeader('Recovery Ingredients')}
        <ul style="margin:0;padding-left:18px">${items}</ul>
      </section>`;
  }

  // ── Risk scores ──
  let riskHtml = '';
  if (rs) {
    const color = riskColor(rs.risk_level);
    const score = rs.composite_score ?? 0;
    const circ = 2 * Math.PI * 48;
    const dash = `${(score / 100) * circ} ${circ}`;
    const breakdown = (rs.breakdown || []).map(b => `
      <div style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
          <span style="font-weight:600;color:#334155">${sanitize(b.area)}</span>
          <span style="font-family:monospace;color:#64748b">${b.score}/100</span>
        </div>
        <div style="height:8px;background:#e2e8f0;border-radius:99px;overflow:hidden">
          <div style="height:8px;border-radius:99px;background:${barColor(b.score)};width:${b.score}%"></div>
        </div>
        ${b.note ? `<p style="font-size:10px;color:#94a3b8;margin:2px 0 0">${sanitize(b.note)}</p>` : ''}
      </div>`).join('');

    riskHtml = `
      <section style="margin-bottom:32px">
        ${sectionHeader('Clinical Risk Assessment')}
        <div style="display:flex;gap:32px;align-items:flex-start;flex-wrap:wrap">
          <div style="flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:10px">
            <div style="position:relative;width:120px;height:120px">
              <svg width="120" height="120" viewBox="0 0 112 112" style="transform:rotate(-90deg)">
                <circle cx="56" cy="56" r="48" fill="none" stroke="#e2e8f0" stroke-width="8"/>
                <circle cx="56" cy="56" r="48" fill="none" stroke="${color}" stroke-width="8"
                  stroke-dasharray="${dash}" stroke-linecap="round"/>
              </svg>
              <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
                <span style="font-size:28px;font-weight:700;color:${color}">${score}</span>
                <span style="font-size:10px;color:#94a3b8">/100</span>
              </div>
            </div>
            <span style="font-size:11px;font-weight:700;padding:3px 14px;border-radius:3px;color:#fff;background:${color}">${sanitize(rs.risk_level)} Risk</span>
          </div>
          <div style="flex:1;min-width:220px">
            ${rs.summary ? `<p style="font-size:13px;color:#475569;margin:0 0 16px;line-height:1.5">${sanitize(rs.summary)}</p>` : ''}
            ${breakdown}
          </div>
        </div>
      </section>`;
  }

  // ── Follow-up ──
  const followUpHtml = fu.length > 0 ? `
    <section style="margin-bottom:32px">
      ${sectionHeader('Follow-up Schedule')}
      ${fu.map((f, i) => `
        <div style="display:flex;gap:16px;align-items:flex-start;border:1px solid #e2e8f0;border-radius:6px;padding:12px 14px;margin-bottom:8px">
          <span style="font-size:12px;font-weight:700;color:#94a3b8;width:16px;flex-shrink:0">${i + 1}.</span>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:2px">
              <span style="font-weight:600;color:#0f172a;font-size:13px">${sanitize(f.test || f.name || '')}</span>
              <span style="font-size:11px;background:#fffbeb;color:#92400e;border:1px solid #fcd34d;padding:1px 8px;border-radius:3px">Recheck in ${sanitize(f.recheck_in || f.timeframe || '')}</span>
            </div>
            ${f.reason ? `<p style="font-size:11px;color:#64748b;margin:0">${sanitize(f.reason)}</p>` : ''}
          </div>
        </div>`).join('')}
    </section>` : '';

  // ── Symptoms ──
  const symptomText = Array.isArray(symptoms) && symptoms.length > 0
    ? symptoms.map(s => (typeof s === 'string' ? s : s.symptom || s.name || '')).filter(Boolean).map(sanitize).join(', ')
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Georgia, 'Times New Roman', serif; background: #fff; color: #1e293b; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  table { border-collapse: collapse; width: 100%; }
  ul { padding-left: 20px; }
  li { margin-bottom: 4px; }
  p { line-height: 1.6; }
</style>
</head>
<body>

<!-- HEADER -->
<div style="background:#0f172a;color:#fff;padding:36px 48px 32px">
  <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:24px">
    <div>
      <p style="font-size:10px;letter-spacing:0.25em;color:#94a3b8;text-transform:uppercase;margin-bottom:10px;font-family:system-ui,sans-serif">MedAssist AI · CS 595 Medical Informatics</p>
      <h1 style="font-size:36px;font-weight:700;line-height:1.15;letter-spacing:-0.5px">Blood Report<br><span style="color:#94a3b8">Analysis</span></h1>
    </div>
    <div style="text-align:right;flex-shrink:0">
      <p style="font-size:11px;color:#64748b;font-family:system-ui,sans-serif;margin-bottom:2px">Patient</p>
      <p style="font-size:18px;font-weight:700">${sanitize(patientName)}</p>
      <p style="font-size:12px;color:#64748b;font-family:system-ui,sans-serif;margin-top:6px">${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
      ${sum.complexity ? `<span style="display:inline-block;margin-top:10px;padding:3px 12px;font-size:10px;font-family:system-ui,sans-serif;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;border-radius:3px;${compStyle}">${sanitize(sum.complexity)} Complexity</span>` : ''}
    </div>
  </div>
</div>

<!-- Teal accent line -->
<div style="height:4px;background:linear-gradient(90deg,#0d9488,#059669)"></div>

<div style="padding:36px 48px">

  <!-- SUMMARY -->
  ${sum.overall_assessment ? `
  <section style="margin-bottom:32px">
    ${sectionHeader('Clinical Summary')}
    <div style="display:grid;grid-template-columns:4px 1fr;gap:0 16px">
      <div style="background:#0d9488;border-radius:99px"></div>
      <div>
        <p style="font-size:13px;color:#475569;line-height:1.65;margin-bottom:8px">${sanitize(sum.overall_assessment)}</p>
        ${sum.root_cause ? `<p style="font-size:13px"><b style="color:#1e293b">Root Cause:</b> <i style="color:#64748b">${sanitize(sum.root_cause)}</i></p>` : ''}
      </div>
    </div>
  </section>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin-bottom:32px"/>` : ''}

  <!-- SYMPTOMS -->
  ${symptomText ? `
  <section style="margin-bottom:32px">
    ${sectionHeader('Reported Symptoms')}
    <p style="font-size:13px;color:#475569">${symptomText}</p>
  </section>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin-bottom:32px"/>` : ''}

  <!-- ABNORMAL FINDINGS -->
  ${abnormal.length > 0 ? `
  <section style="margin-bottom:32px">
    ${sectionHeader('Abnormal Findings', `— ${abnormal.length} parameters flagged`)}
    <div style="border:1px solid #e2e8f0;border-radius:6px;overflow:hidden">
      <table style="font-family:system-ui,sans-serif;font-size:12px">
        <thead>
          <tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0">
            <th style="padding:8px 10px;text-align:left;font-weight:600;color:#64748b;font-size:10px;letter-spacing:0.08em;text-transform:uppercase">Parameter</th>
            <th style="padding:8px 10px;text-align:left;font-weight:600;color:#64748b;font-size:10px;letter-spacing:0.08em;text-transform:uppercase">Your Value</th>
            <th style="padding:8px 10px;text-align:left;font-weight:600;color:#64748b;font-size:10px;letter-spacing:0.08em;text-transform:uppercase">Normal Range</th>
            <th style="padding:8px 10px;text-align:left;font-weight:600;color:#64748b;font-size:10px;letter-spacing:0.08em;text-transform:uppercase">Status</th>
            <th style="padding:8px 10px;text-align:left;font-weight:600;color:#64748b;font-size:10px;letter-spacing:0.08em;text-transform:uppercase">Interpretation</th>
          </tr>
        </thead>
        <tbody>${findingsRows}</tbody>
      </table>
    </div>
  </section>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin-bottom:32px"/>` : ''}

  <!-- TREATMENT SOLUTIONS -->
  ${treatments.length > 0 ? `
  <section style="margin-bottom:32px">
    ${sectionHeader('Treatment Recommendations')}
    <ul style="list-style:none;padding:0">${treatRows}</ul>
  </section>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin-bottom:32px"/>` : ''}

  <!-- MEDICATION PLAN -->
  ${tabs.length > 0 ? `
  <section style="margin-bottom:32px">
    ${sectionHeader('Medication Plan')}
    ${medRows}
  </section>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin-bottom:32px"/>` : ''}

  <!-- DIET PLAN -->
  ${dietHtml}
  ${dietHtml ? '<hr style="border:none;border-top:1px solid #e2e8f0;margin-bottom:32px"/>' : ''}

  <!-- RECOVERY INGREDIENTS -->
  ${recoveryHtml}
  ${recoveryHtml ? '<hr style="border:none;border-top:1px solid #e2e8f0;margin-bottom:32px"/>' : ''}

  <!-- RISK SCORES -->
  ${riskHtml}
  ${riskHtml ? '<hr style="border:none;border-top:1px solid #e2e8f0;margin-bottom:32px"/>' : ''}

  <!-- FOLLOW-UP -->
  ${followUpHtml}

</div>

<!-- FOOTER -->
<div style="height:4px;background:linear-gradient(90deg,#0d9488,#059669)"></div>
<div style="background:#0f172a;color:#64748b;padding:14px 48px;display:flex;justify-content:space-between;align-items:center;font-family:system-ui,sans-serif;font-size:11px">
  <span>Educational use only — AI-generated report is not a substitute for professional medical advice.</span>
  <span style="color:#94a3b8;font-weight:600">MedAssist AI</span>
</div>

</body>
</html>`;
}

// Local system browsers for development (Windows / macOS / Linux desktop)
const LOCAL_BROWSERS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
];

function findLocalBrowser() {
  const fs = require('fs');
  for (const p of LOCAL_BROWSERS) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function generateSessionPDF(sessionData) {
  const html = buildHtml(sessionData);

  // On cloud (Render, Lambda) use @sparticuz/chromium; locally fall back to system Chrome.
  const localPath = findLocalBrowser();
  const executablePath = localPath || (await chromium.executablePath());
  const launchArgs = localPath
    ? ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    : chromium.args;

  console.log('[pdfService] Using browser:', executablePath);
  const browser = await puppeteer.launch({
    headless: localPath ? true : chromium.headless,
    executablePath,
    args: launchArgs,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
    return pdfBuffer;
  } finally {
    await browser.close();
  }
}

function buildSummaryCardHtml({ patientName, score, riskLevel, findings, dietPlan, followUp }) {
  const levelColor = {
    Low: '#10b981', Moderate: '#f59e0b', High: '#f97316', Critical: '#ef4444',
  }[riskLevel] ?? '#64748b';

  const circ = 2 * Math.PI * 48;
  const dash = `${((score ?? 0) / 100) * circ} ${circ}`;

  const findingsHtml = (findings || []).map((f) => {
    const arrow = ['high', 'critical_high'].includes(f.status) ? '&#8593;' : '&#8595;';
    const color = ['high', 'critical_high'].includes(f.status) ? '#dc2626' : '#d97706';
    return `
      <div style="display:flex;align-items:baseline;gap:10px;padding:8px 0;border-bottom:1px solid #f1f5f9">
        <span style="color:${color};font-size:16px;font-weight:700">${arrow}</span>
        <div>
          <span style="font-weight:700;color:#1e293b">${sanitize(f.parameter)}</span>
          <span style="color:#64748b;margin-left:8px">${sanitize(f.your_value)}${f.unit ? ' ' + sanitize(f.unit) : ''}</span>
          <span style="color:#94a3b8;font-size:11px;margin-left:4px">(normal: ${sanitize(f.normal_range || '')})</span>
        </div>
      </div>`;
  }).join('');

  const eatFoods = (dietPlan?.foods_to_eat || []).slice(0, 3);
  const avoidFoods = (dietPlan?.foods_to_avoid || []).slice(0, 3);

  const fuItems = Array.isArray(followUp) ? followUp : (followUp ? [followUp] : []);
  const recheckHtml = fuItems.slice(0, 2).map((item) =>
    `<p style="margin:0 0 6px;font-size:13px;color:#334155">
      <b>${sanitize(item.test || item.name || 'Follow-up')}</b>
      — recheck in <span style="color:#d97706">${sanitize(item.recheck_in || item.timeframe || 'TBD')}</span>
    </p>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, -apple-system, sans-serif; background: #fff; color: #1e293b; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style>
</head>
<body>
<div style="max-width:600px;margin:0 auto;padding:32px">

  <!-- Header -->
  <div style="background:#0f172a;color:#fff;padding:24px 28px;border-radius:14px;margin-bottom:24px;display:flex;align-items:center;justify-content:space-between;gap:16px">
    <div>
      <p style="font-size:10px;letter-spacing:0.2em;color:#94a3b8;text-transform:uppercase;margin:0 0 4px;font-family:system-ui,sans-serif">MedAssist AI &bull; Patient Summary Card</p>
      <h1 style="font-size:22px;font-weight:700;margin:0">${sanitize(patientName)}</h1>
      <p style="margin:4px 0 0;color:#94a3b8;font-size:11px">${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
    </div>
    ${score !== null ? `
    <div style="position:relative;width:90px;height:90px;flex-shrink:0">
      <svg width="90" height="90" viewBox="0 0 112 112" style="transform:rotate(-90deg)">
        <circle cx="56" cy="56" r="48" fill="none" stroke="#1e293b" stroke-width="10"/>
        <circle cx="56" cy="56" r="48" fill="none" stroke="${levelColor}" stroke-width="10"
          stroke-dasharray="${dash}" stroke-linecap="round"/>
      </svg>
      <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
        <span style="font-size:22px;font-weight:700;color:${levelColor}">${score}</span>
        <span style="font-size:9px;color:#64748b">/100</span>
      </div>
    </div>` : ''}
  </div>

  ${riskLevel ? `
  <div style="text-align:center;margin-bottom:20px">
    <span style="display:inline-block;padding:5px 20px;background:${levelColor};color:#fff;border-radius:99px;font-weight:700;font-size:13px;letter-spacing:0.05em">
      ${sanitize(riskLevel)} Risk
    </span>
  </div>` : ''}

  <!-- Key Findings -->
  ${findingsHtml ? `
  <div style="border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin-bottom:20px">
    <h2 style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.12em;margin:0 0 12px">Top Findings</h2>
    ${findingsHtml}
  </div>` : ''}

  <!-- Foods -->
  ${(eatFoods.length > 0 || avoidFoods.length > 0) ? `
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:20px">
    ${eatFoods.length > 0 ? `
    <div style="border:1px solid #bbf7d0;border-radius:12px;padding:16px;background:#f0fdf4">
      <h3 style="font-size:11px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 10px">Eat More</h3>
      ${eatFoods.map((f) => `<p style="margin:0 0 5px;font-size:12px;color:#334155">&#10003; ${sanitize(typeof f === 'string' ? f : f.food)}</p>`).join('')}
    </div>` : ''}
    ${avoidFoods.length > 0 ? `
    <div style="border:1px solid #fecaca;border-radius:12px;padding:16px;background:#fef2f2">
      <h3 style="font-size:11px;font-weight:700;color:#dc2626;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 10px">Avoid</h3>
      ${avoidFoods.map((f) => `<p style="margin:0 0 5px;font-size:12px;color:#334155">&#10005; ${sanitize(typeof f === 'string' ? f : f.food)}</p>`).join('')}
    </div>` : ''}
  </div>` : ''}

  <!-- Next Recheck -->
  ${recheckHtml ? `
  <div style="border:1px solid #fcd34d;border-radius:12px;padding:16px;background:#fffbeb;margin-bottom:20px">
    <h3 style="font-size:11px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 10px">Next Recheck</h3>
    ${recheckHtml}
  </div>` : ''}

  <!-- Footer -->
  <p style="font-size:10px;color:#94a3b8;text-align:center;border-top:1px solid #e2e8f0;padding-top:14px;line-height:1.5">
    Educational use only &mdash; AI-generated summary is not a substitute for professional medical advice.<br>
    MedAssist AI &bull; CS 595 Medical Informatics Project
  </p>
</div>
</body>
</html>`;
}

async function generateSummaryCardPDF(data) {
  const html = buildSummaryCardHtml(data);

  const localPath = findLocalBrowser();
  const executablePath = localPath || (await chromium.executablePath());
  const launchArgs = localPath
    ? ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    : chromium.args;

  const browser = await puppeteer.launch({
    headless: localPath ? true : chromium.headless,
    executablePath,
    args: launchArgs,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
    return pdfBuffer;
  } finally {
    await browser.close();
  }
}

module.exports = { generateSessionPDF, generateSummaryCardPDF };
