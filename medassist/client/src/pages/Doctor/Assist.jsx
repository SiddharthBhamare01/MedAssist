import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import api from '../../services/api';
import AgentStatusPanel from '../../components/AgentStatus/AgentStatusPanel';
import { useAgentStatus } from '../../hooks/useAgentStatus';

const COMMON_TESTS = [
  'CBC (Complete Blood Count)',
  'BMP (Basic Metabolic Panel)',
  'CMP (Comprehensive Metabolic Panel)',
  'Lipid Panel',
  'HbA1c',
  'Fasting Glucose',
  'TSH (Thyroid)',
  'Urinalysis',
  'Liver Function Tests (LFTs)',
  'Coagulation Panel (PT/INR)',
  'Vitamin D',
  'Vitamin B12',
  'Iron Studies',
  'Ferritin',
  'CRP (Inflammation)',
  'ESR',
  'Uric Acid',
  'Creatinine / GFR',
];

const URGENCY_STYLE = {
  critical: { row: 'bg-red-50/80 border-red-200/60',     badge: 'bg-red-500/10 text-red-600 ring-red-500/20' },
  urgent:   { row: 'bg-amber-50/80 border-amber-200/60',  badge: 'bg-amber-500/10 text-amber-600 ring-amber-500/20' },
  routine:  { row: 'bg-emerald-50/80 border-emerald-200/60', badge: 'bg-emerald-500/10 text-emerald-600 ring-emerald-500/20' },
};

