import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../services/api';

const fadeIn = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

export default function PatientPrescriptions() {
  const [prescriptions, setPrescriptions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/patient/prescriptions');
        setPrescriptions(data.prescriptions || []);
      } catch {
        toast.error('Failed to load prescriptions');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const formatDate = (d) =>
    new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

  const parseMeds = (rx) => {
    if (!rx.medications) return [];
    const meds = typeof rx.medications === 'string' ? JSON.parse(rx.medications) : rx.medications;
    return Array.isArray(meds) ? meds : [];
  };

  const downloadPdf = async (id) => {
    try {
      const response = await api.get(`/patient/prescriptions/${id}/pdf`, { responseType: 'blob' });
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
        <h1 className="text-2xl font-bold text-slate-800">My Prescriptions</h1>
        <p className="text-sm text-slate-500 mt-1">Prescriptions written by your doctors</p>
      </div>

      {prescriptions.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-12 text-center">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
          </div>
          <p className="text-slate-500 font-medium">No prescriptions yet</p>
          <p className="text-sm text-slate-400 mt-1">When your doctor writes a prescription, it will appear here.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {prescriptions.map((rx, i) => {
            const meds = parseMeds(rx);
            return (
              <motion.div
                key={rx.id || i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden"
              >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-teal-50 rounded-lg flex items-center justify-center">
                        <svg className="w-4 h-4 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-800 text-sm">
                          Dr. {rx.doctor_name}
                        </h3>
                        <p className="text-xs text-slate-400">{formatDate(rx.issued_at)}</p>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => downloadPdf(rx.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                    Download PDF
                  </button>
                </div>

                {/* Medications table */}
                <div className="px-5 py-3">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-slate-400 text-xs uppercase tracking-wide">
                        <th className="text-left py-2 font-medium">Medication</th>
                        <th className="text-left py-2 font-medium">Dosage</th>
                        <th className="text-left py-2 font-medium">Frequency</th>
                        <th className="text-left py-2 font-medium">Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {meds.map((m, j) => (
                        <tr key={j} className="border-t border-slate-50">
                          <td className="py-2.5 font-medium text-slate-800">{m.drug_name || '--'}</td>
                          <td className="py-2.5 text-slate-600">{m.dosage || '--'}</td>
                          <td className="py-2.5 text-slate-600">{m.frequency || '--'}</td>
                          <td className="py-2.5 text-slate-600">{m.duration || '--'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Notes */}
                {rx.notes && (
                  <div className="px-5 py-3 bg-slate-50 border-t border-slate-100">
                    <p className="text-xs text-slate-600">
                      <span className="font-semibold text-slate-700">Doctor's Notes:</span> {rx.notes}
                    </p>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
