import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../../services/api';
import CompareModal from '../../components/CompareModal';

/**
 * Parameters the engine actually reasons about, and nothing else.
 *
 * This list used to carry HbA1c, glucose, total cholesterol, LDL, HDL,
 * triglycerides and creatinine. The engine does not consider any of them: it
 * reads a CBC, confirms iron deficiency against iron studies, and makes no
 * claim about diabetes, lipids or renal function — the Phase 2 review's point
 * about naming instruments whose inputs we never collect applies just as much
 * to charting a trend we cannot interpret. Plotting a lipid panel next to a
 * WHO-cited hemoglobin determination implied the product had an opinion about
 * it, and it does not.
 *
 * WBC and platelets came out for the same reason, one step finer. They are on
 * every CBC and the engine does recompute their status, but they measure the
 * white cells and the clotting line — neither has anything to do with an
 * anemia, and sitting them beside hemoglobin on an anemia product's trend
 * chart invites a reading of them this app will not give.
 *
 * What is left is the two questions the engine answers: is there an anemia
 * (red cell), and why (cause workup). `classifyAnemia` reads seven of these
 * directly — hemoglobin, MCV, MCH, RDW, ferritin, TIBC and transferrin
 * saturation. The rest are the same two questions measured another way, which
 * is why they are charted but not read.
 *
 * Keys are the engine's canonical keys, so this stays in step with the server
 * by construction. Hemoglobin stays first: it is the default selection and the
 * fallback when a stored selection no longer resolves.
 */
const KEY_PARAMS = [
  // Red cell — what defines an anemia and what types it. Hemoglobin against the
  // WHO cutoff decides whether an anemia is present at all; MCV, MCH and RDW
  // decide which kind. Hematocrit, RBC and MCHC are the same red-cell mass
  // measured other ways, so they belong to the same question.
  { key: 'hemoglobin',  label: 'Hemoglobin',  unit: 'g/dL',     color: '#ef4444', group: 'Red cell' },
  { key: 'hematocrit',  label: 'Hematocrit',  unit: '%',        color: '#f97316', group: 'Red cell' },
  { key: 'rbc',         label: 'RBC',         unit: 'x10⁶/µL',  color: '#eab308', group: 'Red cell' },
  { key: 'mcv',         label: 'MCV',         unit: 'fL',       color: '#84cc16', group: 'Red cell' },
  { key: 'mch',         label: 'MCH',         unit: 'pg',       color: '#10b981', group: 'Red cell' },
  { key: 'mchc',        label: 'MCHC',        unit: 'g/dL',     color: '#14b8a6', group: 'Red cell' },
  { key: 'rdw',         label: 'RDW',         unit: '%',        color: '#06b6d4', group: 'Red cell' },
  // Cause workup — why the anemia is there. Iron studies confirm or withhold
  // iron deficiency; B12 and folate cover the macrocytic causes; reticulocytes
  // show whether the marrow is responding.
  { key: 'ferritin',               label: 'Ferritin',       unit: 'ng/mL', color: '#8b5cf6', group: 'Cause workup' },
  { key: 'iron',                   label: 'Serum Iron',     unit: 'µg/dL', color: '#a855f7', group: 'Cause workup' },
  { key: 'tibc',                   label: 'TIBC',           unit: 'µg/dL', color: '#c026d3', group: 'Cause workup' },
  { key: 'transferrin_saturation', label: 'Transferrin Sat',unit: '%',     color: '#db2777', group: 'Cause workup' },
  { key: 'reticulocytes',          label: 'Reticulocytes',  unit: '%',     color: '#e11d48', group: 'Cause workup' },
  { key: 'vitamin_b12',            label: 'Vitamin B12',    unit: 'pg/mL', color: '#0ea5e9', group: 'Cause workup' },
  { key: 'folate',                 label: 'Folate',         unit: 'ng/mL', color: '#0891b2', group: 'Cause workup' },
];

/**
 * Fallback name matching for rows stored before the server began tagging each
 * extracted value with its canonical key.
 *
 * Exact lookup against a normalised name, never substring containment. The old
 * `name.includes(key)` approach is what made MCH match "MCHC" and "Mean
 * Corpuscular Hemoglobin Concentration", Iron match "Total Iron Binding
 * Capacity", and Hemoglobin match "Mean Corpuscular Hemoglobin" — every one of
 * those plots the wrong series under a confident label.
 */
