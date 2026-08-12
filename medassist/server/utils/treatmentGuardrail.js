/**
 * treatmentGuardrail.js — keeps the report chatbot inside its clinical scope.
 *
 * The work plan scopes this product to explaining results and explicitly
 * excludes medications and drug-safety decisions. POST /api/voice/report-chat
 * is the only surface that accepts free text from the patient, so the boundary
 * is enforced here with a deterministic check rather than by trusting the model
 * to decline. (/explain-finding takes a parameter name drawn from the report,
 * not free text, so it has no equivalent surface.)
 *
 * Validated by tests/guardrail/runGuardrail.js.
 */

// Named drugs/dosing — always defer, regardless of how the question is framed.
const TREATMENT_EXPLICIT = /\b(medicine|medicines|medication|medications|drug|drugs|tablet|tablets|pill|pills|capsule|capsules|syrup|dose|dosage|dosing|mg|milligrams?|prescribe|prescribed|prescription|injections?|infusions?|transfusions?|antibiotics?|steroids?|supplements?|chemotherapy|iron\s+tablets?|iron\s+pills?|medicamentos?|medicinas?|fármacos?|pastillas?|píldoras?|cápsulas?|jarabe|dosis|recetar|recetas?|inyecci[oó]n(?:es)?|infusi[oó]n(?:es)?|transfusi[oó]n(?:es)?|antibi[oó]ticos?|esteroides?|suplementos?)\b/i;

// Weaker treatment framing — deferred unless the patient is asking about the
// diet and lifestyle guidance the product does provide. "What foods should I
// eat to treat my anemia?" must still get a real answer.
const TREATMENT_SOFT = /\b(treat|treats|treating|treatment|treatments|cure|cured|therapy|therapies|remedy|remedies|heal|should i take|how do i fix|how can i fix|tratar|tratamientos?|curar|curarme|cura|terapias?|remedios?|debo tomar|qué tomo|que tomo)\b/i;
// 'receta' is deliberately absent: it means both recipe and prescription in
// Spanish, and deferring is the safer reading of an ambiguous question.
const SELF_CARE_TOPIC = /\b(food|foods|eat|eating|ate|diet|dietary|meal|meals|nutrition|nutritional|recipe|recipes|drink|drinking|fruit|vegetable|exercise|walking|workout|sleep|rest|lifestyle|habit|habits|comida|comidas|comer|alimentos?|alimentaci[oó]n|dieta|nutrici[oó]n|beber|fruta|frutas|verduras?|ejercicio|caminar|dormir|sueño|descanso|hábitos?)\b/i;

const TREATMENT_DEFERRAL = {
  en: "I'm not a doctor, so I can't advise you on treatment or medication. Please connect with a doctor near you — they can review these results with you and recommend what's right for your situation. I'm happy to explain what any of your values mean in the meantime.",
  es: 'No soy médico, así que no puedo aconsejarte sobre tratamientos ni medicamentos. Por favor, consulta con un médico cerca de ti: podrá revisar estos resultados contigo y recomendarte lo más adecuado para tu caso. Mientras tanto, con gusto te explico qué significa cualquiera de tus valores.',
};

/** True when a patient question asks what to take or how to be treated. */
function isTreatmentRequest(message) {
  const text = String(message || '');
  if (TREATMENT_EXPLICIT.test(text)) return true;
  return TREATMENT_SOFT.test(text) && !SELF_CARE_TOPIC.test(text);
}

module.exports = { isTreatmentRequest, TREATMENT_DEFERRAL };
