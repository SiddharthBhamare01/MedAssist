import { useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../services/api';
import AgentStatusPanel from '../../components/AgentStatus/AgentStatusPanel';
import ShareModal from '../../components/ShareModal';

const STATUS_STYLE = {
  normal:        'bg-emerald-50 text-emerald-700',
  low:           'bg-amber-50 text-amber-700',
  high:          'bg-orange-50 text-orange-700',
  critical_low:  'bg-red-50 text-red-700 font-semibold',
  critical_high: 'bg-red-100 text-red-800 font-bold',
};
const STATUS_LABEL = {
  normal: 'Normal', low: 'Low', high: 'High',
  critical_low: 'Critical Low', critical_high: 'Critical High',
};
const COMPLEXITY_STYLE = {
  Low:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  Medium: 'bg-amber-50 text-amber-700 border-amber-200',
  High:   'bg-red-50 text-red-700 border-red-200',
};

function Section({ title, icon, children, className = '' }) {
  return (
    <div className={`bg-white rounded-2xl border border-slate-100 shadow-card p-6 space-y-4 animate-slide-up flex flex-col ${className}`}>
      <h2 className="text-base font-bold font-display text-slate-800 border-b border-slate-100 pb-3 flex items-center gap-2 shrink-0">
        {icon && <span className="text-lg">{icon}</span>}
        {title}
      </h2>
      <div className="flex-1 min-h-0 flex flex-col">{children}</div>
    </div>
  );
}

export default function Analysis() {
  const { state } = useLocation();
  const { reportId: paramReportId } = useParams();
  const navigate = useNavigate();

  const { extractedValues, sessionId, disease } = state || {};
  const reportId = paramReportId || state?.reportId;

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [fetched, setFetched] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [riskScores, setRiskScores] = useState(null);
  const [followUp, setFollowUp] = useState(null);
  const [loadingRisk, setLoadingRisk] = useState(false);
  const [loadingFollowUp, setLoadingFollowUp] = useState(false);
  const [exporting, setExporting] = useState(false);

  if (!reportId) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <div className="w-20 h-20 bg-teal-50 rounded-3xl flex items-center justify-center mx-auto mb-4">
          <svg className="w-10 h-10 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
          </svg>
        </div>
        <p className="text-slate-500 mb-4">No report found. Please upload a blood report first.</p>
        <button
          onClick={() => navigate('/patient/intake')}
          className="bg-gradient-to-r from-teal-600 to-teal-500 text-white px-6 py-2.5 rounded-xl font-semibold hover:from-teal-700 hover:to-teal-600 shadow-md"
        >
          Start Over
        </button>
      </div>
    );
  }

  // Poll GET /blood-report/:id until analysis is ready (fallback when POST times out)
  useEffect(() => {
    if (fetched) return;
    setFetched(true);
    setLoading(true);

    let pollTimer = null;
    let cancelled = false;

    const applyResult = (data) => {
      if (cancelled) return;
      setResult(data);
      if (data.riskScores) setRiskScores(data.riskScores);
      if (data.followUp) setFollowUp(data.followUp);
      setLoading(false);
    };

    const pollForResult = () => {
      if (cancelled) return;
      api.get(`/blood-report/${reportId}`)
        .then(({ data }) => {
          if (cancelled) return;
          const a = data.analysis;
          if (a && (a.summary || a.abnormal_findings?.length > 0 || a.diet_plan)) {
            applyResult({
              reportId: data.id,
              analysis: a,
              tabletRecommendations: data.tablet_recommendations || [],
              doctorReferralNeeded: data.complexity_flag || false,
              riskScores: data.risk_scores || null,
              followUp: data.follow_up || null,
            });
          } else {
            // Not ready yet — keep polling
            pollTimer = setTimeout(pollForResult, 5000);
          }
        })
        .catch(() => {
          if (!cancelled) pollTimer = setTimeout(pollForResult, 5000);
        });
    };

    // Fire the analyze POST — if it returns in time, great. Otherwise fall back to polling.
    api.post('/blood-report/analyze', { reportId })
      .then((res) => applyResult(res.data))
      .catch(() => {
        // POST timed out or failed — agent may still be running server-side.
        // Start polling the DB for results.
        if (!cancelled) pollForResult();
      });

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRiskScores = async () => {
    setLoadingRisk(true);
    try {
      const { data } = await api.post('/blood-report/risk-scores', { reportId });
      setRiskScores(data.riskScores);
      toast.success('Risk scores calculated');
    } catch (err) {
      toast.error('Risk scoring failed');
    } finally {
      setLoadingRisk(false);
    }
  };

  const handleFollowUp = async () => {
    setLoadingFollowUp(true);
    try {
      const { data } = await api.post('/blood-report/follow-up', { reportId });
      setFollowUp(data.followUp);
      toast.success('Follow-up schedule generated');
    } catch (err) {
      toast.error('Follow-up generation failed');
    } finally {
      setLoadingFollowUp(false);
    }
  };

  const handleExportPDF = async () => {
    if (!sessionId) {
      toast.error('Session ID required for PDF export');
      return;
    }
    setExporting(true);
    try {
      const response = await api.get(`/patient/sessions/${sessionId}/export-pdf`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `MedAssist_Report_${sessionId.slice(0, 8)}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('PDF downloaded');
    } catch (err) {
      toast.error('PDF export failed');
    } finally {
      setExporting(false);
    }
  };

  const { analysis, tabletRecommendations, doctorReferralNeeded } = result || {};
  const summary = analysis?.summary;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-slate-400">
        <button onClick={() => navigate('/patient/dashboard')} className="hover:text-teal-600 transition-colors">
          My Sessions
        </button>
        {sessionId && (
          <>
            <span className="text-slate-300">/</span>
            <button onClick={() => navigate(`/patient/upload-report/${sessionId}`)} className="hover:text-teal-600 transition-colors">
              Upload Report
            </button>
          </>
        )}
        <span className="text-slate-300">/</span>
        <span className="text-slate-600 font-medium">Analysis</span>
      </nav>

      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold font-display text-slate-800">Blood Report Analysis</h1>
            {disease && (
              <p className="text-sm text-teal-600 mt-0.5 font-medium">Context: {disease.disease}</p>
            )}
          </div>
          {!loading && result && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleExportPDF}
                disabled={exporting}
                className="flex items-center gap-1.5 px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white text-sm font-semibold rounded-xl transition-all shadow-sm disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {exporting ? 'Exporting...' : 'Export PDF'}
              </button>
              <button
                onClick={() => setShowShareModal(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-xl transition-all shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                Share
              </button>
            </div>
          )}
        </div>
        <div className="mt-3 p-3 bg-amber-50/80 border border-amber-200/60 rounded-xl text-xs text-amber-700">
          Educational use only. AI-generated analysis — always consult a qualified physician.
        </div>
      </div>

      {/* Share Modal */}
      {showShareModal && (
        <ShareModal sessionId={sessionId || reportId} onClose={() => setShowShareModal(false)} />
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-4">
          <AgentStatusPanel sessionId={reportId} />
          <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-8 flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
            <div className="text-center">
              <p className="font-medium text-slate-700">Blood Report Agent is running...</p>
              <p className="text-sm text-slate-400 mt-1">
                Checking reference ranges, searching FDA drug database, verifying interactions
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {!loading && result && (
        <>
          {/* Summary + Abnormal Findings — side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Summary */}
          <Section title="Overall Summary" icon="📊">
            <div className="flex items-start gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <p className="text-slate-700 leading-relaxed">{summary?.overall_assessment}</p>
                {summary?.root_cause && (
                  <p className="text-sm text-slate-500 mt-2">
                    <span className="font-semibold text-slate-700">Root cause: </span>
                    {summary.root_cause}
                  </p>
                )}
              </div>
              {summary?.complexity && (
                <span className={`px-3 py-1.5 rounded-xl text-sm font-bold shrink-0 border ${COMPLEXITY_STYLE[summary.complexity] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                  {summary.complexity} Complexity
                </span>
              )}
            </div>
          </Section>

          {/* Abnormal Findings */}
          {analysis?.abnormal_findings?.length > 0 && (
            <Section title={`Abnormal Findings (${analysis.abnormal_findings.length})`} icon="🔬" className="max-h-[665px]">
              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto -mx-2 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="text-left text-[11px] text-slate-400 border-b border-slate-200">
                      <th className="py-1.5 px-1.5 font-medium">Parameter</th>
                      <th className="py-1.5 px-1.5 font-medium">Value</th>
                      <th className="py-1.5 px-1.5 font-medium">Normal</th>
                      <th className="py-1.5 px-1.5 font-medium">Status</th>
                      <th className="py-1.5 px-1.5 font-medium">Interpretation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {analysis.abnormal_findings.map((f, i) => (
                      <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-1.5 px-1.5 font-medium text-slate-800 whitespace-nowrap">{f.parameter}</td>
                        <td className="py-1.5 px-1.5 font-mono font-semibold whitespace-nowrap">{f.your_value}</td>
                        <td className="py-1.5 px-1.5 text-slate-500 font-mono whitespace-nowrap">{f.normal_range}</td>
                        <td className="py-1.5 px-1.5 whitespace-nowrap">
                          <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${STATUS_STYLE[f.status] || 'bg-slate-100 text-slate-600'}`}>
                            {STATUS_LABEL[f.status] || f.status}
                          </span>
                        </td>
                        <td className="py-1.5 px-1.5 text-slate-600 max-w-[180px] truncate" title={f.interpretation}>{f.interpretation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}
          </div>

          {/* Treatment Solutions */}
          {analysis?.treatment_solutions?.length > 0 && (
            <Section title={`Treatment Solutions (${analysis.treatment_solutions.length})`} icon="💡">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {analysis.treatment_solutions.map((t, i) => (
                  typeof t === 'string' ? (
                    // Legacy format: plain string advice
                    <div key={i} className="flex items-start gap-3 text-slate-700 text-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-teal-400 mt-2 shrink-0" />
                      {t}
                    </div>
                  ) : (
                    // New format: structured treatment object
                    <div key={i} className="border border-slate-100 rounded-xl p-4 bg-gradient-to-r from-teal-50/50 to-white hover:from-teal-50 transition-colors">
                      <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
                        <div>
                          <h3 className="font-bold text-slate-800">{t.medication || t.name}</h3>
                          {t.generic_name && t.generic_name !== (t.medication || t.name) && (
                            <p className="text-xs text-slate-500 font-mono mt-0.5">Generic: {t.generic_name}</p>
                          )}
                          {t.condition && (
                            <p className="text-xs text-teal-600 mt-0.5">For: {t.condition}</p>
                          )}
                        </div>
                        {t.fda_approved && (
                          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-lg border border-emerald-200 shrink-0">
                            FDA Approved
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs mt-2">
                        {t.dosage && (
                          <div className="bg-white rounded-lg px-2.5 py-1.5 border border-slate-100">
                            <span className="text-slate-400 block">Dosage</span>
                            <span className="text-slate-700 font-medium">{t.dosage}</span>
                          </div>
                        )}
                        {t.frequency && (
                          <div className="bg-white rounded-lg px-2.5 py-1.5 border border-slate-100">
                            <span className="text-slate-400 block">Frequency</span>
                            <span className="text-slate-700 font-medium">{t.frequency}</span>
                          </div>
                        )}
                        {t.duration && (
                          <div className="bg-white rounded-lg px-2.5 py-1.5 border border-slate-100">
                            <span className="text-slate-400 block">Duration</span>
                            <span className="text-slate-700 font-medium">{t.duration}</span>
                          </div>
                        )}
                        {t.route && (
                          <div className="bg-white rounded-lg px-2.5 py-1.5 border border-slate-100">
                            <span className="text-slate-400 block">Route</span>
                            <span className="text-slate-700 font-medium capitalize">{t.route}</span>
                          </div>
                        )}
                      </div>
                      {t.evidence && (
                        <p className="text-xs text-slate-500 mt-2">
                          <span className="font-medium text-slate-600">Rationale:</span> {t.evidence}
                        </p>
                      )}
                      {t.precautions && (
                        <p className="text-xs text-amber-600 mt-1.5 bg-amber-50 rounded-lg px-2.5 py-1.5 border border-amber-100">
                          ⚠️ {t.precautions}
                        </p>
                      )}
                    </div>
                  )
                ))}
              </div>
            </Section>
          )}

          {/* Tablet Recommendations */}
          {tabletRecommendations?.length > 0 && (
            <Section title={`Tablet Recommendations (${tabletRecommendations.length})`} icon="💊">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {tabletRecommendations.map((med, i) => (
                  <div key={i} className="border border-slate-100 rounded-xl p-4 bg-slate-50/50 hover:bg-slate-50 transition-colors">
                    <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
                      <div>
                        <h3 className="font-bold text-slate-800">{med.name}</h3>
                        {med.generic_name && med.generic_name !== med.name && (
                          <p className="text-xs text-slate-500 font-mono mt-0.5">Generic: {med.generic_name}</p>
                        )}
                      </div>
                      {med.fda_approved && (
                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-lg border border-emerald-200">
                          FDA Approved
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-sm mt-3">
                      {[['Dosage', med.dosage], ['Frequency', med.frequency], ['Duration', med.duration]].map(([label, val]) => (
                        <div key={label}>
                          <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{label}</p>
                          <p className="text-slate-700 font-medium mt-0.5">{val || '—'}</p>
                        </div>
                      ))}
                    </div>
                    {med.reason && (
                      <p className="text-xs text-slate-500 mt-3 border-t border-slate-100 pt-2">
                        <span className="font-medium">Reason:</span> {med.reason}
                      </p>
                    )}
                    {med.contraindication_note && (
                      <p className="text-xs text-amber-600 mt-1 bg-amber-50 rounded-lg px-2 py-1">
                        {med.contraindication_note}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Diet Plan + Recovery Ingredients — side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Diet Plan */}
          {analysis?.diet_plan && (
            <Section title="Personalized Diet Plan" icon="🥗">
              {analysis.diet_plan.overview && (
                <p className="text-slate-600 text-sm">{analysis.diet_plan.overview}</p>
              )}

              {analysis.diet_plan.meal_schedule?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-2">Daily Meal Schedule</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {analysis.diet_plan.meal_schedule.map((m, i) => (
                      <div key={i} className="bg-emerald-50/70 border border-emerald-100 rounded-xl p-3">
                        <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide mb-1">{m.meal}</p>
                        <p className="text-sm text-slate-700">{m.suggestion}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {analysis.diet_plan.foods_to_eat?.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-emerald-700 mb-2">Foods to Eat</h3>
                    <ul className="space-y-2">
                      {analysis.diet_plan.foods_to_eat.map((f, i) => (
                        <li key={i} className="bg-emerald-50/50 rounded-xl p-2.5 border border-emerald-100">
                          <p className="font-medium text-slate-800 text-sm">{f.food}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{f.reason}</p>
                          {f.frequency && (
                            <p className="text-xs text-emerald-600 mt-0.5 font-medium">{f.frequency}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {analysis.diet_plan.foods_to_avoid?.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-red-600 mb-2">Foods to Avoid</h3>
                    <ul className="space-y-2">
                      {analysis.diet_plan.foods_to_avoid.map((f, i) => (
                        <li key={i} className="bg-red-50/50 rounded-xl p-2.5 border border-red-100">
                          <p className="font-medium text-slate-800 text-sm">{f.food}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{f.reason}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* Recovery Ingredients */}
          {analysis?.recovery_ingredients?.length > 0 && (
            <Section title="Recovery Ingredients" icon="🧬">
              <div className="space-y-3">
                {analysis.recovery_ingredients.map((item, i) => (
                  <div key={i} className="border border-teal-100 bg-teal-50/50 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="font-bold text-slate-800">{item.ingredient}</h3>
                      {item.targets?.length > 0 && (
                        <div className="flex flex-wrap gap-1 justify-end">
                          {item.targets.map((t, j) => (
                            <span key={j} className="text-xs bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-lg font-medium">
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-slate-600">{item.benefit}</p>
                    {item.how_to_use && (
                      <p className="text-xs text-teal-700 mt-1.5 font-medium">How to use: {item.how_to_use}</p>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}
          </div>

          {/* AI Enhancement Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={handleRiskScores}
              disabled={loadingRisk || !!riskScores}
              className="bg-white rounded-2xl border border-slate-100 shadow-card p-5 text-left hover:shadow-card-hover hover:border-teal-200 transition-all disabled:opacity-60"
            >
              <div className="text-2xl mb-2">📈</div>
              <h3 className="font-bold text-slate-800 text-sm">Clinical Risk Scores</h3>
              <p className="text-xs text-slate-400 mt-1">
                {loadingRisk ? 'Calculating...' : riskScores ? 'Scores calculated' : 'Framingham, FINDRISC, CKD-EPI, Child-Pugh'}
              </p>
            </button>
            <button
              onClick={handleFollowUp}
              disabled={loadingFollowUp || !!followUp}
              className="bg-white rounded-2xl border border-slate-100 shadow-card p-5 text-left hover:shadow-card-hover hover:border-teal-200 transition-all disabled:opacity-60"
            >
              <div className="text-2xl mb-2">📅</div>
              <h3 className="font-bold text-slate-800 text-sm">Follow-up Schedule</h3>
              <p className="text-xs text-slate-400 mt-1">
                {loadingFollowUp ? 'Generating...' : followUp ? 'Schedule ready' : 'Personalized retest recommendations'}
              </p>
            </button>
          </div>

          {/* Risk Scores + Follow-up — side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Risk Scores Results */}
          {riskScores && (() => {
            const s = riskScores.composite_score ?? null;
            const level = riskScores.risk_level || 'Unknown';
            const visit = riskScores.hospital_visit || 'recommended_soon';
            const breakdown = riskScores.breakdown || [];

            const LEVEL_STYLE = {
              Low:      { ring: 'text-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
              Moderate: { ring: 'text-amber-500',   bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200' },
              High:     { ring: 'text-orange-500',  bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200' },
              Critical: { ring: 'text-red-500',     bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200' },
            };
            const VISIT_LABEL = {
              not_needed: 'Routine checkup sufficient',
              recommended_soon: 'Schedule a doctor visit within 1–2 months',
              visit_within_2_weeks: 'See a doctor within 1–2 weeks',
              immediate: 'Visit hospital immediately',
            };
            const ls = LEVEL_STYLE[level] || LEVEL_STYLE.Moderate;

            return (
              <Section title="Clinical Risk Score" icon="📈">
                <div className="flex flex-col sm:flex-row items-center gap-6">
                  {/* Score circle */}
                  <div className="relative w-32 h-32 shrink-0">
                    <svg className="w-32 h-32 -rotate-90" viewBox="0 0 120 120">
                      <circle cx="60" cy="60" r="52" fill="none" stroke="#e2e8f0" strokeWidth="10" />
                      <circle cx="60" cy="60" r="52" fill="none" className={ls.ring} strokeWidth="10"
                        strokeDasharray={`${(s || 0) * 3.267} 326.7`}
                        strokeLinecap="round" />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className={`text-3xl font-bold font-display ${ls.ring}`}>{s ?? '—'}</span>
                      <span className="text-[10px] text-slate-400 font-medium">/100</span>
                    </div>
                  </div>

                  {/* Summary */}
                  <div className="flex-1 min-w-0 text-center sm:text-left">
                    <span className={`inline-block px-3 py-1 rounded-xl text-xs font-bold border ${ls.bg} ${ls.text} ${ls.border}`}>
                      {level} Risk
                    </span>
                    <p className="text-slate-700 text-sm mt-2 leading-relaxed">{riskScores.summary}</p>
                    <p className={`text-xs font-semibold mt-2 ${ls.text}`}>
                      {VISIT_LABEL[visit] || visit}
                    </p>
                  </div>
                </div>

                {/* Breakdown bars */}
                {breakdown.length > 0 && (
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    {breakdown.map((b) => {
                      const bScore = b.score ?? 0;
                      const bColor = bScore >= 76 ? 'bg-red-500' : bScore >= 51 ? 'bg-orange-400' : bScore >= 26 ? 'bg-amber-400' : 'bg-emerald-500';
                      return (
                        <div key={b.area} className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                          <p className="text-xs font-semibold text-slate-700">{b.area}</p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                              <div className={`h-2 rounded-full ${bColor}`} style={{ width: `${bScore}%` }} />
                            </div>
                            <span className="text-xs font-bold text-slate-600 w-7 text-right">{b.score ?? '—'}</span>
                          </div>
                          {b.note && <p className="text-[10px] text-slate-400 mt-1 line-clamp-2">{b.note}</p>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Section>
            );
          })()}

          {/* Follow-up Schedule */}
          {followUp && (
            <Section title="Follow-up Schedule" icon="📅">
              <div className="space-y-3">
                {(Array.isArray(followUp) ? followUp : [followUp]).map((item, i) => (
                  <div key={i} className="flex items-start gap-3 bg-amber-50/50 border border-amber-100 rounded-xl p-4">
                    <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-amber-700">{i + 1}</span>
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800 text-sm">{item.test || item.name || 'Follow-up'}</h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Recheck in: <span className="font-semibold text-amber-700">{item.recheck_in || item.timeframe || 'TBD'}</span>
                      </p>
                      {item.reason && <p className="text-xs text-slate-400 mt-1">{item.reason}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}
          </div>

          {/* Doctor Referral */}
          {doctorReferralNeeded && (
            <Section title="Doctor Referral Recommended" icon="🏥">
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <p className="font-bold text-red-800">Professional Medical Consultation Required</p>
                {summary?.referral_reason && (
                  <p className="text-sm text-red-700 mt-1">{summary.referral_reason}</p>
                )}
                <p className="text-xs text-red-600 mt-2">
                  Your results indicate findings that require evaluation by a qualified physician.
                </p>
                <button
                  onClick={() => navigate('/patient/doctors', { state: { sessionId } })}
                  className="mt-4 bg-red-600 hover:bg-red-700 text-white font-semibold px-5 py-2 rounded-xl text-sm transition-all shadow-sm"
                >
                  Find a Doctor Near Me
                </button>
              </div>
            </Section>
          )}

          {/* Find Doctor CTA */}
          {!doctorReferralNeeded && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-700">Looking for a doctor anyway?</p>
                <p className="text-xs text-slate-400">Find specialists near you</p>
              </div>
              <button
                onClick={() => navigate('/patient/doctors', { state: { sessionId } })}
                className="bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-700 hover:to-teal-600 text-white font-semibold px-5 py-2 rounded-xl text-sm transition-all shadow-sm whitespace-nowrap"
              >
                Find a Doctor
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
