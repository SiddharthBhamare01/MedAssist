import { useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../services/api';
import AgentStatusPanel from '../../components/AgentStatus/AgentStatusPanel';

const STATUS_STYLE = {
  normal:        'bg-green-50 text-green-700',
  low:           'bg-yellow-50 text-yellow-800',
  high:          'bg-orange-50 text-orange-800',
  critical_low:  'bg-red-100 text-red-800 font-semibold',
  critical_high: 'bg-red-200 text-red-900 font-bold',
};
const STATUS_LABEL = {
  normal: 'Normal', low: 'Low', high: 'High',
  critical_low: 'Critical Low', critical_high: 'Critical High',
};
const COMPLEXITY_STYLE = {
  Low:    'bg-green-100 text-green-700',
  Medium: 'bg-yellow-100 text-yellow-800',
  High:   'bg-red-100 text-red-700',
};

function Section({ title, children }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
      <h2 className="text-lg font-bold text-gray-800 border-b border-gray-100 pb-2">{title}</h2>
      {children}
    </div>
  );
}

export default function Analysis() {
  const { state } = useLocation();
  const { reportId: paramReportId } = useParams();
  const navigate = useNavigate();

  // reportId from URL param (resume) takes precedence over navigation state
  const { extractedValues, sessionId, disease } = state || {};
  const reportId = paramReportId || state?.reportId;

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [fetched, setFetched] = useState(false);

  if (!reportId) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <div className="text-5xl mb-4">🩺</div>
        <p className="text-gray-500 mb-4">No report found. Please upload a blood report first.</p>
        <button
          onClick={() => navigate('/patient/intake')}
          className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-blue-700"
        >
          Start Over
        </button>
      </div>
    );
  }

  useEffect(() => {
    if (fetched) return;
    setFetched(true);
    setLoading(true);

    api.post('/blood-report/analyze', { reportId })
      .then((res) => setResult(res.data))
      .catch((err) => toast.error(err.response?.data?.error || 'Analysis failed'))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { analysis, tabletRecommendations, doctorReferralNeeded } = result || {};
  const summary = analysis?.summary;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-gray-400">
        <button onClick={() => navigate('/patient/dashboard')} className="hover:text-blue-600 transition-colors">
          My Sessions
        </button>
        {sessionId && (
          <>
            <span>›</span>
            <button onClick={() => navigate(`/patient/upload-report/${sessionId}`)} className="hover:text-blue-600 transition-colors">
              Upload Report
            </button>
          </>
        )}
        <span>›</span>
        <span className="text-gray-600 font-medium">Analysis</span>
      </nav>

      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h1 className="text-xl font-bold text-gray-800">Blood Report Analysis</h1>
        {disease && (
          <p className="text-sm text-blue-600 mt-0.5 font-medium">Context: {disease.disease}</p>
        )}
        <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-800">
          ⚠️ Educational use only. AI-generated analysis — always consult a qualified physician before acting on these results.
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-4">
          <AgentStatusPanel sessionId={reportId} />
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <div className="text-center">
              <p className="font-medium text-gray-700">Blood Report Agent is running…</p>
              <p className="text-sm text-gray-400 mt-1">
                Checking reference ranges, searching FDA drug database, verifying interactions
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {!loading && result && (
        <>
          {/* Section 1 — Summary */}
          <Section title="Section 1 — Overall Summary">
            <div className="flex items-start gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <p className="text-gray-700 leading-relaxed">{summary?.overall_assessment}</p>
                {summary?.root_cause && (
                  <p className="text-sm text-gray-500 mt-2">
                    <span className="font-medium text-gray-700">Root cause: </span>
                    {summary.root_cause}
                  </p>
                )}
              </div>
              {summary?.complexity && (
                <span className={`px-3 py-1.5 rounded-full text-sm font-bold shrink-0 ${COMPLEXITY_STYLE[summary.complexity] || 'bg-gray-100 text-gray-600'}`}>
                  {summary.complexity} Complexity
                </span>
              )}
            </div>
          </Section>

          {/* Section 2 — Abnormal Findings */}
          {analysis?.abnormal_findings?.length > 0 && (
            <Section title={`Section 2 — Abnormal Findings (${analysis.abnormal_findings.length})`}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                      <th className="pb-2 font-medium">Parameter</th>
                      <th className="pb-2 font-medium">Your Value</th>
                      <th className="pb-2 font-medium">Normal Range</th>
                      <th className="pb-2 font-medium">Status</th>
                      <th className="pb-2 font-medium">Interpretation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {analysis.abnormal_findings.map((f, i) => (
                      <tr key={i} className={STATUS_STYLE[f.status] || ''}>
                        <td className="py-2 pr-3 font-medium text-gray-800 whitespace-nowrap">{f.parameter}</td>
                        <td className="py-2 pr-3 font-mono font-semibold whitespace-nowrap">{f.your_value}</td>
                        <td className="py-2 pr-3 text-gray-500 font-mono text-xs whitespace-nowrap">{f.normal_range}</td>
                        <td className="py-2 pr-3 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLE[f.status] || 'bg-gray-100 text-gray-600'}`}>
                            {STATUS_LABEL[f.status] || f.status}
                          </span>
                        </td>
                        <td className="py-2 text-gray-600 text-xs">{f.interpretation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* Section 3 — Treatment Solutions */}
          {analysis?.treatment_solutions?.length > 0 && (
            <Section title="Section 3 — Treatment Solutions">
              <ul className="space-y-2">
                {analysis.treatment_solutions.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-gray-700 text-sm">
                    <span className="text-blue-500 font-bold mt-0.5 shrink-0">•</span>
                    {s}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Section 4 — Tablet Recommendations */}
          {tabletRecommendations?.length > 0 && (
            <Section title={`Section 4 — Tablet Recommendations (${tabletRecommendations.length})`}>
              <div className="space-y-4">
                {tabletRecommendations.map((med, i) => (
                  <div key={i} className="border border-gray-100 rounded-xl p-4 bg-gray-50">
                    <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
                      <div>
                        <h3 className="font-bold text-gray-800">{med.name}</h3>
                        {med.generic_name && med.generic_name !== med.name && (
                          <p className="text-xs text-gray-500 font-mono mt-0.5">Generic: {med.generic_name}</p>
                        )}
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        {med.fda_approved && (
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-semibold rounded-full">
                            FDA Approved
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-sm mt-3">
                      <div>
                        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Dosage</p>
                        <p className="text-gray-700 font-medium mt-0.5">{med.dosage || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Frequency</p>
                        <p className="text-gray-700 font-medium mt-0.5">{med.frequency || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Duration</p>
                        <p className="text-gray-700 font-medium mt-0.5">{med.duration || '—'}</p>
                      </div>
                    </div>
                    {med.reason && (
                      <p className="text-xs text-gray-500 mt-3 border-t border-gray-100 pt-2">
                        <span className="font-medium">Reason:</span> {med.reason}
                      </p>
                    )}
                    {med.contraindication_note && (
                      <p className="text-xs text-orange-600 mt-1">
                        ⚠️ {med.contraindication_note}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Section 5 — Diet Plan */}
          {analysis?.diet_plan && (
            <Section title="Section 5 — Personalized Diet Plan">
              {analysis.diet_plan.overview && (
                <p className="text-gray-600 text-sm">{analysis.diet_plan.overview}</p>
              )}

              {/* Meal Schedule */}
              {analysis.diet_plan.meal_schedule?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Daily Meal Schedule</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {analysis.diet_plan.meal_schedule.map((m, i) => (
                      <div key={i} className="bg-green-50 border border-green-100 rounded-xl p-3">
                        <p className="text-xs font-bold text-green-700 uppercase tracking-wide mb-1">{m.meal}</p>
                        <p className="text-sm text-gray-700">{m.suggestion}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Foods to Eat */}
                {analysis.diet_plan.foods_to_eat?.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-green-700 mb-2">✅ Foods to Eat</h3>
                    <ul className="space-y-2">
                      {analysis.diet_plan.foods_to_eat.map((f, i) => (
                        <li key={i} className="bg-green-50 rounded-lg p-2.5">
                          <p className="font-medium text-gray-800 text-sm">{f.food}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{f.reason}</p>
                          {f.frequency && (
                            <p className="text-xs text-green-600 mt-0.5 font-medium">{f.frequency}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Foods to Avoid */}
                {analysis.diet_plan.foods_to_avoid?.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-red-600 mb-2">❌ Foods to Avoid</h3>
                    <ul className="space-y-2">
                      {analysis.diet_plan.foods_to_avoid.map((f, i) => (
                        <li key={i} className="bg-red-50 rounded-lg p-2.5">
                          <p className="font-medium text-gray-800 text-sm">{f.food}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{f.reason}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* Section 6 — Recovery Ingredients */}
          {analysis?.recovery_ingredients?.length > 0 && (
            <Section title="Section 6 — Recovery Ingredients">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {analysis.recovery_ingredients.map((item, i) => (
                  <div key={i} className="border border-blue-100 bg-blue-50 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="font-bold text-gray-800">{item.ingredient}</h3>
                      {item.targets?.length > 0 && (
                        <div className="flex flex-wrap gap-1 justify-end">
                          {item.targets.map((t, j) => (
                            <span key={j} className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-gray-600">{item.benefit}</p>
                    {item.how_to_use && (
                      <p className="text-xs text-blue-700 mt-1.5 font-medium">
                        How to use: {item.how_to_use}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Section 7 — Doctor Referral */}
          {doctorReferralNeeded && (
            <Section title="Section 7 — Doctor Referral Recommended">
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <span className="text-2xl shrink-0">🏥</span>
                  <div className="flex-1">
                    <p className="font-bold text-red-800">Professional Medical Consultation Required</p>
                    {summary?.referral_reason && (
                      <p className="text-sm text-red-700 mt-1">{summary.referral_reason}</p>
                    )}
                    <p className="text-xs text-red-600 mt-2">
                      Your results indicate findings that require evaluation by a qualified physician. Please do not self-medicate.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => navigate('/patient/doctors', { state: { sessionId } })}
                  className="mt-4 bg-red-600 hover:bg-red-700 text-white font-semibold px-5 py-2 rounded-lg text-sm transition-colors"
                >
                  Find a Doctor Near Me →
                </button>
              </div>
            </Section>
          )}

          {/* Done — no referral */}
          {!doctorReferralNeeded && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-700">Looking for a doctor anyway?</p>
                <p className="text-xs text-gray-400">Find specialists near you</p>
              </div>
              <button
                onClick={() => navigate('/patient/doctors', { state: { sessionId } })}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-2 rounded-lg text-sm transition-colors whitespace-nowrap"
              >
                Find a Doctor →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