function UrgencyBadge({ urgency }) {
  const style = URGENCY_STYLE[urgency] || { badge: 'bg-slate-100 text-slate-500 ring-slate-200' };
  return (
    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ring-1 ring-inset uppercase tracking-wider ${style.badge}`}>
      {urgency}
    </span>
  );
}

const inputClass = 'w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400 transition-all placeholder:text-slate-400';
const labelClass = 'block text-xs font-semibold text-slate-500 mb-1.5';

export default function DoctorAssist() {
  const location = useLocation();
  const navigate = useNavigate();
  const prefilled = location.state?.sessionResult;

  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: {
      age: '', gender: '', weight: '', height: '',
      chiefComplaint: '', symptoms: '', duration: '',
      knownConditions: '', freeTextTests: '',
    },
  });

  const [selectedTests, setSelectedTests] = useState([]);
  const [agentSessionId, setAgentSessionId] = useState(null);
  const [running, setRunning]               = useState(false);
  const [hasRun, setHasRun]                 = useState(!!prefilled);
  const [suggestions, setSuggestions]       = useState(
    prefilled ? (prefilled.patient_summary?.results || []) : []
  );
  const [coveredTests, setCoveredTests]     = useState([]);
  const [essentialTests, setEssentialTests] = useState([]);
  const [diseaseConfirmed, setDiseaseConfirmed] = useState('');
  const [icdCode, setIcdCode]               = useState('');
  const [allCovered, setAllCovered]         = useState(false);
  const [copyDone, setCopyDone]             = useState(false);

  const { steps, status } = useAgentStatus(agentSessionId);

  function toggleTest(test) {
    setSelectedTests(prev =>
      prev.includes(test) ? prev.filter(t => t !== test) : [...prev, test]
    );
  }

  async function onSubmit(data) {
    setRunning(true); setHasRun(false); setSuggestions([]);
    setCoveredTests([]); setEssentialTests([]);
    setDiseaseConfirmed(''); setIcdCode('');
    setAllCovered(false); setAgentSessionId(null);

    const freeText = data.freeTextTests
      ? data.freeTextTests.split(',').map(t => t.trim()).filter(Boolean)
      : [];
    const existingTests = [...selectedTests, ...freeText];

    const patientCase = {
      age: data.age, gender: data.gender, weight: data.weight,
      height: data.height, chiefComplaint: data.chiefComplaint,
      symptoms: data.symptoms, duration: data.duration,
      knownConditions: data.knownConditions,
    };

    try {
      const tempId = `doctor-tmp-${Date.now()}`;
      setAgentSessionId(tempId);

      const { data: result } = await api.post('/doctor-assist/suggest-tests', {
        patientCase, existingTests,
      });

      setSuggestions(result.suggestions || []);
      setCoveredTests(result.coveredTests || []);
      setEssentialTests(result.essentialTests || []);
      setDiseaseConfirmed(result.diseaseConfirmed || '');
      setIcdCode(result.icdCode || '');
      setAllCovered(result.allCovered || false);
      setHasRun(true);
      setAgentSessionId(result.sessionId);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Agent failed. Please try again.');
    } finally {
      setRunning(false);
    }
  }

  function copyToClipboard() {
    if (!suggestions.length) return;
    const text = suggestions.map(s =>
      `[${s.urgency.toUpperCase()}] ${s.test_name}\n  Reason: ${s.reason}${s.reference_range ? `\n  Range: ${s.reference_range}` : ''}`
    ).join('\n\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopyDone(true);
      setTimeout(() => setCopyDone(false), 2000);
    });
  }

  const criticalCount = suggestions.filter(s => s.urgency === 'critical').length;
  const urgentCount   = suggestions.filter(s => s.urgency === 'urgent').length;
  const routineCount  = suggestions.filter(s => s.urgency === 'routine').length;

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-10">
      {/* ── Header ── */}
      <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-slate-900 via-teal-900 to-slate-900">
        <div className="absolute top-0 right-0 w-72 h-72 bg-teal-400/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-emerald-400/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/4" />

        <div className="relative px-6 sm:px-8 py-6 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/10 backdrop-blur-sm rounded-2xl flex items-center justify-center ring-1 ring-white/10">
              <svg className="w-6 h-6 text-teal-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0 1 12 15a9.065 9.065 0 0 0-6.23.693L5 14.5m14.8.8 1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0 1 12 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Missing Test Finder</h1>
              <p className="text-sm text-slate-400 mt-0.5">
                Enter a patient case and existing orders — AI flags clinically indicated missing tests
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate('/doctor/dashboard')}
            className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors font-medium"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
            Dashboard
          </button>
        </div>
      </div>

      {/* ── Form ── */}
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="flex flex-col lg:flex-row gap-6">

          {/* LEFT — Patient Info */}
          <div className="flex-1 space-y-5">
            <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6 space-y-5">
              <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                <div className="w-8 h-8 bg-teal-500/10 rounded-xl flex items-center justify-center">
                  <span className="text-sm font-bold text-teal-600">1</span>
                </div>
                <div>
                  <h2 className="font-bold text-slate-800 text-sm">Patient Information</h2>
                  <p className="text-[11px] text-slate-400">Demographics, symptoms, and medical history</p>
                </div>
              </div>

              {/* Age + Gender + Weight + Height */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <label className={labelClass}>Age *</label>
                  <input type="number" {...register('age', { required: 'Required', min: 1, max: 120 })}
                    placeholder="45" className={inputClass} />
                  {errors.age && <p className="text-red-500 text-[10px] mt-1">{errors.age.message}</p>}
                </div>
                <div>
                  <label className={labelClass}>Gender *</label>
                  <select {...register('gender', { required: 'Required' })}
                    className={`${inputClass} bg-white`}>
                    <option value="">Select</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                  {errors.gender && <p className="text-red-500 text-[10px] mt-1">{errors.gender.message}</p>}
                </div>
                <div>
                  <label className={labelClass}>Weight (kg)</label>
                  <input type="number" {...register('weight')} placeholder="72" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Height (cm)</label>
                  <input type="number" {...register('height')} placeholder="170" className={inputClass} />
                </div>
              </div>

              {/* Chief Complaint */}
              <div>
                <label className={labelClass}>Chief Complaint *</label>
                <input type="text" {...register('chiefComplaint', { required: 'Required' })}
                  placeholder="e.g. Excessive thirst and frequent urination for 3 weeks" className={inputClass} />
                {errors.chiefComplaint && <p className="text-red-500 text-[10px] mt-1">{errors.chiefComplaint.message}</p>}
              </div>

              {/* Symptoms + Duration side by side */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className={labelClass}>Symptoms *</label>
                  <textarea {...register('symptoms', { required: 'Required' })} rows={3}
                    placeholder="e.g. Fatigue, blurred vision, slow wound healing, weight loss"
                    className={`${inputClass} resize-none`} />
                  {errors.symptoms && <p className="text-red-500 text-[10px] mt-1">{errors.symptoms.message}</p>}
                </div>
                <div className="flex flex-col gap-4">
                  <div>
                    <label className={labelClass}>Duration</label>
                    <input type="text" {...register('duration')} placeholder="3 weeks" className={inputClass} />
                  </div>
                </div>
              </div>

              {/* Known Conditions */}
              <div>
                <label className={labelClass}>Known Conditions / History</label>
                <textarea {...register('knownConditions')} rows={2}
                  placeholder="e.g. Hypertension (on lisinopril), family history of type 2 diabetes"
                  className={`${inputClass} resize-none`} />
              </div>
            </div>
          </div>

          {/* RIGHT — Tests + Submit */}
          <div className="w-full lg:w-[380px] space-y-5">
            <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6 space-y-4">
              <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                <div className="w-8 h-8 bg-teal-500/10 rounded-xl flex items-center justify-center">
                  <span className="text-sm font-bold text-teal-600">2</span>
                </div>
                <div>
                  <h2 className="font-bold text-slate-800 text-sm">Tests Already Ordered</h2>
                  <p className="text-[11px] text-slate-400">AI only flags what's missing</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-1 max-h-56 overflow-y-auto pr-1 -mr-1">
                {COMMON_TESTS.map(test => {
                  const checked = selectedTests.includes(test);
                  return (
                    <label key={test}
                      className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors
                        ${checked ? 'bg-teal-50 text-teal-700' : 'hover:bg-slate-50 text-slate-600'}`}
                    >
                      <input type="checkbox" checked={checked} onChange={() => toggleTest(test)}
                        className="rounded text-teal-600 border-slate-300 focus:ring-teal-500 w-3.5 h-3.5" />
                      <span className="text-xs font-medium">{test}</span>
                    </label>
                  );
                })}
              </div>

              <div>
                <label className={labelClass}>Other tests (comma-separated)</label>
                <input type="text" {...register('freeTextTests')}
                  placeholder="e.g. OGTT, Cortisol, Prolactin" className={inputClass} />
              </div>

              {selectedTests.length > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 bg-teal-50 rounded-xl">
                  <svg className="w-4 h-4 text-teal-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                  <p className="text-xs text-teal-700 font-semibold">
                    {selectedTests.length} test{selectedTests.length !== 1 ? 's' : ''} marked as ordered
                  </p>
                </div>
              )}
            </div>

            {/* Submit */}
            <button type="submit" disabled={running}
              className="w-full relative bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-bold py-3.5 rounded-xl
                         hover:from-teal-700 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed
                         transition-all shadow-lg shadow-teal-500/20 hover:shadow-xl hover:shadow-teal-500/30"
            >
              {running ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  AI Agent Running...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                  </svg>
                  Get AI Suggestions
                </span>
              )}
            </button>

            {agentSessionId && (
              <AgentStatusPanel steps={steps.map(s => ({
                type: 'tool_call',
                label: `Called: ${s.tool}`,
                detail: s.args ? Object.values(s.args).join(', ') : '',
              }))} status={running ? 'running' : status} />
            )}
          </div>
        </div>
      </form>

      {/* ── Results ── */}
      {hasRun && (
        <div className="space-y-5">

          {/* Disease banner */}
          {diseaseConfirmed && (
            <div className="bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-200/60 rounded-2xl px-5 py-4 flex flex-wrap items-center gap-3">
              <div className="w-9 h-9 bg-teal-500/10 rounded-xl flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-teal-800 font-bold text-sm">{diseaseConfirmed}</span>
                {icdCode && (
                  <span className="ml-2 bg-teal-100 text-teal-700 text-[10px] font-mono px-2 py-0.5 rounded-md ring-1 ring-teal-200">
                    ICD-10: {icdCode}
                  </span>
                )}
                {essentialTests.length > 0 && (
                  <p className="text-teal-600 text-xs mt-1">
                    Essential: {essentialTests.join(', ')}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* All covered */}
          {allCovered && (
            <div className="bg-gradient-to-br from-emerald-50 to-green-50 border border-emerald-200/60 rounded-2xl p-8 text-center space-y-4">
              <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto ring-1 ring-emerald-200">
                <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-emerald-800">All Required Tests Are Covered</h2>
              <p className="text-emerald-700 text-sm max-w-md mx-auto">
                All essential tests for <strong>{diseaseConfirmed || 'this condition'}</strong> have been ordered. No gaps found.
              </p>
              {coveredTests.length > 0 && (
                <div className="flex flex-wrap justify-center gap-2 pt-2">
                  {coveredTests.map(t => (
                    <span key={t} className="bg-emerald-100 text-emerald-700 text-xs font-semibold px-3 py-1 rounded-full ring-1 ring-emerald-200/60">
                      {t}
                    </span>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-emerald-500 italic pt-2">
                AI assessment for educational purposes only. Clinical judgment always applies.
              </p>
            </div>
          )}

          {/* Missing tests */}
          {!allCovered && suggestions.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
              {/* Results header */}
              <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="text-base font-bold text-slate-800">
                    Missing Tests
                    <span className="ml-2 text-xs font-semibold text-red-500 bg-red-50 px-2.5 py-1 rounded-full ring-1 ring-red-100">
                      {suggestions.length} gap{suggestions.length !== 1 ? 's' : ''}
                    </span>
                  </h2>
                  <div className="flex gap-3 mt-2">
                    {criticalCount > 0 && <span className="text-xs font-semibold text-red-600">● {criticalCount} Critical</span>}
                    {urgentCount > 0 && <span className="text-xs font-semibold text-amber-600">● {urgentCount} Urgent</span>}
                    {routineCount > 0 && <span className="text-xs font-semibold text-emerald-600">● {routineCount} Routine</span>}
                  </div>
                </div>
                <button onClick={copyToClipboard}
                  className="flex items-center gap-2 border border-slate-200 text-slate-600 text-xs font-semibold px-4 py-2 rounded-xl hover:bg-slate-50 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                  </svg>
                  {copyDone ? 'Copied!' : 'Copy'}
                </button>
              </div>

              {/* Covered tests */}
              {coveredTests.length > 0 && (
                <div className="px-6 py-3 bg-emerald-50/50 border-b border-slate-100 flex flex-wrap gap-2 items-center">
                  <span className="text-[11px] text-emerald-700 font-semibold shrink-0">Already ordered:</span>
                  {coveredTests.map(t => (
                    <span key={t} className="text-[10px] bg-emerald-100 text-emerald-700 font-medium px-2 py-0.5 rounded-md ring-1 ring-emerald-200/60">
                      {t}
                    </span>
                  ))}
                </div>
              )}

              {/* Test cards grid */}
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-3">
                {suggestions.map((s, i) => {
                  const style = URGENCY_STYLE[s.urgency] || { row: 'bg-slate-50 border-slate-200', badge: '' };
                  return (
                    <div key={i} className={`rounded-xl border p-4 ${style.row} transition-colors hover:shadow-sm`}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-lg bg-white flex items-center justify-center text-[10px] font-bold text-slate-500 ring-1 ring-slate-200/60 shrink-0">
                            {i + 1}
                          </span>
                          <h3 className="font-bold text-slate-800 text-sm">{s.test_name}</h3>
                        </div>
                        <UrgencyBadge urgency={s.urgency} />
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">{s.reason}</p>
                      {s.reference_range && (
                        <p className="mt-2 text-[10px] text-slate-400 font-mono bg-white/60 rounded-lg px-2 py-1 inline-block ring-1 ring-slate-200/40">
                          Range: {s.reference_range}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50">
                <p className="text-[11px] text-slate-400 italic">
                  AI-generated gap analysis for educational purposes only. Clinical judgment required before ordering tests.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
