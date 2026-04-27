import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../services/api';

const fadeIn  = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } };
const cardAnim = { hidden: { opacity: 0, y: 12 }, visible: (i) => ({ opacity: 1, y: 0, transition: { delay: i * 0.05, duration: 0.3 } }) };

function groupByName(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = row.medication_name.toLowerCase();
    if (!map.has(key)) {
      map.set(key, { ...row, doseCount: 1, allIds: [row.id] });
    } else {
      const existing = map.get(key);
      existing.doseCount += 1;
      existing.allIds.push(row.id);
    }
  }
  return Array.from(map.values());
}

function formatDate(d) {
  if (!d) return 'Never';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function SourceBadge({ med, sources }) {
  const name = med.medication_name.toLowerCase();
  if (med.report_id) {
    return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100">Blood Report</span>;
  }
  const inRx = sources.fromPrescriptions.some(s => s.drug_name.toLowerCase() === name);
  if (inRx) {
    return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-100">Prescription</span>;
  }
  return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">Manual</span>;
}

export default function Medications() {
  const [medications,    setMedications]    = useState([]);
  const [sources,        setSources]        = useState({ fromPrescriptions: [], fromBloodReports: [] });
  const [loading,        setLoading]        = useState(true);
  const [showAddModal,   setShowAddModal]   = useState(false);
  const [addForm,        setAddForm]        = useState({ name: '', dose: '', frequency: '' });
  const [adding,         setAdding]         = useState(false);
  const [actionId,       setActionId]       = useState(null);
  const [showInactive,   setShowInactive]   = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const [medsRes, sourcesRes] = await Promise.allSettled([
        api.get('/patient/medications'),
        api.get('/patient/medications/sources'),
      ]);
      if (medsRes.status === 'fulfilled') {
        setMedications(groupByName(medsRes.value.data.medications || []));
      }
      if (sourcesRes.status === 'fulfilled') {
        setSources(sourcesRes.value.data);
      }
    } catch {
      toast.error('Failed to load medications');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const logDose = async (med) => {
    setActionId(`log-${med.id}`);
    try {
      await api.post('/patient/medications', {
        medication_name: med.medication_name,
        dose: med.dose,
        report_id: med.report_id || null,
      });
      toast.success(`Dose logged for ${med.medication_name}`);
      loadAll();
    } catch (err) {
      toast.error(err.message || 'Failed to log dose');
    } finally {
      setActionId(null);
    }
  };

  const toggleActive = async (med) => {
    setActionId(`toggle-${med.id}`);
    try {
      await api.put(`/patient/medications/${med.id}/toggle`);
      toast.success(`${med.medication_name} ${med.active ? 'deactivated' : 'activated'}`);
      loadAll();
    } catch (err) {
      toast.error(err.message || 'Failed to toggle');
    } finally {
      setActionId(null);
    }
  };

  const deleteMed = async (med) => {
    if (!window.confirm(`Remove ${med.medication_name} from your medications?`)) return;
    setActionId(`del-${med.id}`);
    try {
      await api.delete(`/patient/medications/${med.id}`);
      toast.success(`${med.medication_name} removed`);
      loadAll();
    } catch (err) {
      toast.error(err.message || 'Failed to delete');
    } finally {
      setActionId(null);
    }
  };

  const trackMed = async (suggestion) => {
    setActionId(`track-${suggestion.drug_name}`);
    try {
      await api.post('/patient/medications', {
        medication_name: suggestion.drug_name,
        dose: suggestion.dosage || '',
        report_id: suggestion.reportId || null,
      });
      toast.success(`${suggestion.drug_name} added to your medications`);
      loadAll();
    } catch (err) {
      toast.error(err.message || 'Failed to track medication');
    } finally {
      setActionId(null);
    }
  };

  const submitAdd = async (e) => {
    e.preventDefault();
    if (!addForm.name.trim()) { toast.error('Medication name is required'); return; }
    setAdding(true);
    try {
      const dose = [addForm.dose, addForm.frequency].filter(Boolean).join(' · ');
      await api.post('/patient/medications', {
        medication_name: addForm.name.trim(),
        dose: dose || '',
      });
      toast.success(`${addForm.name.trim()} added`);
      setAddForm({ name: '', dose: '', frequency: '' });
      setShowAddModal(false);
      loadAll();
    } catch (err) {
      toast.error(err.message || 'Failed to add medication');
    } finally {
      setAdding(false);
    }
  };

  const active   = medications.filter(m => m.active);
  const inactive = medications.filter(m => !m.active);
  const hasSources = sources.fromPrescriptions.length > 0 || sources.fromBloodReports.length > 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <motion.div variants={fadeIn} initial="hidden" animate="visible" className="max-w-4xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">My Medications</h1>
          <p className="text-sm text-slate-500 mt-1">Track and manage your active prescriptions</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Medication
        </button>
      </div>

      {/* Empty State */}
      {medications.length === 0 && !hasSources && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow p-12 text-center">
          <div className="w-16 h-16 bg-teal-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>
          <p className="text-slate-600 font-medium">No medications yet</p>
          <p className="text-xs text-slate-400 mt-1">Click "Add Medication" to start tracking, or get a prescription from your doctor.</p>
        </div>
      )}

      {/* Active Medications */}
      {active.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
            Active Medications ({active.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <AnimatePresence>
              {active.map((med, i) => (
                <MedCard
                  key={med.id}
                  med={med}
                  index={i}
                  sources={sources}
                  actionId={actionId}
                  onLog={logDose}
                  onToggle={toggleActive}
                  onDelete={deleteMed}
                />
              ))}
            </AnimatePresence>
          </div>
        </section>
      )}

      {/* Inactive Medications */}
      {inactive.length > 0 && (
        <section>
          <button
            className="flex items-center gap-2 text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3 hover:text-slate-700 transition-colors"
            onClick={() => setShowInactive(v => !v)}
          >
            <svg className={`w-4 h-4 transition-transform ${showInactive ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Inactive Medications ({inactive.length})
          </button>
          <AnimatePresence>
            {showInactive && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
              >
                {inactive.map((med, i) => (
                  <MedCard
                    key={med.id}
                    med={med}
                    index={i}
                    sources={sources}
                    actionId={actionId}
                    onLog={logDose}
                    onToggle={toggleActive}
                    onDelete={deleteMed}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      )}

      {/* Available to Track */}
      {hasSources && (
        <section>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Available to Track</h2>
          <div className="bg-white rounded-2xl border border-slate-200 shadow divide-y divide-slate-100">

            {sources.fromPrescriptions.length > 0 && (
              <div className="p-5">
                <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-3">From Prescriptions</p>
                <div className="space-y-3">
                  {sources.fromPrescriptions.map((s) => (
                    <div key={`rx-${s.drug_name}`} className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-slate-800 truncate">{s.drug_name}</p>
                        <p className="text-xs text-slate-400 truncate">
                          {[s.dosage, s.frequency, s.duration].filter(Boolean).join(' · ') || 'No dosage info'}
                          {s.doctorName ? ` — Dr. ${s.doctorName}` : ''}
                        </p>
                      </div>
                      <button
                        onClick={() => trackMed(s)}
                        disabled={actionId === `track-${s.drug_name}`}
                        className="shrink-0 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
                      >
                        {actionId === `track-${s.drug_name}` ? '...' : 'Track'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {sources.fromBloodReports.length > 0 && (
              <div className="p-5">
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-3">From Blood Reports</p>
                <div className="space-y-3">
                  {sources.fromBloodReports.map((s) => (
                    <div key={`br-${s.drug_name}`} className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-slate-800 truncate">{s.drug_name}</p>
                        <p className="text-xs text-slate-400 truncate">
                          {[s.dosage, s.frequency, s.duration].filter(Boolean).join(' · ') || 'No dosage info'}
                        </p>
                      </div>
                      <button
                        onClick={() => trackMed(s)}
                        disabled={actionId === `track-${s.drug_name}`}
                        className="shrink-0 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
                      >
                        {actionId === `track-${s.drug_name}` ? '...' : 'Track'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Add Medication Modal */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={(e) => e.target === e.currentTarget && setShowAddModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md border border-slate-100"
            >
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold text-slate-800">Add Medication</h2>
                <button onClick={() => setShowAddModal(false)} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                  <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <form onSubmit={submitAdd} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Medication Name <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={addForm.name}
                    onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g., Metformin"
                    className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Dose</label>
                  <input
                    type="text"
                    value={addForm.dose}
                    onChange={e => setAddForm(f => ({ ...f, dose: e.target.value }))}
                    placeholder="e.g., 500mg"
                    className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Frequency</label>
                  <input
                    type="text"
                    value={addForm.frequency}
                    onChange={e => setAddForm(f => ({ ...f, frequency: e.target.value }))}
                    placeholder="e.g., twice daily"
                    className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 border border-slate-200 text-slate-600 text-sm font-semibold py-2.5 rounded-xl hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={adding}
                    className="flex-1 bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
                  >
                    {adding ? 'Adding...' : 'Add Medication'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function MedCard({ med, index, sources, actionId, onLog, onToggle, onDelete }) {
  return (
    <motion.div
      key={med.id}
      custom={index}
      variants={cardAnim}
      initial="hidden"
      animate="visible"
      className={`bg-white rounded-2xl border shadow-sm p-5 transition-all ${
        med.active ? 'border-slate-100' : 'border-slate-200 opacity-60'
      }`}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-slate-800 truncate">{med.medication_name}</h3>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <SourceBadge med={med} sources={sources} />
            {med.doseCount > 1 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-100">
                {med.doseCount} doses logged
              </span>
            )}
          </div>
        </div>
        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 ${
          med.active ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'
        }`}>
          {med.active ? 'Active' : 'Inactive'}
        </span>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 gap-2 text-sm mb-3">
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Dose</p>
          <p className="text-slate-700 font-medium mt-0.5 truncate">{med.dose || '--'}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Last Taken</p>
          <p className="text-slate-700 font-medium mt-0.5 text-xs">{formatDate(med.taken_at)}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-3 border-t border-slate-50">
        <button
          onClick={() => onLog(med)}
          disabled={actionId === `log-${med.id}` || !med.active}
          className="flex-1 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-xl transition-colors"
        >
          {actionId === `log-${med.id}` ? 'Logging...' : 'Log Dose'}
        </button>
        <button
          onClick={() => onToggle(med)}
          disabled={actionId === `toggle-${med.id}`}
          className="px-3 py-2 border border-slate-200 text-slate-600 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors"
        >
          {actionId === `toggle-${med.id}` ? '...' : med.active ? 'Deactivate' : 'Activate'}
        </button>
        <button
          onClick={() => onDelete(med)}
          disabled={actionId === `del-${med.id}`}
          className="px-3 py-2 border border-red-100 text-red-500 text-sm rounded-xl hover:bg-red-50 transition-colors"
          title="Remove medication"
        >
          {actionId === `del-${med.id}` ? '...' : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          )}
        </button>
      </div>
    </motion.div>
  );
}
