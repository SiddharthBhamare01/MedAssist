import { useState, useEffect } from 'react';
import api from '../services/api';

function TrendIcon({ trend }) {
  if (trend === 'up') return <span className="text-red-500 font-bold text-lg">↑</span>;
  if (trend === 'down') return <span className="text-emerald-500 font-bold text-lg">↓</span>;
  return <span className="text-slate-300 text-lg">—</span>;
}

function StatusBadge({ status }) {
  if (!status) return null;
  const cls =
    status === 'normal'
      ? 'bg-emerald-50 text-emerald-700'
      : status === 'high' || status === 'low'
      ? 'bg-red-50 text-red-600'
      : 'bg-amber-50 text-amber-700';
  return <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${cls}`}>{status}</span>;
}

export default function CompareModal({ id1, id2, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get(`/blood-report/compare?id1=${id1}&id2=${id2}`)
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.error || err.message || 'Failed to compare reports'))
      .finally(() => setLoading(false));
  }, [id1, id2]);

  const fmt = (d) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <h2 className="text-lg font-bold text-slate-800">Report Comparison</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-lg hover:bg-slate-100"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center h-64">
              <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {error && (
            <div className="p-6 text-center text-red-500 text-sm">{error}</div>
          )}
          {data && (
            <>
              {/* Column headers */}
              <div className="grid grid-cols-4 gap-0 px-6 pt-4 pb-3 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100 bg-slate-50/60">
                <span>Parameter</span>
                <span className="text-center">{fmt(data.report_a.created_at)}</span>
                <span className="text-center">{fmt(data.report_b.created_at)}</span>
                <span className="text-center">Change</span>
              </div>

              <div className="divide-y divide-slate-50">
                {data.diff.map((row, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-4 gap-0 px-6 py-3 items-center hover:bg-slate-50 transition-colors"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-800 capitalize">{row.parameter}</p>
                      {row.normal_range && (
                        <p className="text-xs text-slate-400 mt-0.5">Ref: {row.normal_range}</p>
                      )}
                    </div>
                    <div className="text-center">
                      {row.a ? (
                        <div>
                          <span className="text-sm font-semibold text-slate-700">{row.a.value}</span>
                          <span className="text-xs text-slate-400 ml-1">{row.a.unit}</span>
                          <div className="mt-0.5">
                            <StatusBadge status={row.a.status} />
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-300 text-sm">—</span>
                      )}
                    </div>
                    <div className="text-center">
                      {row.b ? (
                        <div>
                          <span className="text-sm font-semibold text-slate-700">{row.b.value}</span>
                          <span className="text-xs text-slate-400 ml-1">{row.b.unit}</span>
                          <div className="mt-0.5">
                            <StatusBadge status={row.b.status} />
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-300 text-sm">—</span>
                      )}
                    </div>
                    <div className="text-center">
                      <TrendIcon trend={row.trend} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 shrink-0 text-xs text-slate-400 text-center">
          ↑ = increased between reports &nbsp;·&nbsp; ↓ = decreased &nbsp;·&nbsp; — = no numeric change or missing
        </div>
      </div>
    </div>
  );
}
