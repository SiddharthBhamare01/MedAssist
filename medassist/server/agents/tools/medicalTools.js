const fetch = require('node-fetch');

// Reference ranges live in one shared module so the deterministic anemia
// classifier and this tool layer agree on a single source of truth.
const { REFERENCE_RANGES } = require('../../data/referenceRanges');

// ── Tool Definitions (Gemini functionDeclarations format) ─────────────────────
// OpenAI/Groq-compatible function definitions (lowercase types)
const definitions = [
  {
    name: 'lookup_icd_code',
    description: 'Look up official ICD-10-CM codes for a disease or medical condition using the NIH ClinicalTables database. Always call this for each suspected disease.',
    parameters: {
      type: 'object',
      properties: {
        condition_name: {
          type: 'string',
          description: 'Name of the disease or medical condition to look up (e.g., "type 2 diabetes mellitus")',
        },
      },
      required: ['condition_name'],
    },
  },
  {
    name: 'get_lab_reference_range',
    description: 'Get the normal reference range for a laboratory blood test parameter.',
    parameters: {
      type: 'object',
      properties: {
        parameter_name: {
          type: 'string',
          description: 'Lab parameter name in lowercase (e.g., hemoglobin, glucose, tsh, creatinine, hba1c)',
        },
      },
      required: ['parameter_name'],
    },
  },
  {
    name: 'search_drug_by_condition',
    description: 'Search for FDA-approved drugs used to treat a medical condition using OpenFDA.',
    parameters: {
      type: 'object',
      properties: {
        condition_name: {
          type: 'string',
          description: 'Medical condition to find approved treatments for',
        },
      },
      required: ['condition_name'],
    },
  },
  {
    name: 'check_drug_interactions',
    description: 'Check for clinically significant interactions between multiple drugs using the RxNorm API.',
    parameters: {
      type: 'object',
      properties: {
        drug_names: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of drug generic names to check for interactions (min 2)',
        },
      },
      required: ['drug_names'],
    },
  },
  {
    name: 'get_drug_details',
    description: 'Get detailed FDA label information for a specific drug including dosage, contraindications, and warnings.',
    parameters: {
      type: 'object',
      properties: {
        drug_name: {
          type: 'string',
          description: 'Generic or brand name of the drug',
        },
      },
      required: ['drug_name'],
    },
  },
];

// ── Tool Implementations ───────────────────────────────────────────────────────

async function lookupIcdCode({ condition_name }) {
  try {
    const encoded = encodeURIComponent(condition_name);
    const url = `https://clinicaltables.nlm.nih.gov/api/icd10cm/v3/search?terms=${encoded}&maxList=5&sf=code,name&df=code,name`;
    const res = await fetch(url, { timeout: 8000 });
    const data = await res.json();
    // Response: [total, [codes], null, [[code, name], ...]]
    const results = (data[3] || []).map(([code, name]) => ({ code, name }));
    if (results.length === 0) return { results: [], note: 'No ICD-10 code found for this condition' };
    return { results };
  } catch (err) {
    return { error: `ICD lookup failed: ${err.message}` };
  }
}

async function getLabReferenceRange({ parameter_name }) {
  const key = parameter_name.toLowerCase().replace(/[\s\-]/g, '_');
  const range = REFERENCE_RANGES[key];
  if (!range) {
    // Try partial match
    const match = Object.keys(REFERENCE_RANGES).find(k => k.includes(key) || key.includes(k));
    if (match) return { parameter: match, ...REFERENCE_RANGES[match] };
    return { note: `Reference range not found for "${parameter_name}". Consult clinical guidelines.` };
  }
  return { parameter: key, ...range };
}

