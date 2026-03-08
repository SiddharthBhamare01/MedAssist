import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../services/api';

const PROBABILITY_COLOR = (p) => {
  if (p >= 75) return { bar: 'bg-red-500', badge: 'bg-red-100 text-red-700', label: 'High' };
  if (p >= 50) return { bar: 'bg-orange-400', badge: 'bg-orange-100 text-orange-700', label: 'Moderate' };
  return { bar: 'bg-yellow-400', badge: 'bg-yellow-100 text-yellow-700', label: 'Low' };
};

export default function Results() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const { sessionId, diseases = [], turns } = state || {};

  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);

  // No data — came here directly without submitting
  if (!sessionId || diseases.length === 0) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <div className="text-5xl mb-4">🔍</div>
        <p className="text-gray-500 mb-4">No diagnosis results found.</p>
        <button
          onClick={() => navigate('/patient/intake')}
          className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-blue-700"
        >
          Start Symptom Intake
        </button>
      </div>
    );
  }

  const handleGetTests = async () => {
    if (!selected) {
      toast.error('Please select a disease first');
      return;
    }
    setLoading(true);
    try {
      navigate('/patient/tests', { state: { sessionId, disease: selected } });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-gray-400">
        <button onClick={() => navigate('/patient/intake')} className="hover:text-blue-600 transition-colors">
          Symptom Intake
        </button>
        <span>›</span>
        <span className="text-gray-600 font-medium">Diagnostic Results</span>
      </nav>

      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Diagnostic Results</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              AI analysed your symptoms in{' '}
              <span className="font-medium text-blue-600">{turns} reasoning turn{turns !== 1 ? 's' : ''}</span>
              {' '}using ICD-10 clinical database
            </p>
          </div>
          <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
            ✓ {diseases.length} diseases found
          </span>
        </div>

        <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-800">
          ⚠️ Educational use only. These are AI predictions — not a medical diagnosis. Always consult a qualified doctor.
        </div>
      </div>

      {/* Instruction */}
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

              {/* Description */}
              {disease.description && (
                <p className="text-sm text-gray-600 mb-3">{disease.description}</p>
              )}

              {/* Matched symptoms */}
              {disease.matched_symptoms?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {disease.matched_symptoms.map((s) => (
                    <span key={s} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs">
                      {s}
                    </span>
                  ))}
                </div>
              )}

              {/* Reasoning */}
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
          disabled={!selected || loading}
          className="bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed
            text-white font-semibold px-6 py-2.5 rounded-lg transition-colors whitespace-nowrap"
        >
          Get Blood Tests →
        </button>
      </div>
    </div>
  );
}
