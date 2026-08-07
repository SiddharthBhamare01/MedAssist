/**
 * Shared display labels for the deterministic anemia engine's output.
 *
 * These map `analysis.anemia` field values (status, severity, applied_cutoff_basis)
 * to human text and Tailwind classes. Extracted from AnemiaCard so the recovery
 * journey chart labels its cutoff line and colors its points identically — a
 * patient must never see the same status styled two different ways.
 */

export const STATUS_STYLE = {
  CONFIRMED:    { badge: 'bg-emerald-100 text-emerald-800 border-emerald-200', outer: 'border-emerald-200', hdr: 'bg-emerald-50', label: 'Confirmed' },
  SUSPECTED:    { badge: 'bg-amber-100 text-amber-800 border-amber-200',       outer: 'border-amber-200',   hdr: 'bg-amber-50',   label: 'Suspected' },
  INCONCLUSIVE: { badge: 'bg-slate-100 text-slate-700 border-slate-200',       outer: 'border-slate-200',   hdr: 'bg-slate-50',   label: 'Inconclusive' },
  NOT_ANEMIC:   { badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',  outer: 'border-emerald-200', hdr: 'bg-emerald-50', label: 'No anemia' },
};

export const SEVERITY_STYLE = {
  mild:     'bg-yellow-50 text-yellow-700 border-yellow-200',
  moderate: 'bg-orange-50 text-orange-700 border-orange-200',
  severe:   'bg-red-50 text-red-700 border-red-200',
};

export const BASIS_LABEL = {
  male: 'adult male',
  non_pregnant_female: 'non-pregnant female',
  pregnant_female: 'pregnant',
  unknown_gender_male_default: 'adult (male cutoff assumed)',
  child_6_23mo: 'infant (6–23 mo)',
  child_2_4y: 'child (2–4 y)',
  child_5_11y: 'child (5–11 y)',
  adolescent_12_14y: 'adolescent (12–14 y)',
};

/** Chart dot color per anemia status. Unanalyzed / inconclusive points read as slate. */
export const STATUS_DOT_COLOR = {
  NOT_ANEMIC:   '#10b981', // emerald-500 — at or above the cutoff
  CONFIRMED:    '#ef4444', // red-500
  SUSPECTED:    '#f97316', // orange-500
  INCONCLUSIVE: '#94a3b8', // slate-400
};

export const UNKNOWN_DOT_COLOR = '#cbd5e1'; // slate-300 — uploaded but never analyzed
