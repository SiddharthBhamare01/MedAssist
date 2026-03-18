import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../services/api';

const PROBABILITY_COLOR = (p) => {
  if (p >= 75) return { bar: 'bg-red-500', badge: 'bg-red-100 text-red-700', label: 'High' };
  if (p >= 50) return { bar: 'bg-orange-400', badge: 'bg-orange-100 text-orange-700', label: 'Moderate' };
  return { bar: 'bg-yellow-400', badge: 'bg-yellow-100 text-yellow-700', label: 'Low' };
};

export default function Results() {
  const { state } = useLocation();
  const { sessionId: paramSessionId } = useParams();
  const navigate = useNavigate();

  // sessionId comes either from URL param (resume) or from navigation state (fresh flow)
  const sessionId = paramSessionId || state?.sessionId;

  const [diseases, setDiseases]         = useState(state?.diseases || []);
  const [turns, setTurns]               = useState(state?.turns || null);
  const [selected, setSelected]         = useState(null);
  const [loadingDb, setLoadingDb]       = useState(false);
  const [saving, setSaving]             = useState(false);
  const [agentRunning, setAgentRunning] = useState(false);
  const [staleSession, setStaleSession] = useState(false); // pending but agent no longer running
  const [retrying, setRetrying]         = useState(false);

  // useRef so pollCount survives React StrictMode double-invocation
  const pollCountRef = useRef(0);

  // If we don't have diseases in state (resume path), fetch from DB.
  // For pending sessions, poll up to 4 times (16s). After that, mark as stale.
  useEffect(() => {
    if (diseases.length > 0 || !sessionId) return;

    let pollTimer = null;
    pollCountRef.current = 0;
    const MAX_POLLS = 4;

    const fetchSession = async (isRetry = false) => {
      if (!isRetry) setLoadingDb(true);
      try {
        const res = await api.get(`/patient/sessions/${sessionId}`);
        const session = res.data.session;
        const dbDiseases = session?.predicted_diseases;

        if (Array.isArray(dbDiseases) && dbDiseases.length > 0) {
          setDiseases(dbDiseases);
          setAgentRunning(false);
          setLoadingDb(false);
        } else if (session?.status === 'pending') {
          setAgentRunning(true);
          setLoadingDb(false);
          pollCountRef.current += 1;
          if (pollCountRef.current < MAX_POLLS) {
            pollTimer = setTimeout(() => fetchSession(true), 4000);
          } else {
            // Agent isn't coming back — server likely restarted mid-run
            setAgentRunning(false);
            setStaleSession(true);
          }
        } else {
          setLoadingDb(false);
          setAgentRunning(false);
          toast.error('No diagnosis data found for this session.');
        }
      } catch {
        setLoadingDb(false);
        toast.error('Failed to load session data.');
      }
    };

    fetchSession();
    return () => { if (pollTimer) clearTimeout(pollTimer); };
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRetryDiagnosis = async () => {
    setRetrying(true);
    setStaleSession(false);
    setAgentRunning(true);
    try {
      const res = await api.post(`/disease/predict/retry/${sessionId}`);
      setDiseases(res.data.diseases || []);
      setTurns(res.data.turns || null);
      setAgentRunning(false);
      toast.success('Diagnosis complete!');
    } catch (err) {
      const msg = err.response?.data?.error || 'Retry failed. Please try again.';
      toast.error(msg);
      setAgentRunning(false);
      setStaleSession(true);
    } finally {
      setRetrying(false);
    }
  };

  // No session at all — came here directly
  if (!sessionId) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <div className="text-5xl mb-4">🔍</div>
        <p className="text-gray-500 mb-4">No diagnosis session found.</p>
        <button
          onClick={() => navigate('/patient/dashboard')}
          className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-blue-700"
        >
          Go to My Sessions
        </button>
      </div>
    );
  }

  const handleGetTests = async () => {
    if (!selected) {
      toast.error('Please select a disease first');
      return;
    }
    setSaving(true);
    try {
      // Persist selected disease to DB so resume from Tests page works
      await api.put(`/patient/sessions/${sessionId}/disease`, { disease: selected });
      navigate(`/patient/tests/${sessionId}`, { state: { sessionId, disease: selected } });
    } catch {
      toast.error('Failed to save selection. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loadingDb) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-500">Loading your diagnosis results…</p>
      </div>
    );
  }

  // Agent still running — show live waiting state (auto-refreshes every 4s)
  if (agentRunning && diseases.length === 0) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <div className="relative w-16 h-16 mx-auto mb-6">
          <div className="w-16 h-16 border-4 border-blue-200 rounded-full" />
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin absolute inset-0" />
          <div className="absolute inset-0 flex items-center justify-center text-2xl">🧬</div>
        </div>
        <h2 className="text-lg font-bold text-gray-800 mb-2">Diagnosing your symptoms…</h2>
        <p className="text-sm text-gray-500 mb-1">
          Multiple AI agents are cross-verifying your diagnosis with ICD-10 lookups.
        </p>
        <p className="text-xs text-gray-400 mb-6">This usually takes 30–60 seconds. This page refreshes automatically.</p>
        <div className="flex justify-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
        <button
          onClick={() => navigate('/patient/dashboard')}
          className="mt-8 text-sm text-gray-400 hover:text-blue-600 underline transition-colors"
        >
          ← Back to sessions (results will be saved automatically)
        </button>
      </div>
    );
  }

  // Stale session — agent was interrupted (server restart). Offer re-run.
  if (staleSession) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <div className="text-5xl mb-4">⚠️</div>
        <h2 className="text-lg font-bold text-gray-800 mb-2">Diagnosis was interrupted</h2>
        <p className="text-sm text-gray-500 mb-6">
          The AI agent stopped mid-way (the server may have restarted).
          Your symptoms are saved — click below to re-run the diagnosis.
        </p>
        <button
          onClick={handleRetryDiagnosis}
          disabled={retrying}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold
                     px-6 py-3 rounded-lg transition-colors"
        >
          {retrying ? 'Re-running diagnosis…' : '🔄 Re-run Diagnosis'}
        </button>
        <div className="mt-4">
          <button
            onClick={() => navigate('/patient/dashboard')}
            className="text-sm text-gray-400 hover:text-blue-600 underline transition-colors"
          >
            ← Back to sessions
          </button>
        </div>
      </div>
    );
  }

  if (!loadingDb && !agentRunning && diseases.length === 0) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <div className="text-5xl mb-4">🔍</div>
        <p className="text-gray-500 mb-4">No diagnosis results found for this session.</p>
        <button
          onClick={() => navigate('/patient/dashboard')}
          className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-blue-700"
        >
          Back to My Sessions
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-gray-400">
        <button onClick={() => navigate('/patient/dashboard')} className="hover:text-blue-600 transition-colors">
          My Sessions
        </button>
        <span>›</span>
        <span className="text-gray-600 font-medium">Diagnostic Results</span>
      </nav>

      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Diagnostic Results</h1>
            {turns && (
              <p className="text-sm text-gray-500 mt-0.5">
                AI analysed your symptoms in{' '}
                <span className="font-medium text-blue-600">{turns} reasoning turn{turns !== 1 ? 's' : ''}</span>
                {' '}using ICD-10 clinical database
              </p>
            )}
          </div>
          <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
            ✓ {diseases.length} diseases found
          </span>
        </div>
        <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-800">
          ⚠️ Educational use only. These are AI predictions — not a medical diagnosis. Always consult a qualified doctor.
        </div>
      </div>

      <p className="text-sm text-gray-500 px-1">
        Select the disease that best matches your condition, then get personalised blood test recommendations.
      </p>

      {/* Disease Cards */}
      <div className="space-y-4">
        {diseases.map((disease, index) => {
          const color = PROBABILITY_COLOR(disease.probability);
          const isSelected = selected?.icd_code === disease.icd_code;

          return (
            <button
              key={disease.icd_code || index}
              type="button"
              onClick={() => setSelected(disease)}
              className={`w-full text-left bg-white rounded-2xl border-2 shadow-sm p-5 transition-all
                ${isSelected
                  ? 'border-blue-600 shadow-blue-100 shadow-md'
                  : 'border-gray-100 hover:border-blue-300'}`}
            >
              {/* Card header */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0
                    ${isSelected ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="font-bold text-gray-800 text-base leading-tight">{disease.disease}</h3>
                    <span className="text-xs text-gray-400 font-mono">ICD-10: {disease.icd_code}</span>
                    {disease.icd_description && (
                      <span className="text-xs text-gray-400 ml-2">— {disease.icd_description}</span>
                    )}
                  </div>
                </div>
                <span className={`px-2 py-1 rounded-full text-xs font-semibold shrink-0 ${color.badge}`}>
                  {color.label}
                </span>
              </div>

              {/* Probability bar */}
              <div className="mb-3">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Likelihood</span>
                  <span className="font-semibold">{disease.probability}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-2 rounded-full transition-all duration-500 ${color.bar}`}
                    style={{ width: `${disease.probability}%` }}
                  />
                </div>
              </div>

              {disease.description && (
                <p className="text-sm text-gray-600 mb-3">{disease.description}</p>
              )}

              {disease.matched_symptoms?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {disease.matched_symptoms.map((s) => (
                    <span key={s} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs">
                      {s}
                    </span>
                  ))}
                </div>
              )}

              {disease.reasoning && (
                <p className="text-xs text-gray-400 italic border-t border-gray-50 pt-2">
                  {disease.reasoning}
                </p>
              )}

              {isSelected && (
                <div className="mt-3 pt-3 border-t border-blue-100 text-xs text-blue-600 font-medium">
                  ✓ Selected — click "Get Blood Tests" below
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Action */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center justify-between gap-4">
        <div>
          {selected ? (
            <p className="text-sm font-medium text-gray-700">
              Selected: <span className="text-blue-600">{selected.disease}</span>
            </p>
          ) : (
            <p className="text-sm text-gray-400">Select a disease above to continue</p>
          )}
        </div>
        <button
          onClick={handleGetTests}
          disabled={!selected || saving}
          aria-busy={saving}
          className="bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed
            text-white font-semibold px-6 py-2.5 rounded-lg transition-colors whitespace-nowrap"
        >
          {saving ? 'Saving…' : 'Get Blood Tests →'}
        </button>
      </div>
    </div>
  );
}
