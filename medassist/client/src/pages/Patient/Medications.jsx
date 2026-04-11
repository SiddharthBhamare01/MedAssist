import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../services/api';

const fadeIn = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } };
const cardAnim = { hidden: { opacity: 0, y: 12 }, visible: (i) => ({ opacity: 1, y: 0, transition: { delay: i * 0.05, duration: 0.3 } }) };

export default function Medications() {
  const [medications, setMedications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loggingId, setLoggingId] = useState(null);
  const [togglingId, setTogglingId] = useState(null);

  const fetchMedications = async () => {
    try {
      const { data } = await api.get('/patient/medications');
      setMedications(data.medications || []);
    } catch {
      toast.error('Failed to load medications');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchMedications(); }, []);

  const logDose = async (med) => {
    setLoggingId(med.id);
    try {
      await api.post('/patient/medications', {
        medication_name: med.medication_name,
        dose: med.dose,
        report_id: med.report_id || null,
      });
      toast.success(`Dose logged for ${med.medication_name}`);
      fetchMedications();
    } catch (err) {
      toast.error(err.message || 'Failed to log dose');
    } finally {
      setLoggingId(null);
    }
  };

  const toggleActive = async (med) => {
    setTogglingId(med.id);
    try {
      await api.put(`/patient/medications/${med.id}/toggle`);
      toast.success(`${med.medication_name} ${med.active ? 'deactivated' : 'activated'}`);
      fetchMedications();
    } catch (err) {
      toast.error(err.message || 'Failed to toggle');
    } finally {
      setTogglingId(null);
    }
  };

  const formatDate = (d) =>
    d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <motion.div variants={fadeIn} initial="hidden" animate="visible" className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">My Medications</h1>
        <p className="text-sm text-slate-500 mt-1">Track and manage your active prescriptions</p>
      </div>

      {medications.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-12 text-center">
          <div className="w-16 h-16 bg-teal-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>
          <p className="text-slate-500">No medications found.</p>
          <p className="text-xs text-slate-400 mt-1">Medications from your analysis reports will appear here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AnimatePresence>
            {medications.map((med, i) => (
              <motion.div
                key={med.id}
                custom={i}
                variants={cardAnim}
                initial="hidden"
                animate="visible"
                className={`bg-white rounded-2xl border shadow-sm p-5 transition-all ${
                  med.active ? 'border-slate-100' : 'border-slate-200 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-slate-800 truncate">{med.medication_name}</h3>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 ${
                      med.active ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {med.active ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                  <div>
                    <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Dose</p>
                    <p className="text-slate-700 font-medium mt-0.5">{med.dose || '--'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Last Taken</p>
                    <p className="text-slate-700 font-medium mt-0.5">{formatDate(med.taken_at)}</p>
                  </div>
                </div>

                <div className="flex gap-2 pt-3 border-t border-slate-50">
                  <button
                    onClick={() => logDose(med)}
                    disabled={loggingId === med.id || !med.active}
                    className="flex-1 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-xl transition-colors"
                  >
                    {loggingId === med.id ? 'Logging...' : 'Log Dose'}
                  </button>
                  <button
                    onClick={() => toggleActive(med)}
                    disabled={togglingId === med.id}
                    className="px-4 py-2 border border-slate-200 text-slate-600 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors"
                  >
                    {togglingId === med.id ? '...' : med.active ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}