async function searchDrugByCondition({ condition_name }) {
  try {
    const encoded = encodeURIComponent(`"${condition_name}"`);
    const url = `https://api.fda.gov/drug/label.json?search=indications_and_usage:${encoded}&limit=5`;
    const res = await fetch(url, { timeout: 10000 });
    if (res.status === 404) return { drugs: [], note: 'No FDA-approved drugs found for this condition' };
    const data = await res.json();
    const drugs = (data.results || []).map((d) => ({
      brand_name: d.openfda?.brand_name?.[0] || 'Unknown',
      generic_name: d.openfda?.generic_name?.[0] || 'Unknown',
      manufacturer: d.openfda?.manufacturer_name?.[0] || 'Unknown',
      indications: d.indications_and_usage?.[0]?.slice(0, 300) || '',
    }));
    return { drugs };
  } catch (err) {
    return { error: `Drug search failed: ${err.message}` };
  }
}

async function checkDrugInteractions({ drug_names }) {
  if (!Array.isArray(drug_names) || drug_names.length < 2) {
    return { note: 'Provide at least 2 drug names to check interactions' };
  }
  try {
    // Step 1: get RxCUI for each drug
    const rxcuis = [];
    for (const name of drug_names.slice(0, 4)) { // max 4 drugs
      const res = await fetch(
        `https://rxnav.nlm.nih.gov/REST/rxcui.json?name=${encodeURIComponent(name)}&search=1`,
        { timeout: 8000 }
      );
      const data = await res.json();
      const ids = data.idGroup?.rxnormId;
      if (ids && ids.length > 0) rxcuis.push({ name, rxcui: ids[0] });
    }
    if (rxcuis.length < 2) return { interactions: [], note: 'Could not find RxCUI for enough drugs to check interactions' };

    // Step 2: check interactions
    const rxcuiList = rxcuis.map(r => r.rxcui).join('+');
    const res = await fetch(
      `https://rxnav.nlm.nih.gov/REST/interaction/list.json?rxcuis=${rxcuiList}`,
      { timeout: 10000 }
    );
    const data = await res.json();
    const interactions = [];
    for (const group of data.fullInteractionTypeGroup || []) {
      for (const type of group.fullInteractionType || []) {
        for (const pair of type.interactionPair || []) {
          interactions.push({
            description: pair.description,
            severity: pair.severity || 'unknown',
            drugs: pair.interactionConcept?.map(c => c.minConceptItem?.name) || [],
          });
        }
      }
    }
    return { drugs_checked: rxcuis.map(r => r.name), interactions };
  } catch (err) {
    return { error: `Interaction check failed: ${err.message}` };
  }
}

async function getDrugDetails({ drug_name }) {
  try {
    const encoded = encodeURIComponent(`"${drug_name}"`);
    const url = `https://api.fda.gov/drug/label.json?search=openfda.generic_name:${encoded}&limit=1`;
    const res = await fetch(url, { timeout: 10000 });
    if (res.status === 404) {
      // Try brand name
      const res2 = await fetch(
        `https://api.fda.gov/drug/label.json?search=openfda.brand_name:${encoded}&limit=1`,
        { timeout: 10000 }
      );
      if (res2.status === 404) return { note: `No FDA label found for "${drug_name}"` };
      const d2 = await res2.json();
      return extractDrugLabel(d2.results?.[0]);
    }
    const data = await res.json();
    return extractDrugLabel(data.results?.[0]);
  } catch (err) {
    return { error: `Drug details failed: ${err.message}` };
  }
}

function extractDrugLabel(result) {
  if (!result) return { note: 'Drug label not available' };
  return {
    brand_name: result.openfda?.brand_name?.[0] || 'Unknown',
    generic_name: result.openfda?.generic_name?.[0] || 'Unknown',
    dosage_and_administration: result.dosage_and_administration?.[0]?.slice(0, 400) || 'See prescriber',
    warnings: result.warnings?.[0]?.slice(0, 400) || '',
    contraindications: result.contraindications?.[0]?.slice(0, 400) || '',
    adverse_reactions: result.adverse_reactions?.[0]?.slice(0, 300) || '',
  };
}

// ── Handlers map ──────────────────────────────────────────────────────────────
const handlers = {
  lookup_icd_code: lookupIcdCode,
  get_lab_reference_range: getLabReferenceRange,
  search_drug_by_condition: searchDrugByCondition,
  check_drug_interactions: checkDrugInteractions,
  get_drug_details: getDrugDetails,
};

module.exports = { definitions, handlers };
