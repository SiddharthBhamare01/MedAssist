import { useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../services/api';

const URGENCY_STYLE = {
  essential:    { badge: 'bg-red-100 text-red-700',    label: 'Essential' },
  recommended:  { badge: 'bg-blue-100 text-blue-700',  label: 'Recommended' },
  optional:     { badge: 'bg-gray-100 text-gray-600',  label: 'Optional' },
};

function TestCard({ test, index }) {
  const style = URGENCY_STYLE[test.urgency] || URGENCY_STYLE.optional;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 print:shadow-none print:border print:break-inside-avoid">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <span className="w-8 h-8 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-sm shrink-0">
            {index + 1}
          </span>
          <div>
            <h3 className="font-bold text-gray-800 leading-tight">{test.test_name}</h3>
            {test.abbreviation && (
              <span className="text-xs font-mono text-gray-400">{test.abbreviation}</span>
            )}
          </div>
        </div>
        <span className={`px-2 py-1 rounded-full text-xs font-semibold shrink-0 ${style.badge}`}>
          {style.label}
        </span>
      </div>

      <p className="text-sm text-gray-600 mb-3">{test.reason}</p>

      {test.normal_range && (
        <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
          <span className="font-medium text-gray-700">Normal range:</span>
          <span className="font-mono bg-gray-50 px-2 py-0.5 rounded">{test.normal_range}</span>
        </div>
      )}

      {test.what_to_expect && (
        <p className="text-xs text-gray-400 italic border-t border-gray-50 pt-2 mt-2">
          {test.what_to_expect}
        </p>
      )}
    </div>
  );
}

export default function Tests() {
  const { state } = useLocation();
  const { sessionId: paramSessionId } = useParams();
  const navigate = useNavigate();

  // sessionId comes from URL param (resume) or from navigation state (fresh flow)
  const sessionId = paramSessionId || state?.sessionId;

  const [disease, setDisease]   = useState(state?.disease || null);
  const [tests, setTests]       = useState([]);
  const [loading, setLoading]   = useState(false);
  const [loadingDb, setLoadingDb] = useState(false);
  const [fetched, setFetched]   = useState(false);

  // No session at all
  if (!sessionId) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <div className="text-5xl mb-4">🧪</div>
        <p className="text-gray-500 mb-4">No session found. Please start from your dashboard.</p>
        <button
          onClick={() => navigate('/patient/dashboard')}
          className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-blue-700"
        >
          Go to My Sessions
        </button>
      </div>
    );
  }

  // Update document title for print
  useEffect(() => {
    if (disease?.disease) {
      document.title = `Blood Tests — ${disease.disease} | MedAssist AI`;
      return () => { document.title = 'MedAssist AI'; };
    }
  }, [disease]);

  // Phase 1: if we have no disease context (resume path), load it from DB
  useEffect(() => {
    if (disease || fetched) return;
    setLoadingDb(true);
    api.get(`/patient/sessions/${sessionId}`)
      .then((res) => {
        const session = res.data.session;

        // Restore selected disease from DB
        if (session?.selected_disease_data) {
          setDisease(session.selected_disease_data);
        } else if (session?.selected_disease) {
          setDisease({ disease: session.selected_disease });
        }

        // If tests are already cached in DB, use them directly
        if (Array.isArray(session?.recommended_tests) && session.recommended_tests.length > 0) {
          setTests(session.recommended_tests);
          setFetched(true);
        }
      })
      .catch(() => toast.error('Failed to load session data.'))
      .finally(() => setLoadingDb(false));
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Phase 2: once we have a disease and no cached tests, call the AI API
  useEffect(() => {
    if (fetched || loading || !disease || loadingDb) return;
    setLoading(true);
    setFetched(true);
    api.post('/disease/tests', { sessionId, disease })
      .then((res) => setTests(res.data.tests || []))
      .catch(() => toast.error('Failed to load blood test recommendations'))
      .finally(() => setLoading(false));
  }, [disease, loadingDb]); // eslint-disable-line react-hooks/exhaustive-deps

  const essential   = tests.filter((t) => t.urgency === 'essential');
  const recommended = tests.filter((t) => t.urgency === 'recommended');
  const optional    = tests.filter((t) => t.urgency === 'optional');

  return (
    <div className="max-w-3xl mx-auto space-y-6 print:space-y-4">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-gray-400 print:hidden">
        <button onClick={() => navigate('/patient/dashboard')} className="hover:text-blue-600 transition-colors">
          My Sessions
        </button>
        <span>›</span>
        <button onClick={() => navigate(`/patient/results/${sessionId}`)} className="hover:text-blue-600 transition-colors">
          Diagnostic Results
        </button>
        <span>›</span>
        <span className="text-gray-600 font-medium">Blood Tests</span>
      </nav>

      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 print:shadow-none">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Recommended Blood Tests</h1>
            {disease && (
              <p className="text-sm text-gray-500 mt-0.5">
                For: <span className="font-medium text-blue-600">{disease.disease}</span>
                {disease.icd_code && (
                  <span className="text-xs text-gray-400 ml-2 font-mono">({disease.icd_code})</span>
                )}
              </p>
            )}
          </div>
          {!loading && tests.length > 0 && (
            <button
              onClick={() => window.print()}
              className="print:hidden px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 flex items-center gap-2"
            >
              🖨 Print / Save PDF
            </button>
          )}
        </div>
        <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-800">
          ⚠️ Educational use only. AI-generated recommendations — always consult a qualified doctor before ordering any tests.
        </div>
      </div>

      {/* Loading states */}
      {(loadingDb || loading) && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <div className="text-center">
            <p className="font-medium text-gray-700">
              {loadingDb ? 'Loading your session…' : 'AI is generating your test recommendations…'}
            </p>
            {disease && !loadingDb && (
              <p className="text-sm text-gray-400 mt-1">Analysing {disease.disease} with your patient profile</p>
            )}
          </div>
        </div>
      )}

      {/* Results */}
      {!loading && !loadingDb && tests.length > 0 && (
        <>
          {/* Summary strip */}
          <div className="grid grid-cols-3 gap-3 print:hidden">
            {[
              { label: 'Essential',    count: essential.length,   color: 'text-red-600 bg-red-50 border-red-100' },
              { label: 'Recommended', count: recommended.length, color: 'text-blue-600 bg-blue-50 border-blue-100' },
              { label: 'Optional',    count: optional.length,    color: 'text-gray-600 bg-gray-50 border-gray-100' },
            ].map(({ label, count, color }) => (
              <div key={label} className={`rounded-xl border p-3 text-center ${color}`}>
                <p className="text-2xl font-bold">{count}</p>
                <p className="text-xs font-medium mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* Test cards */}
          <div className="space-y-4">
            {tests.map((test, i) => (
              <TestCard key={i} test={test} index={i} />
            ))}
          </div>

          {/* Actions */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center justify-between gap-4 print:hidden">
            <div>
              <p className="text-sm font-medium text-gray-700">Next step</p>
              <p className="text-xs text-gray-400">Upload your blood test report for AI analysis</p>
            </div>
            <button
              onClick={() => navigate(`/patient/upload-report/${sessionId}`, {
                state: { sessionId, disease, tests },
              })}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors whitespace-nowrap"
            >
              Upload Report →
            </button>
          </div>
        </>
      )}

      {/* Empty state */}
      {!loading && !loadingDb && fetched && tests.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
          <div className="text-5xl mb-3">😕</div>
          <p className="text-gray-500">No test recommendations returned. Please try again.</p>
          <button
            onClick={() => { setFetched(false); }}
            className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