const NAME_TO_KEY = {
  hb: 'hemoglobin', hgb: 'hemoglobin', hemoglobin: 'hemoglobin', haemoglobin: 'hemoglobin',
  hct: 'hematocrit', pcv: 'hematocrit', hematocrit: 'hematocrit', haematocrit: 'hematocrit',
  'packed cell volume': 'hematocrit',
  rbc: 'rbc', 'rbc count': 'rbc', 'red blood cell': 'rbc', 'red blood cells': 'rbc',
  'red blood cell count': 'rbc', erythrocyte: 'rbc', erythrocytes: 'rbc',
  mcv: 'mcv', 'mean corpuscular volume': 'mcv', 'mean cell volume': 'mcv',
  mch: 'mch', 'mean corpuscular hemoglobin': 'mch', 'mean corpuscular haemoglobin': 'mch',
  'mean cell hemoglobin': 'mch',
  mchc: 'mchc', 'mean corpuscular hemoglobin concentration': 'mchc',
  'mean corpuscular haemoglobin concentration': 'mchc',
  rdw: 'rdw', 'rdw cv': 'rdw', 'rdw sd': 'rdw', 'red cell distribution width': 'rdw',
  ferritin: 'ferritin', 'serum ferritin': 'ferritin',
  iron: 'iron', 'serum iron': 'iron',
  tibc: 'tibc', 'total iron binding capacity': 'tibc',
  tsat: 'transferrin_saturation', 'transferrin saturation': 'transferrin_saturation',
  'transferrin sat': 'transferrin_saturation',
  reticulocyte: 'reticulocytes', reticulocytes: 'reticulocytes', retic: 'reticulocytes',
  'reticulocyte count': 'reticulocytes',
  b12: 'vitamin_b12', 'vitamin b12': 'vitamin_b12', 'vit b12': 'vitamin_b12', cobalamin: 'vitamin_b12',
  folate: 'folate', 'folic acid': 'folate', 'serum folate': 'folate',
};

