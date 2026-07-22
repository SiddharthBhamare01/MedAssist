/**
 * AnemiaCard — "Anemia Mode" panel.
 *
 * Renders the deterministic anemia determination (analysis.anemia) produced by
 * the backend rule engine. Display-only: it never re-computes anything.
 *
 * Render guard (in the parent): only mount when analysis.anemia exists AND a
 * hemoglobin value was present — otherwise a non-CBC report would surface a
 * spurious "inconclusive" anemia card.
 */

import { ANEMIA_VALIDATION } from '../data/anemiaValidation';

const STATUS_STYLE = {
  CONFIRMED:    { badge: 'bg-emerald-100 text-emerald-800 border-emerald-200', outer: 'border-emerald-200', hdr: 'bg-emerald-50', label: 'Confirmed' },
  SUSPECTED:    { badge: 'bg-amber-100 text-amber-800 border-amber-200',       outer: 'border-amber-200',   hdr: 'bg-amber-50',   label: 'Suspected' },
  INCONCLUSIVE: { badge: 'bg-slate-100 text-slate-700 border-slate-200',       outer: 'border-slate-200',   hdr: 'bg-slate-50',   label: 'Inconclusive' },
  NOT_ANEMIC:   { badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',  outer: 'border-emerald-200', hdr: 'bg-emerald-50', label: 'No anemia' },
};

const SEVERITY_STYLE = {
  mild:     'bg-yellow-50 text-yellow-700 border-yellow-200',
  moderate: 'bg-orange-50 text-orange-700 border-orange-200',
  severe:   'bg-red-50 text-red-700 border-red-200',
};

const BASIS_LABEL = {
  male: 'adult male',
  non_pregnant_female: 'non-pregnant female',
  pregnant_female: 'pregnant',
  unknown_gender_male_default: 'adult (male cutoff assumed)',
  child_6_23mo: 'infant (6–23 mo)',
  child_2_4y: 'child (2–4 y)',
  child_5_11y: 'child (5–11 y)',
  adolescent_12_14y: 'adolescent (12–14 y)',
};

function Chip({ children, className = 'bg-slate-50 text-slate-600 border-slate-200' }) {
  return (
    <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${className}`}>
      {children}
    </span>
  );
}

export default function AnemiaCard({ anemia }) {
  if (!anemia) return null;
  const S = STATUS_STYLE[anemia.status] || STATUS_STYLE.INCONCLUSIVE;
  const hb = anemia.hemoglobin || {};
  const idx = anemia.indices || {};
  const notAnemic = anemia.status === 'NOT_ANEMIC';

  return (
    <div className={`rounded-2xl border ${S.outer} shadow animate-slide-up overflow-hidden`}>
      {/* Header */}
      <div className={`${S.hdr} px-5 py-3.5 flex items-center justify-between gap-3`}>
        <div className="flex items-center gap-2.5">
          <span className="text-xl">🩸</span>
          <div>
            <p className="text-sm font-bold text-slate-800">Anemia Assessment</p>
            <p className="text-[11px] text-slate-400">Computed by a rule engine from WHO / AGA criteria</p>
          </div>
        </div>
        <span className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 border ${S.badge}`}>
          {S.label}
        </span>
      </div>

      <div className="p-5 space-y-3">
        {/* Chips */}
        {!notAnemic && (
          <div className="flex flex-wrap gap-2">
            {anemia.severity && (
              <Chip className={SEVERITY_STYLE[anemia.severity] || 'bg-slate-50 text-slate-600 border-slate-200'}>
                {anemia.severity.charAt(0).toUpperCase() + anemia.severity.slice(1)}
              </Chip>
            )}
            {anemia.morphology && <Chip>{anemia.morphology}</Chip>}
            {anemia.type_label && <Chip>{anemia.type_label}</Chip>}
            {anemia.confidence && <Chip>Confidence: {anemia.confidence}</Chip>}
          </div>
        )}

        {/* Hemoglobin vs cutoff */}
        <div className="text-sm text-slate-700">
          <span className="font-semibold">Hemoglobin:</span> {hb.value} {hb.unit || 'g/dL'}
          {hb.cutoff != null && (
            <span className="text-slate-400">
              {' '}— WHO anemia cutoff {hb.cutoff} g/dL ({BASIS_LABEL[hb.applied_cutoff_basis] || hb.applied_cutoff_basis})
            </span>
          )}
        </div>

        {/* Indices */}
        {(idx.mcv != null || idx.mch != null || idx.rdw != null) && (
          <div className="text-xs text-slate-500 flex flex-wrap gap-x-4 gap-y-1">
            {idx.mcv != null && <span>MCV {idx.mcv} fL</span>}
            {idx.mch != null && <span>MCH {idx.mch} pg</span>}
            {idx.rdw != null && <span>RDW {idx.rdw} %</span>}
          </div>
        )}

        {/* Explanation */}
        {anemia.explanation_seed && (
          <p className="text-sm text-slate-600 leading-relaxed">{anemia.explanation_seed}</p>
        )}

        {/* Recommendation */}
        {anemia.recommendation && (
          <div className="bg-teal-50/70 border border-teal-100 rounded-xl px-3 py-2 text-sm text-teal-800">
            <span className="font-semibold">Next step: </span>{anemia.recommendation}
          </div>
        )}

        {/* Deferral banner */}
        {anemia.defer_to_physician && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 flex items-start gap-2">
            <span className="text-red-500 text-base leading-none mt-0.5">⚠️</span>
            <p className="text-sm text-red-700">
              <span className="font-bold">Physician review recommended. </span>
              {anemia.deferral_reason || 'This finding falls outside the validated anemia patterns.'}
            </p>
          </div>
        )}

        {/* Trust / validation — collapsible */}
        <details className="pt-2 border-t border-slate-100 group">
          <summary className="flex items-center gap-1.5 cursor-pointer list-none text-xs font-semibold text-slate-500 hover:text-slate-700 select-none">
            <span className="transition-transform group-open:rotate-90">▸</span>
            How reliable is this?
          </summary>
          <div className="mt-2 space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-2 py-1.5 text-center">
                <p className="text-sm font-bold text-emerald-700">{ANEMIA_VALIDATION.sensitivity}%</p>
                <p className="text-[9px] text-slate-500 uppercase tracking-wide">Sensitivity</p>
              </div>
              <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-2 py-1.5 text-center">
                <p className="text-sm font-bold text-emerald-700">{ANEMIA_VALIDATION.specificity}%</p>
                <p className="text-[9px] text-slate-500 uppercase tracking-wide">Specificity</p>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-center">
                <p className="text-sm font-bold text-slate-700">{ANEMIA_VALIDATION.falseNegatives}</p>
                <p className="text-[9px] text-slate-500 uppercase tracking-wide">Missed cases</p>
              </div>
            </div>
            <p className="text-[11px] text-slate-400">
              Validated on {ANEMIA_VALIDATION.cases} labeled synthetic CBC cases — {ANEMIA_VALIDATION.falseNegatives} false negatives.
              Ranges and thresholds are rule-based (no AI guessing) and tied to:
            </p>
            <ul className="text-[11px] text-slate-400 space-y-0.5">
              {(anemia.sources?.map((s) => s.source) || ANEMIA_VALIDATION.sources).map((src, i) => (
                <li key={i}>• {src}</li>
              ))}
            </ul>
          </div>
        </details>
      </div>
    </div>
  );
}
