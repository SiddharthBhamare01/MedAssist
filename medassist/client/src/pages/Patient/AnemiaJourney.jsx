/**
 * AnemiaJourney — the recovery trajectory ("Confirm & Track").
 *
 * Plots hemoglobin across every CBC the patient has uploaded against their own
 * WHO anemia cutoff. Display-only, exactly like AnemiaCard: every value and every
 * cutoff here was computed by the deterministic rule engine at analysis time.
 * This page draws them; it makes no clinical claim of its own — no forecast, no
 * trend verdict, no causation.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import api from '../../services/api';
import { ANEMIA_VALIDATION } from '../../data/anemiaValidation';
import { BASIS_LABEL, STATUS_STYLE, STATUS_DOT_COLOR, UNKNOWN_DOT_COLOR } from '../../data/anemiaLabels';

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

export default function AnemiaJourney() {
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
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="h-8 w-56 bg-slate-200 rounded-xl animate-pulse" />
        <div className="h-72 bg-white rounded-2xl border border-slate-200 animate-pulse" />
        <div className="h-24 bg-white rounded-2xl border border-slate-200 animate-pulse" />
      </div>
    );
  }

  const points = data?.points || [];
  const cutoff = data?.cutoff ?? null;
  const basisText = data?.cutoff_basis ? (BASIS_LABEL[data.cutoff_basis] || data.cutoff_basis) : null;

  // Pad the domain so the cutoff line is never clipped off-canvas.
  const values = points.map((p) => p.hb).concat(cutoff != null ? [cutoff] : []);
  const domain = values.length
    ? [Math.floor(Math.min(...values) - 1), Math.ceil(Math.max(...values) + 1)]
    : ['auto', 'auto'];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">{t('journey.title')}</h1>
        <p className="text-sm text-slate-500 mt-1">{t('journey.subtitle')}</p>
      </div>

      {/* 0 reports — nothing to plot yet */}
      {points.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow p-10 text-center animate-slide-up">
          <p className="text-4xl mb-3">🩸</p>
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
      {points.length === 1 && (
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

      {/* 2+ reports — the trajectory */}
      {points.length >= 2 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow p-6 space-y-4 animate-slide-up">
          <div className="flex items-center justify-between gap-3 flex-wrap border-b border-slate-200 pb-3">
            <h2 className="text-base font-bold font-display text-slate-800 flex items-center gap-2">
              <span className="text-lg">📈</span>{t('journey.chartTitle')}
            </h2>
            {cutoff != null && (
              <span className="text-xs text-slate-400">
                {t('journey.cutoffLine', { cutoff })} {basisText && `(${basisText})`}
              </span>
            )}
          </div>

          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={points} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
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
          </div>

          {/* The cutoff moved between reports — say so rather than flattening it */}
          {data.mixed_basis && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 flex items-start gap-2">
              <span className="text-amber-500 text-base leading-none mt-0.5">ℹ️</span>
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
    </div>
  );
}