function normaliseName(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** The canonical key for one extracted row — the server's tag, else by name. */
function keyFor(value) {
  if (value?.canonical_key) return value.canonical_key;
  return NAME_TO_KEY[normaliseName(value?.parameter)]
      || NAME_TO_KEY[normaliseName(value?.abbreviation)]
      || null;
}

function matchParam(value, key) {
  return keyFor(value) === key;
}

function buildTrendData(reports, paramKey) {
  return reports
    .map((r) => {
      const match = (r.extracted_values || []).find((v) => matchParam(v, paramKey));
      if (!match) return null;
      const num = parseFloat(match.value);
      if (isNaN(num)) return null;
      return {
        date: new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        value: num,
        status: match.status,
      };
    })
    .filter(Boolean);
}

export default function ReportHistory() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedParam, setSelectedParam] = useState('hemoglobin');
  const [compareIds, setCompareIds] = useState([]);
  const [showCompare, setShowCompare] = useState(false);

  useEffect(() => {
    api.get('/blood-report/history')
      .then((res) => setReports(res.data.reports || []))
      .catch(() => toast.error('Could not load report history'))
      .finally(() => setLoading(false));
  }, []);

  const availableParams = useMemo(
    () =>
      KEY_PARAMS.filter((p) =>
        reports.some((r) => (r.extracted_values || []).some((v) => matchParam(v, p.key)))
      ),
    [reports]
  );

  // Hemoglobin is the default, but a report set without it (an iron panel on
  // its own, say) would otherwise land on an empty chart with no hint that
  // other parameters are available. Derived rather than synced into state:
  // writing the fallback back with setState inside an effect causes a second
  // render pass for something that is purely a function of what loaded.
  const effectiveParam = useMemo(() => {
    if (availableParams.some((p) => p.key === selectedParam)) return selectedParam;
    return availableParams[0]?.key ?? selectedParam;
  }, [availableParams, selectedParam]);

  const paramConfig = KEY_PARAMS.find((p) => p.key === effectiveParam) || KEY_PARAMS[0];
  const trendData = useMemo(() => buildTrendData(reports, effectiveParam), [reports, effectiveParam]);

  // Keep the two groups apart in the selector: the CBC core is what the rule
  // engine recomputes, the iron studies are what it reads to confirm a cause.
  const paramGroups = useMemo(() => {
    const order = ['Red cell', 'Cause workup'];
    return order
      .map((group) => ({ group, params: availableParams.filter((p) => p.group === group) }))
      .filter((g) => g.params.length > 0);
  }, [availableParams]);

  function toggleCompare(id) {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="h-8 w-48 bg-slate-200 rounded-xl animate-pulse" />
        <div className="h-64 bg-white rounded-2xl border border-slate-200 animate-pulse" />
        <div className="h-32 bg-white rounded-2xl border border-slate-200 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{t('history.title')}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {reports.length} {reports.length !== 1 ? t('healthScore.reportsPlural') : t('healthScore.reports')} — {t('history.subtitle')}
          </p>
        </div>
        {compareIds.length === 2 && (
          <button
            onClick={() => setShowCompare(true)}
            className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold px-5 py-2.5 rounded-xl transition-all shadow-md text-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
            </svg>
            {t('history.compare')}
          </button>
        )}
      </div>

      {reports.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow p-12 text-center">
          <div className="w-16 h-16 bg-teal-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
            </svg>
          </div>
          <h2 className="text-base font-semibold text-slate-700 mb-2">No reports yet</h2>
          <p className="text-sm text-slate-400 mb-5 max-w-xs mx-auto">
            Upload a blood report and run analysis to start tracking your health trends.
          </p>
          <button
            onClick={() => navigate('/patient/upload-report')}
            className="bg-teal-600 hover:bg-teal-700 text-white font-semibold px-6 py-2.5 rounded-xl transition-all shadow-md text-sm"
          >
            Upload Your First Report
          </button>
        </div>
      ) : (
        <>
          {/* Trend Chart */}
          {availableParams.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow p-6">
              <h2 className="text-base font-semibold text-slate-800">Parameter Trends</h2>
              <p className="text-xs text-slate-400 mt-0.5 mb-4">
                Only what bears on anemia: the red-cell values that decide whether you have one
                and which kind, and the tests that point to a cause. Everything else your report
                carries &mdash; including white cells and platelets &mdash; is shown on the report
                itself but not charted here, because this app makes no clinical judgement about
                it.
              </p>

              {/* Param selector pills, grouped */}
              <div className="space-y-2.5 mb-6">
                {paramGroups.map(({ group, params }) => (
                  <div key={group} className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 w-full sm:w-auto sm:min-w-[84px] shrink-0">
                      {group}
                    </span>
                    {params.map((p) => (
                      <button
                        key={p.key}
                        onClick={() => setSelectedParam(p.key)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all border ${
                          effectiveParam === p.key
                            ? 'text-white border-transparent shadow-sm'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-teal-300 hover:text-teal-700'
                        }`}
                        style={effectiveParam === p.key ? { backgroundColor: p.color, borderColor: p.color } : {}}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                ))}
              </div>

              {trendData.length < 2 ? (
                <div className="flex flex-col items-center justify-center h-48 text-slate-400 text-sm gap-1">
                  <svg className="w-8 h-8 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
                  </svg>
                  <span>Need at least 2 reports with {paramConfig.label} data to show a trend.</span>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={trendData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#94a3b8' }} />
                    <YAxis
                      tick={{ fontSize: 12, fill: '#94a3b8' }}
                      unit={` ${paramConfig.unit}`}
                      width={60}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: '12px',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                      }}
                      formatter={(v) => [`${v} ${paramConfig.unit}`, paramConfig.label]}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke={paramConfig.color}
                      strokeWidth={2.5}
                      dot={{ r: 5, fill: paramConfig.color, strokeWidth: 0 }}
                      activeDot={{ r: 7 }}
                      name={paramConfig.label}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          )}

          {/* Report Cards */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 px-1">
              {compareIds.length === 0
                ? 'Select up to 2 reports to compare side-by-side'
                : compareIds.length === 1
                ? 'Select one more report to enable comparison'
                : 'Click "Compare Selected Reports" to view the diff'}
            </p>
            <div className="space-y-3">
              {[...reports].reverse().map((r) => {
                const date = new Date(r.created_at).toLocaleDateString('en-US', {
                  month: 'long', day: 'numeric', year: 'numeric',
                });
                const selected = compareIds.includes(r.id);
                return (
                  <div
                    key={r.id}
                    className={`bg-white rounded-2xl border shadow p-5 transition-all ${
                      selected
                        ? 'border-teal-400 shadow-md ring-1 ring-teal-200'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div className="flex items-center gap-3">
                        {/* Checkbox */}
                        <button
                          onClick={() => toggleCompare(r.id)}
                          className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all shrink-0 ${
                            selected
                              ? 'border-teal-500 bg-teal-500'
                              : 'border-slate-300 hover:border-teal-400 bg-white'
                          }`}
                          aria-label={selected ? 'Deselect for comparison' : 'Select for comparison'}
                        >
                          {selected && (
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{date}</p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span
                              className={`text-xs px-2 py-0.5 rounded-lg font-medium ${
                                r.analyzed
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-amber-50 text-amber-700'
                              }`}
                            >
                              {r.analyzed ? 'Analyzed' : 'Uploaded'}
                            </span>
                            <span className="text-xs text-slate-400">{r.total_parameters} {t('history.parameters')}</span>
                            {r.abnormal_count > 0 && (
                              <span className="text-xs text-red-500">
                                {r.abnormal_count} {t('history.abnormal')}
                              </span>
                            )}
                            {r.composite_score !== null && (
                              <span className="text-xs font-medium text-teal-600">
                                Score: {r.composite_score}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => navigate(`/patient/analysis/${r.id}`)}
                        className="text-sm font-semibold text-teal-600 hover:text-teal-700 transition-colors whitespace-nowrap"
                      >
                        {t('history.viewAnalysis')} →
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {showCompare && compareIds.length === 2 && (
        <CompareModal
          id1={compareIds[0]}
          id2={compareIds[1]}
          onClose={() => setShowCompare(false)}
        />
      )}
    </div>
  );
}
