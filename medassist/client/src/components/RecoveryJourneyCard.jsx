/**
 * RecoveryJourneyCard — the recovery trajectory ("Confirm & Track"), as cards.
 *
 * Self-fetching (like HealthScoreCard / DailyTipsCard) and rendered inline on the
 * analysis page rather than behind a link, so a patient sees whether their
 * hemoglobin is actually rising without navigating away.
 *
 * Display-only, exactly like AnemiaCard: every value, every cutoff, and the
 * decision to show or withhold a forecast were all computed server-side by the
 * deterministic rule engine. This component draws them and claims nothing.
 *
 * Returns a FRAGMENT of sibling cards so it inherits whatever vertical spacing
 * the host page uses (`space-y-6` in both current call sites).
 *
 * @param {boolean} showEmptyState  when false (embedded on the analysis page),
 *   render nothing at all rather than a "no readings yet" placeholder — the host
 *   page already has its own content and does not need the prompt.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import api from '../services/api';
import { ANEMIA_VALIDATION } from '../data/anemiaValidation';
import { RECOVERY_VALIDATION } from '../data/recoveryValidation';
import {
  BASIS_LABEL, STATUS_STYLE, STATUS_DOT_COLOR, UNKNOWN_DOT_COLOR, RECOVERY_STYLE, TREND_STYLE,
} from '../data/anemiaLabels';

const TEAL = '#0D9488';
const CUTOFF_RED = '#ef4444';

const fmtDate = (ts) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

function Chip({ children, className = 'bg-slate-50 text-slate-600 border-slate-200' }) {
  return (
    <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${className}`}>
      {children}
    </span>
  );
}

const dotColor = (p) => (p.analyzed ? (STATUS_DOT_COLOR[p.status] || UNKNOWN_DOT_COLOR) : UNKNOWN_DOT_COLOR);

/** Dot colored by the point's rule-computed anemia status. */
function StatusDot({ cx, cy, payload }) {
  if (cx == null || cy == null) return null;
  return <circle cx={cx} cy={cy} r={5} fill={dotColor(payload)} stroke="#fff" strokeWidth={1.5} />;
}

/** Baseline → latest readout. Plain arithmetic on validated values, not a trend verdict. */
function SummaryStrip({ data, t }) {
  const cells = [
    { label: t('journey.baseline'), value: `${data.baseline} g/dL` },
    { label: t('journey.latest'), value: `${data.latest} g/dL` },
    {
      label: t('journey.change'),
      value: `${data.delta > 0 ? '+' : ''}${data.delta} g/dL`,
      tone: data.delta > 0 ? 'text-emerald-600' : data.delta < 0 ? 'text-red-600' : 'text-slate-700',
    },
    { label: t('journey.overDays'), value: `${data.days_elapsed} ${t('journey.days')}` },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {cells.map((c) => (
        <div key={c.label} className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-center">
          <p className={`text-lg font-bold font-display ${c.tone || 'text-slate-700'}`}>{c.value}</p>
          <p className="text-[10px] text-slate-500 uppercase tracking-wide mt-0.5">{c.label}</p>
        </div>
      ))}
    </div>
  );
}

/**
 * Recovery determination — trend, responder status, and (only when the engine
 * was willing to offer one) an expected time-to-normal.
 */
