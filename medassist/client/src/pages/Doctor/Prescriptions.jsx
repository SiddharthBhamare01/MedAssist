import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../services/api';

const fadeIn = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

const EMPTY_MED = { drug_name: '', dosage: '', frequency: '', duration: '' };

export default function Prescriptions() {
  const [prescriptions, setPrescriptions] = useState([]);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form: multiple medications + patient + notes
  const [selectedPatient, setSelectedPatient] = useState('');
  const [medications, setMedications] = useState([{ ...EMPTY_MED }]);
  const [notes, setNotes] = useState('');

  const fetchPrescriptions = async () => {
    try {
      const { data } = await api.get('/doctor-assist/prescriptions');
      setPrescriptions(data.prescriptions || []);
    } catch {
      toast.error('Failed to load prescriptions');
    } finally {
      setLoading(false);
    }
  };

  const fetchPatients = async () => {
    try {
      const { data } = await api.get('/doctor-assist/patients');
      setPatients(data.patients || []);
    } catch {
      // silent — dropdown will be empty, doctor can still prescribe without linking
    }
  };

  useEffect(() => { fetchPrescriptions(); fetchPatients(); }, []);

  const updateMed = (index, field, value) => {
    const updated = [...medications];
    updated[index] = { ...updated[index], [field]: value };
    setMedications(updated);
  };

  const addMed = () => {
    if (medications.length >= 15) { toast.error('Maximum 15 medications per prescription'); return; }
    setMedications([...medications, { ...EMPTY_MED }]);
  };

  const removeMed = (index) => {
    if (medications.length <= 1) return;
    setMedications(medications.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validMeds = medications.filter((m) => m.drug_name.trim());
    if (validMeds.length === 0) {
      toast.error('Add at least one medication');
      return;
    }
    setSubmitting(true);
    try {
      const patient = patients.find((p) => p.patient_id === selectedPatient);
      await api.post('/doctor-assist/prescriptions', {
        medications: validMeds,
        patient_case: selectedPatient
          ? { patient_id: selectedPatient, patient_name: patient?.patient_name || '' }
          : null,
        notes: notes || null,
      });
      toast.success('Prescription created');
      setMedications([{ ...EMPTY_MED }]);
      setSelectedPatient('');
      setNotes('');
      fetchPrescriptions();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create prescription');
    } finally {
      setSubmitting(false);
    }
  };

  const downloadPdf = async (id) => {
    try {
      const response = await api.get(`/doctor-assist/prescriptions/${id}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `prescription-${id}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to download PDF');
    }
  };

  const formatDate = (d) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const parseMeds = (rx) => {
    if (!rx.medications) return [];
    const meds = typeof rx.medications === 'string' ? JSON.parse(rx.medications) : rx.medications;
    return Array.isArray(meds) ? meds : [];
  };

  return (
    <motion.div variants={fadeIn} initial="hidden" animate="visible" className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Prescriptions</h1>
        <p className="text-sm text-slate-500 mt-1">Write and manage patient prescriptions</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Form */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">New Prescription</h2>
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Patient selector */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Patient (optional)</label>
              <select
                value={selectedPatient}
                onChange={(e) => setSelectedPatient(e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white"
              >
                <option value="">-- Select patient --</option>
                {patients.map((p) => (
                  <option key={p.patient_id} value={p.patient_id}>
                    {p.patient_name || p.patient_email || p.patient_id}
                  </option>
                ))}
              </select>
            </div>

            {/* Medications */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Medications</label>
              <div className="space-y-3">
                <AnimatePresence>
                  {medications.map((med, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="p-3 border border-slate-200 rounded-xl space-y-2 relative"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-400">Drug #{i + 1}</span>
                        {medications.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeMed(i)}
                            className="text-slate-400 hover:text-red-500 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        value={med.drug_name}
                        onChange={(e) => updateMed(i, 'drug_name', e.target.value)}
                        placeholder="Drug name (e.g., Metformin)"
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                      />
                      <div className="grid grid-cols-3 gap-2">
                        <input
                          type="text"
                          value={med.dosage}
                          onChange={(e) => updateMed(i, 'dosage', e.target.value)}
                          placeholder="Dosage"
                          className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                        />
                        <input
                          type="text"
                          value={med.frequency}
                          onChange={(e) => updateMed(i, 'frequency', e.target.value)}
                          placeholder="Frequency"
                          className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                        />
                        <input
                          type="text"
                          value={med.duration}
                          onChange={(e) => updateMed(i, 'duration', e.target.value)}
                          placeholder="Duration"
                          className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                        />
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
              <button
                type="button"
                onClick={addMed}
                className="mt-2 flex items-center gap-1.5 px-3 py-1.5 border border-dashed border-slate-300 text-slate-600 text-xs font-medium rounded-lg hover:border-teal-400 hover:text-teal-700 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Another Drug
              </button>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Clinical Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Additional instructions, allergies, warnings..."
                className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl transition-colors"
            >
              {submitting ? 'Creating...' : 'Create Prescription'}
            </button>
          </form>
        </div>

        {/* List */}
        <div className="lg:col-span-3 space-y-4">
          <h2 className="text-lg font-semibold text-slate-800">Recent Prescriptions</h2>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : prescriptions.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center">
              <p className="text-slate-500">No prescriptions yet.</p>
            </div>
          ) : (
            prescriptions.map((rx, i) => {
              const meds = parseMeds(rx);
              const patientInfo = rx.patient_case
                ? (typeof rx.patient_case === 'string' ? JSON.parse(rx.patient_case) : rx.patient_case)
                : null;
              return (
                <motion.div
                  key={rx.id || i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5"
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <h3 className="font-bold text-slate-800">
                        {meds.length} Medication{meds.length !== 1 ? 's' : ''}
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {patientInfo?.patient_name ? `Patient: ${patientInfo.patient_name}` : 'No patient linked'}
                        {' | '}{formatDate(rx.issued_at)}
                      </p>
                    </div>
                    <button
                      onClick={() => downloadPdf(rx.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors shrink-0"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      PDF
                    </button>
                  </div>

                  {/* Medications table */}
                  <div className="rounded-lg border border-slate-100 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                          <th className="text-left px-3 py-2 font-medium">Drug</th>
                          <th className="text-left px-3 py-2 font-medium">Dosage</th>
                          <th className="text-left px-3 py-2 font-medium">Frequency</th>
                          <th className="text-left px-3 py-2 font-medium">Duration</th>
                        </tr>
                      </thead>
                      <tbody>
                        {meds.map((m, j) => (
                          <tr key={j} className="border-t border-slate-50">
                            <td className="px-3 py-2 font-medium text-slate-800">{m.drug_name || '--'}</td>
                            <td className="px-3 py-2 text-slate-600">{m.dosage || '--'}</td>
                            <td className="px-3 py-2 text-slate-600">{m.frequency || '--'}</td>
                            <td className="px-3 py-2 text-slate-600">{m.duration || '--'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {rx.notes && (
                    <p className="text-xs text-slate-500 mt-3 pt-3 border-t border-slate-50">
                      <span className="font-medium">Notes:</span> {rx.notes}
                    </p>
                  )}
                </motion.div>
              );
            })
          )}
        </div>
      </div>
    </motion.div>
  );
}
