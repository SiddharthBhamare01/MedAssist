import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import api from '../../services/api';
import AgentStatusPanel from '../../components/AgentStatus/AgentStatusPanel';
import { useAgentStatus } from '../../hooks/useAgentStatus';

// Common blood tests for quick-select checkboxes
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
  critical: { row: 'bg-red-50 border-red-200',   badge: 'bg-red-100 text-red-700 border-red-300' },
  urgent:   { row: 'bg-orange-50 border-orange-200', badge: 'bg-orange-100 text-orange-700 border-orange-300' },
  routine:  { row: 'bg-green-50 border-green-100',   badge: 'bg-green-100 text-green-700 border-green-200' },
};

function UrgencyBadge({ urgency }) {
  const style = URGENCY_STYLE[urgency] || { badge: 'bg-gray-100 text-gray-600 border-gray-200' };
  return (
    <span className={`text-xs font-bold px-2.5 py-1 rounded-full border uppercase tracking-wide ${style.badge}`}>
      {urgency}
    </span>
  );
}

export default function DoctorAssist() {
  const location = useLocation();
  const prefilled = location.state?.sessionResult;

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm({
    defaultValues: {
      age: '',
      gender: '',
      weight: '',
      height: '',
      chiefComplaint: '',
      symptoms: '',
      duration: '',
      knownConditions: '',
      freeTextTests: '',
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
    setRunning(true);
    setHasRun(false);
    setSuggestions([]);
    setCoveredTests([]);
    setEssentialTests([]);
    setDiseaseConfirmed('');
    setIcdCode('');
    setAllCovered(false);
    setAgentSessionId(null);

    // Combine checkbox tests + free-text tests
    const freeText = data.freeTextTests
      ? data.freeTextTests.split(',').map(t => t.trim()).filter(Boolean)
      : [];
    const existingTests = [...selectedTests, ...freeText];

    const patientCase = {
      age:             data.age,
      gender:          data.gender,
      weight:          data.weight,
      height:          data.height,
      chiefComplaint:  data.chiefComplaint,
      symptoms:        data.symptoms,
      duration:        data.duration,
      knownConditions: data.knownConditions,
    };

    try {
      // Generate a temporary session ID for SSE before the POST resolves
      const tempId = `doctor-tmp-${Date.now()}`;
      setAgentSessionId(tempId);

      const { data: result } = await api.post('/doctor-assist/suggest-tests', {
        patientCase,
        existingTests,
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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-xl font-bold text-gray-900">Doctor Assist — Missing Test Finder</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Enter a patient case and existing orders. The AI will flag clinically indicated tests that are missing.
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6">
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="flex flex-col lg:flex-row gap-6">

            {/* ── LEFT: Patient Info Form ── */}
            <div className="flex-1 space-y-4">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
                <h2 className="font-bold text-gray-800 text-base border-b border-gray-100 pb-2">
                  Patient Information
                </h2>

                {/* Age + Gender */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Age *</label>
                    <input
                      type="number"
                      {...register('age', { required: 'Required', min: 1, max: 120 })}
                      placeholder="e.g. 45"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {errors.age && <p className="text-red-500 text-xs mt-1">{errors.age.message}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Gender *</label>
                    <select
                      {...register('gender', { required: 'Required' })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                    {errors.gender && <p className="text-red-500 text-xs mt-1">{errors.gender.message}</p>}
                  </div>
                </div>

                {/* Weight + Height */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Weight (kg)</label>
                    <input
                      type="number"
                      {...register('weight')}
                      placeholder="e.g. 72"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Height (cm)</label>
                    <input
                      type="number"
                      {...register('height')}
                      placeholder="e.g. 170"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Chief Complaint */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Chief Complaint *</label>
                  <input
                    type="text"
                    {...register('chiefComplaint', { required: 'Required' })}
                    placeholder="e.g. Excessive thirst and frequent urination for 3 weeks"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {errors.chiefComplaint && <p className="text-red-500 text-xs mt-1">{errors.chiefComplaint.message}</p>}
                </div>

                {/* Symptoms */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Symptoms *</label>
                  <textarea
                    {...register('symptoms', { required: 'Required' })}
                    rows={3}
                    placeholder="e.g. Fatigue, blurred vision, slow wound healing, unintentional weight loss"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                  {errors.symptoms && <p className="text-red-500 text-xs mt-1">{errors.symptoms.message}</p>}
                </div>

                {/* Duration */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Duration</label>
                  <input
                    type="text"
                    {...register('duration')}
                    placeholder="e.g. 3 weeks, 2 months"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Known Conditions */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Known Conditions / History</label>
                  <textarea
                    {...register('knownConditions')}
                    rows={2}
                    placeholder="e.g. Hypertension (on lisinopril), family history of type 2 diabetes"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>
              </div>
            </div>

            {/* ── RIGHT: Existing Tests + Submit ── */}
            <div className="w-full lg:w-96 space-y-4">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
                <h2 className="font-bold text-gray-800 text-base border-b border-gray-100 pb-2">
                  Tests Already Ordered
                </h2>
                <p className="text-xs text-gray-500">
                  Check what the patient already has. AI will only suggest what's missing.
                </p>

                {/* Common test checkboxes */}
                <div className="grid grid-cols-1 gap-1.5 max-h-64 overflow-y-auto pr-1">
                  {COMMON_TESTS.map(test => (
                    <label key={test} className="flex items-center gap-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={selectedTests.includes(test)}
                        onChange={() => toggleTest(test)}
                        className="rounded text-blue-600 border-gray-300 focus:ring-blue-500"
                      />
                      <span className="text-xs text-gray-700 group-hover:text-blue-600 transition-colors">
                        {test}
                      </span>
                    </label>
                  ))}
                </div>

                {/* Free-text additional tests */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Other tests (comma-separated)
                  </label>
                  <input
                    type="text"
                    {...register('freeTextTests')}
                    placeholder="e.g. OGTT, Cortisol, Prolactin"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {selectedTests.length > 0 && (
                  <p className="text-xs text-blue-600">
                    {selectedTests.length} test{selectedTests.length !== 1 ? 's' : ''} marked as already ordered
                  </p>
                )}
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={running}
                className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
              >
                {running ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                    AI Agent Running…
                  </span>
                ) : (
                  '🔍 Get AI Suggestions'
                )}
              </button>

              {/* AgentStatusPanel */}
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

        {/* ── Results Section ── */}
        {hasRun && (
          <div className="mt-8 space-y-4">

            {/* Disease confirmation banner */}
            {diseaseConfirmed && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-3 flex flex-wrap items-center gap-3">
                <span className="text-blue-800 font-semibold text-sm">🔬 {diseaseConfirmed}</span>
                {icdCode && (
                  <span className="bg-blue-100 text-blue-700 text-xs font-mono px-2 py-0.5 rounded">
                    ICD-10: {icdCode}
                  </span>
                )}
                {essentialTests.length > 0 && (
                  <span className="text-blue-600 text-xs">
                    Essential tests for this diagnosis: {essentialTests.join(', ')}
                  </span>
                )}
              </div>
            )}

            {/* ALL CLEAR — no missing tests */}
            {allCovered && (
              <div className="bg-green-50 border-2 border-green-300 rounded-2xl p-6 text-center space-y-3">
                <div className="text-5xl">✅</div>
                <h2 className="text-xl font-bold text-green-800">All Required Tests Are Covered</h2>
                <p className="text-green-700 text-sm">
                  The doctor has ordered all essential tests for <strong>{diseaseConfirmed || 'this condition'}</strong>.
                  No missing tests were identified.
                </p>
                {coveredTests.length > 0 && (
                  <div className="mt-3 flex flex-wrap justify-center gap-2">
                    {coveredTests.map(t => (
                      <span key={t} className="bg-green-100 text-green-700 text-xs font-medium px-3 py-1 rounded-full border border-green-200">
                        ✓ {t}
                      </span>
                    ))}
                  </div>
                )}
                <p className="text-xs text-green-600 italic pt-2">
                  AI assessment for educational purposes only. Clinical judgment always applies.
                </p>
              </div>
            )}

            {/* MISSING TESTS TABLE */}
            {!allCovered && suggestions.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
                {/* Header */}
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">
                      Missing Tests — {suggestions.length} Gap{suggestions.length !== 1 ? 's' : ''} Found
                    </h2>
                    <div className="flex gap-3 mt-1">
                      {criticalCount > 0 && (
                        <span className="text-xs font-semibold text-red-600">🔴 {criticalCount} Critical</span>
                      )}
                      {urgentCount > 0 && (
                        <span className="text-xs font-semibold text-orange-500">🟠 {urgentCount} Urgent</span>
                      )}
                      {routineCount > 0 && (
                        <span className="text-xs font-semibold text-green-600">🟢 {routineCount} Routine</span>
                      )}
                      {coveredTests.length > 0 && (
                        <span className="text-xs text-gray-400">· {coveredTests.length} already covered</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={copyToClipboard}
                    className="flex items-center gap-2 border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    {copyDone ? '✅ Copied!' : '📋 Copy to Clipboard'}
                  </button>
                </div>

                {/* Covered tests (collapsed summary) */}
                {coveredTests.length > 0 && (
                  <div className="bg-green-50 border border-green-100 rounded-xl px-4 py-2 flex flex-wrap gap-2 items-center">
                    <span className="text-xs text-green-700 font-medium shrink-0">Already ordered:</span>
                    {coveredTests.map(t => (
                      <span key={t} className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full border border-green-200">
                        ✓ {t}
                      </span>
                    ))}
                  </div>
                )}

                {/* Missing tests table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-separate border-spacing-y-1.5">
                    <thead>
                      <tr>
                        <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-2 w-8">#</th>
                        <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-2">Test Name</th>
                        <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-2">Clinical Reason</th>
                        <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-2">Reference Range</th>
                        <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-2">Urgency</th>
                      </tr>
                    </thead>
                    <tbody>
                      {suggestions.map((s, i) => {
                        const style = URGENCY_STYLE[s.urgency] || { row: 'bg-gray-50 border-gray-200', badge: '' };
                        return (
                          <tr key={i} className={`border ${style.row} rounded-xl`}>
                            <td className="px-4 py-3 text-xs text-gray-400 rounded-l-xl">{i + 1}</td>
                            <td className="px-4 py-3 font-semibold text-gray-900">{s.test_name}</td>
                            <td className="px-4 py-3 text-gray-600 text-xs max-w-xs">{s.reason}</td>
                            <td className="px-4 py-3 text-gray-500 text-xs font-mono">{s.reference_range || '—'}</td>
                            <td className="px-4 py-3 rounded-r-xl">
                              <UrgencyBadge urgency={s.urgency} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <p className="text-xs text-gray-400 italic pt-2 border-t border-gray-100">
                  ⚠️ AI-generated gap analysis for educational purposes only. Clinical judgment required before ordering tests.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
