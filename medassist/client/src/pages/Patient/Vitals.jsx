import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceArea,
} from 'recharts';
import api from '../../services/api';

const fadeIn = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

/**
 * `normal` is the numeric band behind the printed range, so a reading can be
 * placed in or out of it rather than only plotted. `fromReport` marks the types
 * a blood report can supply — only glucose, and the interface says so for the
 * rest instead of leaving an empty chart unexplained.
 */
const VITAL_TYPE_KEYS = [
  { value: 'blood_pressure', labelKey: 'vitals.bloodPressure', unit: 'mmHg', dual: true,
    normalSystolic: { low: 90, high: 120 }, normalDiastolic: { low: 60, high: 80 } },
  { value: 'glucose',        labelKey: 'vitals.bloodGlucose',  unit: 'mg/dL', normal: { low: 70, high: 99 },  fromReport: true },
  { value: 'weight',         labelKey: 'vitals.weight',        unit: 'kg' },
  { value: 'heart_rate',     labelKey: 'vitals.heartRate',     unit: 'bpm',   normal: { low: 60, high: 100 } },
  { value: 'spo2',           labelKey: 'vitals.spo2',          unit: '%',     normal: { low: 95, high: 100 } },
  { value: 'temperature',    labelKey: 'vitals.temperature',   unit: '°F', normal: { low: 97.8, high: 99.1 } },
];

const NORMAL_RANGES = {
  blood_pressure: 'Systolic: 90-120, Diastolic: 60-80',
  glucose: '70 - 100 mg/dL (fasting)',
  weight: 'Varies by individual',
  heart_rate: '60 - 100 bpm',
  spo2: '95 - 100%',
  temperature: '97.8 - 99.1°F',
};

const fmtDate = (ts) =>
  new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const fmtDateTime = (ts) =>
  new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Where a value sits against the numeric band, or null when there is no band. */
function bandStatus(value, band) {
  if (!band || value == null || isNaN(value)) return null;
  if (value < band.low)  return { label: 'Below range', cls: 'text-amber-600 bg-amber-50 border-amber-200' };
  if (value > band.high) return { label: 'Above range', cls: 'text-orange-600 bg-orange-50 border-orange-200' };
  return { label: 'In range', cls: 'text-emerald-600 bg-emerald-50 border-emerald-200' };
}

