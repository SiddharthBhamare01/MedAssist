const STATUS_COLOR = {
  high:          'bg-orange-400',
  low:           'bg-amber-400',
  critical_high: 'bg-red-500',
  critical_low:  'bg-red-500',
};

const STATUS_LABEL = {
  normal: 'Normal', low: 'Low', high: 'High',
  critical_low: 'Crit Low', critical_high: 'Crit High',
};

const STATUS_TEXT = {
  high: 'text-orange-600', low: 'text-amber-600',
  critical_high: 'text-red-600', critical_low: 'text-red-600',
  normal: 'text-emerald-600',
};

function parseNormalRange(range) {
  if (!range) return null;
  // Skip sex-stratified ranges like "M: 13-17, F: 12-15"
  if (/[MF]\s*:/i.test(range)) return null;
  // "> N" or ">= N"
  const gtMatch = range.match(/^[>≥>=]+\s*([\d.]+)/);
  if (gtMatch) return { low: parseFloat(gtMatch[1]), high: null };
  // "< N" or "<= N"
  const ltMatch = range.match(/^[<≤<=]+\s*([\d.]+)/);
  if (ltMatch) return { low: null, high: parseFloat(ltMatch[1]) };
  // "N - N" or "N – N"
  const rangeMatch = range.match(/([\d.]+)\s*[-–]\s*([\d.]+)/);
  if (rangeMatch) return { low: parseFloat(rangeMatch[1]), high: parseFloat(rangeMatch[2]) };
  return null;
}

function ParameterGauge({ param }) {
  const { parameter, your_value, normal_range, status, unit } = param;
  const value = parseFloat(your_value);
  const range = parseNormalRange(normal_range);
  const markerColor = STATUS_COLOR[status] || 'bg-slate-400';
  const labelColor = STATUS_TEXT[status] || 'text-slate-500';

  if (!range || isNaN(value)) {
    // No parseable range — fallback to plain row
    return (
      <div className="flex items-center justify-between gap-3 py-2">
        <span className="text-sm font-medium text-slate-700 truncate flex-1">{parameter}</span>
        <span className="font-mono text-sm text-slate-800">{your_value}{unit ? ` ${unit}` : ''}</span>
        <span className={`text-xs font-semibold shrink-0 ${labelColor}`}>
          {STATUS_LABEL[status] || status}
        </span>
      </div>
    );
  }

  const { low, high } = range;

  // Build a scale that comfortably shows both the normal zone and patient value
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

  // Guard against zero-range
  if (scaleMax - scaleMin < 0.001) {
    scaleMin = 0;
    scaleMax = Math.max(value, 1) * 2;
  }

  const scaleRange = scaleMax - scaleMin;
  const clamp = (n) => Math.max(0, Math.min(100, n));

  const valuePos  = clamp(((value - scaleMin) / scaleRange) * 100);
  const lowPos    = low  !== null ? clamp(((low  - scaleMin) / scaleRange) * 100) : 0;
  const highPos   = high !== null ? clamp(((high - scaleMin) / scaleRange) * 100) : 100;

  return (
    <div className="py-2">
      <div className="flex items-baseline justify-between mb-1.5 gap-2">
        <span className="text-sm font-medium text-slate-700 truncate">{parameter}</span>
        <div className="flex items-baseline gap-1.5 shrink-0">
          <span className={`text-sm font-mono font-semibold ${labelColor}`}>
            {your_value}{unit ? ` ${unit}` : ''}
          </span>
          <span className="text-[10px] text-slate-400">({normal_range})</span>
        </div>
      </div>

      {/* Gauge track */}
      <div className="relative h-3">
        {/* Background track */}
        <div className="absolute inset-0 bg-slate-100 rounded-full" />
        {/* Normal zone (green) */}
        <div
          className="absolute inset-y-0 bg-emerald-100 rounded-full"
          style={{ left: `${lowPos}%`, width: `${Math.max(1, highPos - lowPos)}%` }}
        />
        {/* Value marker dot */}
        <div
          className={`absolute w-4 h-4 rounded-full ${markerColor} border-2 border-white shadow-md -top-0.5 -translate-x-1/2`}
          style={{ left: `${valuePos}%` }}
        />
      </div>

      {/* Scale labels */}
      <div className="flex justify-between mt-1 text-[9px] text-slate-300 font-mono">
        <span>{scaleMin.toFixed(1)}</span>
        <span>{scaleMax.toFixed(1)}</span>
      </div>
    </div>
  );
}

export default function ParameterProgress({ extractedValues }) {
  const abnormal = (extractedValues || []).filter(
    (v) => v.status && v.status !== 'normal'
  );

  if (!abnormal.length) return null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow p-6 animate-slide-up">
      <h2 className="text-base font-bold font-display text-slate-800 border-b border-slate-200 pb-3 mb-4 flex items-center gap-2">
        <span className="text-lg">📉</span>
        Parameter Progress
      </h2>
      <p className="text-xs text-slate-400 mb-4">
        Each bar shows your value (dot) relative to the normal range (green zone).
      </p>
      <div className="divide-y divide-slate-50">
        {abnormal.map((param, i) => (
          <ParameterGauge key={i} param={param} />
        ))}
      </div>
    </div>
  );
}