function RecoveryVerdict({ recovery, t }) {
  const S = RECOVERY_STYLE[recovery.responder_status] || RECOVERY_STYLE.INSUFFICIENT_DATA;
  const f = recovery.forecast;

  return (
    <div className={`rounded-2xl border ${S.outer} shadow animate-slide-up overflow-hidden`}>
      <div className={`${S.hdr} px-5 py-3.5 flex items-center justify-between gap-3`}>
        <div className="flex items-center gap-2.5">
          <div>
            <p className="text-sm font-bold text-slate-800">{t('journey.recoveryTitle')}</p>
            <p className="text-[11px] text-slate-400">{t('journey.recoverySubtitle')}</p>
          </div>
        </div>
        <span className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 border ${S.badge}`}>
          {t(`journey.status.${recovery.responder_status}`, { defaultValue: recovery.responder_status })}
        </span>
      </div>

      <div className="p-5 space-y-3">
        {(recovery.trend || recovery.observed_rise != null) && (
          <div className="flex flex-wrap gap-2">
            {recovery.trend && (
              <Chip className={TREND_STYLE[recovery.trend]}>
                {t(`journey.trend.${recovery.trend}`, { defaultValue: recovery.trend })}
              </Chip>
            )}
            {recovery.observed_rise != null && recovery.days_elapsed != null && (
              <Chip>
                {recovery.observed_rise > 0 ? '+' : ''}{recovery.observed_rise} g/dL · {recovery.days_elapsed} {t('journey.days')}
              </Chip>
            )}
          </div>
        )}

        {recovery.explanation_seed && (
          <p className="text-sm text-slate-600 leading-relaxed">{recovery.explanation_seed}</p>
        )}

        {/* Forecast — shown only when the engine offered one */}
        {f && (
          <div className="bg-teal-50/70 border border-teal-100 rounded-xl px-3 py-2.5 text-sm text-teal-800">
            <span className="font-semibold">{t('journey.forecastLabel')} </span>
            {t('journey.forecastBody', { weeks: f.weeks_to_target, target: f.target })}
            <span className="block text-[11px] text-teal-600/80 mt-1">{t('journey.forecastCaveat')}</span>
          </div>
        )}

        {/* The deferral banner below states the FINDING; this states the ACTION.
            The engine keeps the two non-overlapping, so both can show together. */}
        {recovery.recommendation && (
          <div className="bg-teal-50/70 border border-teal-100 rounded-xl px-3 py-2 text-sm text-teal-800">
            <span className="font-semibold">{t('journey.nextStep')} </span>{recovery.recommendation}
          </div>
        )}

        {/* Non-responder / declining alert — reuses AnemiaCard's deferral banner */}
        {recovery.defer_to_physician && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
            <p className="text-sm text-red-700">
              <span className="font-bold">{t('journey.physicianReview')} </span>
              {recovery.deferral_reason}
            </p>
          </div>
        )}

        {recovery.sources?.length > 0 && (
          <details className="pt-2 border-t border-slate-100 group">
            <summary className="flex items-center gap-1.5 cursor-pointer list-none text-xs font-semibold text-slate-500 hover:text-slate-700 select-none">
              <span className="transition-transform group-open:rotate-90">▸</span>
              {t('journey.recoverySourcesTitle')}
            </summary>
            <div className="mt-2 space-y-2">
              <p className="text-[11px] text-slate-400">
                {t('journey.recoveryValidation', {
                  journeys: RECOVERY_VALIDATION.journeys,
                  missed: RECOVERY_VALIDATION.missedNonResponders,
                  withheld: RECOVERY_VALIDATION.forecastsWithheld,
                })}
              </p>
              <ul className="text-[11px] text-slate-400 space-y-0.5">
                {recovery.sources.map((s, i) => <li key={i}>• {s.source}</li>)}
              </ul>
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

function ChartTooltip({ active, payload, t }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const S = p.status ? STATUS_STYLE[p.status] : null;
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-3 py-2 shadow-lg">
      <p className="text-[11px] text-slate-400">{fmtDate(p.ts)}</p>
      <p className="text-sm font-bold text-slate-800">{p.hb} {p.unit}</p>
      {S && <p className="text-xs text-slate-600 mt-0.5">{S.label}{p.severity ? ` · ${p.severity}` : ''}</p>}
      {!p.analyzed && <p className="text-xs text-slate-400 mt-0.5">{t('journey.notAnalyzed')}</p>}
    </div>
  );
}

export default function RecoveryJourneyCard({ showEmptyState = true }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/blood-report/trajectory')
      .then((res) => setData(res.data))
      .catch(() => toast.error(t('journey.loadError')))
      .finally(() => setLoading(false));
    // Fetch once on mount — the payload is language-independent, so a language
    // switch must not refetch (`t` changes identity when the language changes).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return <div className="h-64 bg-white rounded-2xl border border-slate-200 animate-pulse" />;
  }

  const points = data?.points || [];
  const cutoff = data?.cutoff ?? null;
  const basisText = data?.cutoff_basis ? (BASIS_LABEL[data.cutoff_basis] || data.cutoff_basis) : null;

  const recovery = data?.recovery || null;
  const projection = recovery?.forecast?.projection || [];
  const showVerdict = recovery && (recovery.applicable || recovery.defer_to_physician);

  // Embedded on a page that already has content: stay silent unless there is
  // something real to say, rather than adding an empty placeholder card.
  if (!showEmptyState && points.length < 2 && !showVerdict) return null;

  // Merge the dashed projection into the same series. The first projection point
  // shares the latest reading's timestamp, so it lands on the existing row and the
  // dashed line starts where the solid one ends instead of floating detached.
  const chartData = points.map((p) => ({ ...p }));
  for (const q of projection) {
    const existing = chartData.find((p) => p.ts === q.ts);
    if (existing) existing.projected = q.hb;
    else chartData.push({ ts: q.ts, projected: q.hb });
  }
  chartData.sort((a, b) => a.ts - b.ts);

  // Pad the domain so neither the cutoff line nor the projection is clipped.
  const values = points.map((p) => p.hb)
    .concat(projection.map((q) => q.hb))
    .concat(cutoff != null ? [cutoff] : []);
  const domain = values.length
    ? [Math.floor(Math.min(...values) - 1), Math.ceil(Math.max(...values) + 1)]
    : ['auto', 'auto'];

  return (
    <>
      {/* 0 reports — nothing to plot yet */}
      {showEmptyState && points.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow p-10 text-center animate-slide-up">
          <p className="text-slate-700 font-semibold">{t('journey.emptyTitle')}</p>
          <p className="text-sm text-slate-500 mt-1">{t('journey.emptyBody')}</p>
          <button
            onClick={() => navigate('/patient/upload-report')}
            className="mt-4 px-4 py-2 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 transition-colors"
          >
            {t('journey.uploadCta')}
          </button>
        </div>
      )}

      {/* 1 report — a trajectory needs two points, so show the single reading honestly */}
      {showEmptyState && points.length === 1 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow p-6 space-y-3 animate-slide-up">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-3xl font-bold font-display text-slate-800">{points[0].hb}</span>
            <span className="text-sm text-slate-500">{points[0].unit}</span>
            <span className="text-xs text-slate-400">· {fmtDate(points[0].ts)}</span>
          </div>
          {cutoff != null && (
            <p className="text-sm text-slate-500">
              {t('journey.cutoffLine', { cutoff })} {basisText && `(${basisText})`}
            </p>
          )}
          {points[0].status && STATUS_STYLE[points[0].status] && (
            <Chip className={STATUS_STYLE[points[0].status].badge}>{STATUS_STYLE[points[0].status].label}</Chip>
          )}
          <div className="bg-teal-50/70 border border-teal-100 rounded-xl px-3 py-2.5 text-sm text-teal-800">
            {t('journey.needSecond')}
          </div>
          <button
            onClick={() => navigate('/patient/upload-report')}
            className="px-4 py-2 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 transition-colors"
          >
            {t('journey.uploadFollowUp')}
          </button>
        </div>
      )}

      {/* Recovery determination — verdict before evidence, and it must surface even
          on a single-reading relapse, where `applicable` is false but the drop back
          below the cutoff still warrants physician review. */}
      {showVerdict && <RecoveryVerdict recovery={recovery} t={t} />}

      {/* 2+ reports — the trajectory */}
      {points.length >= 2 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow p-6 space-y-4 animate-slide-up">
          <div className="flex items-center justify-between gap-3 flex-wrap border-b border-slate-200 pb-3">
            <h2 className="text-base font-bold font-display text-slate-800 flex items-center gap-2">
              {t('journey.chartTitle')}
            </h2>
            {cutoff != null && (
              <span className="text-xs text-slate-400">
                {t('journey.cutoffLine', { cutoff })} {basisText && `(${basisText})`}
              </span>
            )}
          </div>

          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="ts"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                tick={{ fontSize: 12, fill: '#94a3b8' }}
                tickFormatter={fmtDate}
              />
              <YAxis
                tick={{ fontSize: 12, fill: '#94a3b8' }}
                domain={domain}
                unit=" g/dL"
                width={70}
              />
              <Tooltip content={<ChartTooltip t={t} />} />
              {cutoff != null && (
                <ReferenceLine
                  y={cutoff}
                  stroke={CUTOFF_RED}
                  strokeDasharray="4 4"
                  label={{
                    value: `${t('journey.cutoffLabel')} ${cutoff} ${t('journey.cutoffLabelUnit')}`,
                    position: 'insideTopRight',
                    fill: CUTOFF_RED,
                    fontSize: 11,
                  }}
                />
              )}
              <Line
                type="monotone"
                dataKey="hb"
                stroke={TEAL}
                strokeWidth={2.5}
                dot={<StatusDot />}
                activeDot={{ r: 7 }}
                name="Hemoglobin"
              />
              {/* Expected-response projection — dashed, and only present when the
                  rule engine was willing to offer a forecast at all. */}
              {projection.length > 0 && (
                <Line
                  type="monotone"
                  dataKey="projected"
                  stroke={TEAL}
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                  activeDot={false}
                  connectNulls
                  name="Expected"
                />
              )}
            </LineChart>
          </ResponsiveContainer>

          {/* Legend — the dot colors are the rule engine's statuses, so spell them out */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
            {[
              [STATUS_DOT_COLOR.NOT_ANEMIC, t('journey.legendNormal')],
              [STATUS_DOT_COLOR.SUSPECTED, t('journey.legendAnemic')],
              [UNKNOWN_DOT_COLOR, t('journey.legendUnknown')],
            ].map(([color, label]) => (
              <span key={label} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: color }} />
                {label}
              </span>
            ))}
            {projection.length > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="w-4 border-t-2 border-dashed inline-block" style={{ borderColor: TEAL }} />
                {t('journey.legendExpected')}
              </span>
            )}
          </div>

          {/* The cutoff moved between reports — say so rather than flattening it */}
          {data.mixed_basis && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
              <p className="text-sm text-amber-800">{t('journey.mixedBasis')}</p>
            </div>
          )}

          {data.baseline != null && data.latest != null && <SummaryStrip data={data} t={t} />}

          {/* Provenance — mirrors AnemiaCard's "How reliable is this?" panel */}
          <details className="pt-2 border-t border-slate-100 group">
            <summary className="flex items-center gap-1.5 cursor-pointer list-none text-xs font-semibold text-slate-500 hover:text-slate-700 select-none">
              <span className="transition-transform group-open:rotate-90">▸</span>
              {t('journey.provenanceTitle')}
            </summary>
            <div className="mt-2 space-y-2">
              <p className="text-[11px] text-slate-400">{t('journey.provenanceBody')}</p>
              <ul className="text-[11px] text-slate-400 space-y-0.5">
                {ANEMIA_VALIDATION.sources.map((src, i) => (
                  <li key={i}>• {src}</li>
                ))}
              </ul>
            </div>
          </details>
        </div>
      )}
    </>
  );
}