export default function Vitals() {
  const { t } = useTranslation();
  const VITAL_TYPES = VITAL_TYPE_KEYS.map((v) => ({ ...v, label: t(v.labelKey) }));
  const [selectedType, setSelectedType] = useState('blood_pressure');
  const [values, setValues] = useState({ value: '', systolic: '', diastolic: '' });
  const [entered, setEntered] = useState([]);
  const [reportReadings, setReportReadings] = useState([]);
  const [reportSupport, setReportSupport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [insight, setInsight] = useState(null);
  const [loadingInsight, setLoadingInsight] = useState(false);

  const typeConfig = VITAL_TYPES.find((v) => v.value === selectedType);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [mine, fromReports] = await Promise.all([
        api.get(`/patient/vitals?type=${selectedType}&days=30`),
        // A reading already sitting on an uploaded report should not have to be
        // typed in again. Failing this call must not cost the patient their own
        // readings, so it degrades to an empty list rather than rejecting.
        api.get(`/patient/vitals/from-reports?type=${selectedType}&days=30`)
          .catch(() => ({ data: { readings: [], supported: false, reason: null } })),
      ]);

      setEntered(
        (mine.data.vitals || []).map((v) => ({
          ts: new Date(v.recorded_at).getTime(),
          value: Number(v.value),
          value2: v.value2 == null ? null : Number(v.value2),
          unit: v.unit || null,
          source: 'entered',
        }))
      );
      setReportReadings(
        (fromReports.data.readings || []).map((r) => ({
          ts: new Date(r.recorded_at).getTime(),
          value: Number(r.value),
          unit: r.unit || null,
          status: r.status || null,
          source: 'report',
        }))
      );
      setReportSupport({
        supported: !!fromReports.data.supported,
        reason: fromReports.data.reason || null,
      });
    } catch {
      // silent — chart just stays empty
    } finally {
      setLoading(false);
    }
  }, [selectedType]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    setInsight(null);
    setLoadingInsight(true);
    api.get(`/patient/vitals/insights?type=${selectedType}`)
      .then(({ data }) => setInsight(data.insight || null))
      .catch(() => {})
      .finally(() => setLoadingInsight(false));
  }, [selectedType]);

  /**
   * One chronological series carrying both sources side by side. They stay in
   * separate keys rather than being averaged into one line: a value the patient
   * measured and a value a laboratory printed are different kinds of evidence,
   * and the chart should not pretend otherwise.
   */
  const chartData = useMemo(() => {
    const byTs = new Map();
    const put = (ts, patch) => byTs.set(ts, { ts, ...(byTs.get(ts) || {}), ...patch });
    for (const r of entered) {
      put(r.ts, typeConfig.dual
        ? { systolic: r.value, diastolic: r.value2 }
        : { value: r.value });
    }
    for (const r of reportReadings) put(r.ts, { reportValue: r.value });
    return [...byTs.values()].sort((a, b) => a.ts - b.ts);
  }, [entered, reportReadings, typeConfig.dual]);

  /** Every reading, newest first — the detail behind the chart. */
  const allReadings = useMemo(
    () => [...entered, ...reportReadings].sort((a, b) => b.ts - a.ts),
    [entered, reportReadings]
  );

  const latest = allReadings[0] || null;
  const previous = allReadings[1] || null;
  const delta = latest && previous ? latest.value - previous.value : null;

  const primaryBand = typeConfig.dual ? typeConfig.normalSystolic : typeConfig.normal;
  const latestStatus = latest ? bandStatus(latest.value, primaryBand) : null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = { type: selectedType };
      if (typeConfig.dual) {
        payload.value = Number(values.systolic);   // systolic as primary
        payload.value2 = Number(values.diastolic); // diastolic as secondary
      } else {
        payload.value = Number(values.value);
      }
      await api.post('/patient/vitals', payload);
      toast.success(`${typeConfig.label} recorded`);
      setValues({ value: '', systolic: '', diastolic: '' });
      fetchData();
    } catch (err) {
      toast.error(err.message || 'Failed to save vital');
    } finally {
      setSubmitting(false);
    }
  };

  const hasReportSeries = reportReadings.length > 0;

  return (
    <motion.div variants={fadeIn} initial="hidden" animate="visible" className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">{t('vitals.title')}</h1>
        <p className="text-sm text-slate-500 mt-1">{t('vitals.subtitle')}</p>
      </div>

      {/* Where these numbers come from. Static copy, not model output, so no
          provider can reword it — and it is the honest answer to "is this
          reading live?", which is no. */}
      <p className="text-xs text-slate-500 leading-relaxed border-l-2 border-teal-200 pl-3">
        These readings are the ones you enter yourself. Nothing here is read from a watch, cuff,
        monitor or any connected device, and no reading updates on its own. This page shows the
        last 30 days; earlier readings you entered are kept but not listed here. Blood glucose is
        the one exception to manual entry: where an uploaded blood report carries a glucose
        result, it is shown alongside your own entries and labelled as coming from that report.
        Your doctor can confirm what these numbers mean for you.
      </p>

      {/* Type Selector */}
      <div className="flex flex-wrap gap-2">
        {VITAL_TYPES.map((vtype) => (
          <button
            key={vtype.value}
            onClick={() => { setSelectedType(vtype.value); setValues({ value: '', systolic: '', diastolic: '' }); }}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              selectedType === vtype.value
                ? 'bg-teal-600 text-white shadow-md'
                : 'bg-white text-slate-600 border border-slate-200 hover:border-teal-300 hover:text-teal-700'
            }`}
          >
            {vtype.label}
          </button>
        ))}
      </div>

      {/* Latest reading detail */}
      {!loading && latest && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow p-5">
          <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Latest</p>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-3xl font-extrabold font-mono text-slate-800 leading-none">
                  {typeConfig.dual && latest.value2 != null
                    ? `${latest.value}/${latest.value2}`
                    : latest.value}
                </span>
                <span className="text-xs text-slate-400">{latest.unit || typeConfig.unit}</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {fmtDateTime(latest.ts)} &middot;{' '}
                {latest.source === 'report' ? 'from a blood report' : 'entered by you'}
              </p>
            </div>

            {delta != null && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Change since previous
                </p>
                <p className={`text-xl font-bold font-mono mt-1 leading-none ${
                  delta > 0 ? 'text-orange-600' : delta < 0 ? 'text-teal-600' : 'text-slate-500'
                }`}>
                  {delta > 0 ? '+' : ''}{Number(delta.toFixed(1))}
                  <span className="text-xs text-slate-400 font-normal ml-1">{typeConfig.unit}</span>
                </p>
                <p className="text-[11px] text-slate-400 mt-1">vs {fmtDate(previous.ts)}</p>
              </div>
            )}

            {latestStatus && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Against the usual range
                </p>
                <span className={`inline-block mt-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border ${latestStatus.cls}`}>
                  {latestStatus.label}
                </span>
                <p className="text-[11px] text-slate-400 mt-1">{NORMAL_RANGES[selectedType]}</p>
              </div>
            )}

            <div className="ml-auto text-right">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Readings</p>
              <p className="text-xl font-bold text-slate-700 mt-1 leading-none">{allReadings.length}</p>
              <p className="text-[11px] text-slate-400 mt-1">
                {hasReportSeries
                  ? `${entered.length} entered · ${reportReadings.length} from reports`
                  : 'last 30 days'}
              </p>
            </div>
          </div>

          {/* A range check is not a diagnosis, and the gap matters most exactly
              when a reading falls outside the band. */}
          {latestStatus && latestStatus.label !== 'In range' && (
            <p className="text-[11px] text-slate-400 mt-4 pt-3 border-t border-slate-100">
              A single reading outside the usual range is not a diagnosis, and this app does not
              interpret it. Bring it to your doctor if it keeps happening.
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Entry Form */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-white rounded-2xl border border-slate-200 shadow p-6"
        >
          <h2 className="text-lg font-semibold text-slate-800 mb-1">{t('vitals.logReading')} — {typeConfig.label}</h2>
          <p className="text-xs text-slate-400 mb-4">{t('vitals.normalRange')}: {NORMAL_RANGES[selectedType]}</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {typeConfig.dual ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{t('vitals.systolic')}</label>
                  <input
                    type="number"
                    value={values.systolic}
                    onChange={(e) => setValues({ ...values, systolic: e.target.value })}
                    required
                    placeholder="120"
                    className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{t('vitals.diastolic')}</label>
                  <input
                    type="number"
                    value={values.diastolic}
                    onChange={(e) => setValues({ ...values, diastolic: e.target.value })}
                    required
                    placeholder="80"
                    className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Value ({typeConfig.unit})
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={values.value}
                  onChange={(e) => setValues({ ...values, value: e.target.value })}
                  required
                  placeholder="Enter value"
                  className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl transition-colors"
            >
              {submitting ? t('vitals.saving') : t('vitals.save')}
            </button>
          </form>

          {reportSupport && !reportSupport.supported && reportSupport.reason && (
            <p className="text-[11px] text-slate-400 mt-4 pt-3 border-t border-slate-100 leading-relaxed">
              {reportSupport.reason}
            </p>
          )}
        </motion.div>

        {/* Chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-1">
            {typeConfig.label} — Last 30 Days
          </h2>
          <p className="text-xs text-slate-400 mb-4">
            Unit: {typeConfig.unit}
            {primaryBand && <> &middot; shaded band is the usual range ({primaryBand.low}–{primaryBand.high})</>}
          </p>

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : chartData.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
              No data yet. Start recording your {typeConfig.label.toLowerCase()} above.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                {/* The usual range, drawn rather than described */}
                {primaryBand && (
                  <ReferenceArea
                    y1={primaryBand.low}
                    y2={primaryBand.high}
                    fill="#10b981"
                    fillOpacity={0.07}
                    stroke="none"
                  />
                )}
                <XAxis
                  dataKey="ts"
                  tick={{ fontSize: 12, fill: '#94a3b8' }}
                  tickFormatter={fmtDate}
                />
                <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <Tooltip
                  labelFormatter={fmtDateTime}
                  contentStyle={{
                    borderRadius: '12px',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  }}
                />
                <Legend />
                {typeConfig.dual ? (
                  <>
                    <Line type="monotone" dataKey="systolic" stroke="#0D9488" strokeWidth={2} dot={{ r: 4, fill: '#0D9488' }} name="Systolic" connectNulls />
                    <Line type="monotone" dataKey="diastolic" stroke="#F59E0B" strokeWidth={2} dot={{ r: 4, fill: '#F59E0B' }} name="Diastolic" connectNulls />
                  </>
                ) : (
                  <Line type="monotone" dataKey="value" stroke="#0D9488" strokeWidth={2} dot={{ r: 4, fill: '#0D9488' }} name="Entered by you" connectNulls />
                )}
                {/* Report-derived readings stay a separate, dashed series so the
                    two sources are never mistaken for one another. */}
                {hasReportSeries && (
                  <Line
                    type="monotone"
                    dataKey="reportValue"
                    stroke="#7C3AED"
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    dot={{ r: 4, fill: '#7C3AED' }}
                    name="From a blood report"
                    connectNulls
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Every reading, with its source */}
      {!loading && allReadings.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-1">All readings</h2>
          <p className="text-xs text-slate-400 mb-4">
            Newest first, last 30 days. Each row says where the number came from.
          </p>
          <div className="max-h-80 overflow-y-auto -mx-2 px-2">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400 border-b border-slate-200">
                  <th className="py-2 pr-3 font-semibold">When</th>
                  <th className="py-2 pr-3 font-semibold">Reading</th>
                  <th className="py-2 pr-3 font-semibold">Range</th>
                  <th className="py-2 font-semibold">Source</th>
                </tr>
              </thead>
              <tbody>
                {allReadings.map((r, i) => {
                  const st = bandStatus(r.value, primaryBand);
                  return (
                    <tr key={`${r.source}-${r.ts}-${i}`} className="border-b border-slate-50 last:border-0">
                      <td className="py-2 pr-3 text-slate-500 whitespace-nowrap">{fmtDateTime(r.ts)}</td>
                      <td className="py-2 pr-3 font-mono font-semibold text-slate-800 whitespace-nowrap">
                        {typeConfig.dual && r.value2 != null ? `${r.value}/${r.value2}` : r.value}
                        <span className="text-[11px] text-slate-400 font-sans font-normal ml-1">
                          {r.unit || typeConfig.unit}
                        </span>
                      </td>
                      <td className="py-2 pr-3">
                        {st ? (
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${st.cls}`}>
                            {st.label}
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-300">no set range</span>
                        )}
                      </td>
                      <td className="py-2">
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${
                          r.source === 'report'
                            ? 'bg-violet-50 text-violet-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}>
                          {r.source === 'report' ? 'Blood report' : 'Entered by you'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Blood Report Correlation Insight */}
      {(loadingInsight || insight) && (
        <div className="bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-200 rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-teal-800 mb-1">
                {t('vitals.correlation')}
              </h3>
              {loadingInsight ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm text-teal-600">Analysing correlation...</span>
                </div>
              ) : (
                <>
                  <p className="text-sm text-slate-700 leading-relaxed">{insight}</p>
                  {/* What the insight is computed from, since it reads as a
                      finding and is written by a language model from a handful
                      of rows. */}
                  <p className="text-[11px] text-teal-700/70 mt-2 leading-relaxed">
                    Written from your most recent readings for this vital and your latest blood
                    report. It describes things that moved together, not one causing the other, and
                    it is not a diagnosis.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
