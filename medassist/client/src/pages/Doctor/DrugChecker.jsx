import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../services/api';

const fadeIn = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

const SEVERITY_STYLE = {
  major:    'bg-red-50 border-red-200 text-red-800',
  moderate: 'bg-amber-50 border-amber-200 text-amber-800',
  minor:    'bg-yellow-50 border-yellow-200 text-yellow-800',
  none:     'bg-green-50 border-green-200 text-green-700',
};

const SEVERITY_BADGE = {
  major:    'bg-red-100 text-red-700',
  moderate: 'bg-amber-100 text-amber-700',
  minor:    'bg-yellow-100 text-yellow-700',
  none:     'bg-green-100 text-green-700',
};

export default function DrugChecker() {
  const [drugs, setDrugs] = useState(['', '']);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  const updateDrug = (index, value) => {
    const updated = [...drugs];
    updated[index] = value;
    setDrugs(updated);
  };

  const addDrug = () => {
    if (drugs.length >= 10) { toast.error('Maximum 10 drugs'); return; }
    setDrugs([...drugs, '']);
  };

  const removeDrug = (index) => {
    if (drugs.length <= 2) { toast.error('At least 2 drugs required'); return; }
    setDrugs(drugs.filter((_, i) => i !== index));
  };

  const checkInteractions = async () => {
    const filtered = drugs.filter((d) => d.trim());
    if (filtered.length < 2) {
      toast.error('Enter at least 2 drug names');
      return;
    }
    setLoading(true);
    setResults(null);
    try {
      const { data } = await api.get(`/doctor-assist/drug-interactions?drugs=${encodeURIComponent(filtered.join(','))}`);
      setResults(data);
      const realInteractions = (data.interactions || []).filter(
        (i) => i.severity?.toLowerCase() !== 'none'
      );
      if (realInteractions.length === 0) {
        toast.success('No significant interactions found');
      } else {
        toast(`${realInteractions.length} interaction(s) found`, { icon: '⚠️' });
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to check interactions');
    } finally {
      setLoading(false);
    }
  };

  const realInteractions = (results?.interactions || []).filter(
    (i) => i.severity?.toLowerCase() !== 'none'
  );
  const safeInteractions = (results?.interactions || []).filter(
    (i) => i.severity?.toLowerCase() === 'none'
  );

  return (
    <motion.div variants={fadeIn} initial="hidden" animate="visible" className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Drug Interaction Checker</h1>
        <p className="text-sm text-slate-500 mt-1">
          AI-powered multi-model analysis of potential drug-drug interactions
        </p>
      </div>

      {/* Input Form */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Enter Drug Names</h2>

        <div className="space-y-3">
          <AnimatePresence>
            {drugs.map((drug, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-3"
              >
                <span className="text-xs text-slate-400 font-mono w-6 text-center shrink-0">{i + 1}</span>
                <input
                  type="text"
                  value={drug}
                  onChange={(e) => updateDrug(i, e.target.value)}
                  placeholder={`Drug ${i + 1} name`}
                  className="flex-1 border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
                <button
                  onClick={() => removeDrug(i)}
                  disabled={drugs.length <= 2}
                  className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-30 disabled:hover:text-slate-400 disabled:hover:bg-transparent transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={addDrug}
            className="flex items-center gap-1.5 px-4 py-2 border border-dashed border-slate-300 text-slate-600 text-sm font-medium rounded-xl hover:border-teal-400 hover:text-teal-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Drug
          </button>
          <button
            onClick={checkInteractions}
            disabled={loading}
            className="flex-1 bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl transition-colors"
          >
            {loading ? 'Analyzing...' : 'Check Interactions'}
          </button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500">Analyzing with multiple AI models...</p>
          <p className="text-xs text-slate-400">Each model independently evaluates interactions, then a consensus judge merges results</p>
        </div>
      )}

      {/* Results */}
      {results && !loading && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* Agent count badge */}
          {results.agentCount && (
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-teal-50 text-teal-700 rounded-full text-xs font-semibold border border-teal-200">
                {results.agentCount} AI model{results.agentCount > 1 ? 's' : ''} consulted
              </span>
              <h2 className="text-lg font-semibold text-slate-800">
                Interaction Results
              </h2>
            </div>
          )}

          {/* Summary */}
          {results.summary && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
              <p className="text-sm text-slate-700 leading-relaxed">{results.summary}</p>
            </div>
          )}

          {/* Interactions with severity */}
          {realInteractions.length === 0 && (
            <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="font-semibold text-green-800">No Significant Interactions</p>
              <p className="text-sm text-green-600 mt-1">These drugs appear safe to use together based on AI consensus analysis.</p>
            </div>
          )}

          {realInteractions.map((interaction, i) => {
            const severity = interaction.severity?.toLowerCase() || 'moderate';
            const style = SEVERITY_STYLE[severity] || SEVERITY_STYLE.moderate;
            const badge = SEVERITY_BADGE[severity] || SEVERITY_BADGE.moderate;
            const drugPair = Array.isArray(interaction.drugs)
              ? interaction.drugs.join(' + ')
              : `${interaction.drug1 || '?'} + ${interaction.drug2 || '?'}`;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                className={`rounded-2xl border p-5 ${style}`}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h3 className="font-bold text-sm">{drugPair}</h3>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide shrink-0 ${badge}`}>
                    {severity}
                  </span>
                </div>
                {interaction.mechanism && (
                  <p className="text-xs font-medium opacity-70 mb-1">
                    Mechanism: {interaction.mechanism}
                  </p>
                )}
                <p className="text-sm leading-relaxed">{interaction.description}</p>
                {interaction.recommendation && (
                  <div className="mt-3 pt-2 border-t border-current/10">
                    <p className="text-xs font-semibold opacity-80">
                      Recommendation: {interaction.recommendation}
                    </p>
                  </div>
                )}
              </motion.div>
            );
          })}

          {/* Safe combinations */}
          {(results.safe_combinations?.length > 0 || safeInteractions.length > 0) && (
            <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
              <h3 className="text-sm font-semibold text-green-800 mb-2">Safe Combinations</h3>
              <div className="flex flex-wrap gap-2">
                {(results.safe_combinations || []).map((combo, i) => (
                  <span key={`sc-${i}`} className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                    {combo}
                  </span>
                ))}
                {safeInteractions.map((si, i) => (
                  <span key={`si-${i}`} className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                    {Array.isArray(si.drugs) ? si.drugs.join(' + ') : 'Safe pair'}
                  </span>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-slate-400 bg-slate-50 rounded-xl p-3 border border-slate-100">
            This analysis was generated by {results.agentCount || 'multiple'} independent AI models with consensus merging.
            Always verify drug interactions with authoritative sources (e.g., Lexicomp, Micromedex) before making clinical decisions.
          </p>
        </motion.div>
      )}
    </motion.div>
  );
}
