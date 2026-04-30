import { useTranslation } from 'react-i18next';

const STATUS_DOT_COLOR = {
  high:          '#f97316',
  low:           '#f59e0b',
  critical_high: '#ef4444',
  critical_low:  '#ef4444',
  normal:        '#10b981',
};

const STATUS_TEXT = {
  high:          'text-orange-500',
  low:           'text-amber-500',
  critical_high: 'text-red-500',
  critical_low:  'text-red-500',
  normal:        'text-emerald-600',
};

function parseNormalRange(range) {
  if (!range) return null;
  if (/[MF]\s*:/i.test(range)) return null;
  const gtMatch = range.match(/^[>≥>=]+\s*([\d.]+)/);
  if (gtMatch) return { low: parseFloat(gtMatch[1]), high: null };
  const ltMatch = range.match(/^[<≤<=]+\s*([\d.]+)/);
  if (ltMatch) return { low: null, high: parseFloat(ltMatch[1]) };
  const rangeMatch = range.match(/([\d.]+)\s*[-–]\s*([\d.]+)/);
  if (rangeMatch) return { low: parseFloat(rangeMatch[1]), high: parseFloat(rangeMatch[2]) };
  return null;
}

function ParameterGauge({ param }) {
  const { t } = useTranslation();
  const { parameter, your_value, normal_range, status, unit } = param;
  const value = parseFloat(your_value);
  const range = parseNormalRange(normal_range);
  const dotColor = STATUS_DOT_COLOR[status] || '#94a3b8';
  const labelColor = STATUS_TEXT[status] || 'text-slate-500';

  const statusLabel = status ? t(`analysis.statusLabels.${status}`, { defaultValue: status }) : '';

  if (!range || isNaN(value)) {
    return (
      <div className="flex items-center justify-between gap-3 py-2.5">
        <span className="text-sm font-semibold text-slate-700 truncate flex-1">{parameter}</span>
        <span className="font-mono text-sm font-bold text-slate-800">{your_value}{unit ? ` ${unit}` : ''}</span>
        <span className={`text-xs font-bold shrink-0 ${labelColor}`}>{statusLabel}</span>
      </div>
    );
  }

  const { low, high } = range;

  let scaleMin, scaleMax;
  if (low !== null && high !== null) {
    scaleMin = Math.min(value, low) * 0.6;
    scaleMax = Math.max(value, high) * 1.4;
  } else if (low !== null) {
    scaleMin = Math.min(value, low) * 0.5;
    scaleMax = Math.max(value, low * 2, value * 1.5);
  } else {
    scaleMin = 0;
    scaleMax = Math.max(value, high) * 1.4;
  }

  if (scaleMax - scaleMin < 0.001) {
    scaleMin = 0;
    scaleMax = Math.max(value, 1) * 2;
  }

  const scaleRange = scaleMax - scaleMin;
  const clamp = (n) => Math.max(0, Math.min(100, n));

  const valuePos = clamp(((value - scaleMin) / scaleRange) * 100);
  const lowPos   = low  !== null ? clamp(((low  - scaleMin) / scaleRange) * 100) : 0;
  const highPos  = high !== null ? clamp(((high - scaleMin) / scaleRange) * 100) : 100;

  const leftWidth  = lowPos;
  const greenWidth = Math.max(0.5, highPos - lowPos);
  const rightWidth = Math.max(0, 100 - highPos);

  // Determine glow color based on status
  const glowColor = status?.includes('critical') ? '#ef444440' : '#f9731640';

  return (
    <div className="py-3">
      <div className="flex items-baseline justify-between mb-2 gap-2">
        <span className="text-sm font-semibold text-slate-700 truncate">{parameter}</span>
        <div className="flex items-baseline gap-1.5 shrink-0">
          <span className={`text-sm font-mono font-bold ${labelColor}`}>
            {your_value}{unit ? ` ${unit}` : ''}
          </span>
          <span className="text-[10px] text-slate-400">({normal_range})</span>
        </div>
      </div>

      {/* Color-coded segmented gauge */}
      <div className="relative h-4 rounded-full overflow-visible">
        {/* Track segments */}
        <div className="absolute inset-0 rounded-full overflow-hidden flex">
          {/* Left zone — below normal (warm orange) */}
          {leftWidth > 0 && (
            <div
              style={{ width: `${leftWidth}%`, background: 'linear-gradient(90deg, #fed7aa, #fb923c)' }}
            />
          )}
          {/* Normal zone — green */}
          <div
            style={{
              width: `${greenWidth}%`,
              background: 'linear-gradient(90deg, #34d399, #059669)',
            }}
          />
          {/* Right zone — above normal (warm orange→red) */}
          {rightWidth > 0 && (
            <div
              style={{ width: `${rightWidth}%`, background: 'linear-gradient(90deg, #fb923c, #ef4444)' }}
            />
          )}
        </div>

        {/* Value marker dot */}
        <div
          className="absolute w-5 h-5 rounded-full border-[3px] border-white -top-0.5 -translate-x-1/2 z-10"
          style={{
            left: `${valuePos}%`,
            backgroundColor: dotColor,
            boxShadow: `0 0 0 3px ${glowColor}, 0 2px 6px rgba(0,0,0,0.25)`,
          }}
        />
      </div>

      {/* Scale labels */}
      <div className="flex justify-between mt-2 text-[9px] text-slate-300 font-mono">
        <span>{scaleMin.toFixed(1)}</span>
        <span>{scaleMax.toFixed(1)}</span>
      </div>
    </div>
  );
}

export default function ParameterProgress({ extractedValues }) {
  const { t } = useTranslation();
  const abnormal = (extractedValues || []).filter(v => v.status && v.status !== 'normal');

  if (!abnormal.length) return null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow p-6 animate-slide-up">
      <h2 className="text-base font-bold font-display text-slate-800 border-b border-slate-200 pb-3 mb-4 flex items-center gap-2">
        <span className="text-lg">📉</span>
        {t('analysis.parameterProgress')}
      </h2>
      <p className="text-xs text-slate-400 mb-4">{t('parameterProgress.description')}</p>
      <div className="divide-y divide-slate-100">
        {abnormal.map((param, i) => (
          <ParameterGauge key={i} param={param} />
        ))}
      </div>
    </div>
  );
}
