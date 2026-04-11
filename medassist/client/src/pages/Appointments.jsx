import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const fadeIn = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

const STATUS_STYLE = {
  pending:  'bg-amber-50 text-amber-700 border-amber-200',
  accepted: 'bg-green-50 text-green-700 border-green-200',
  declined: 'bg-red-50 text-red-700 border-red-200',
  completed:'bg-slate-50 text-slate-600 border-slate-200',
};

/* ── Doctor Select Dropdown with search ────────────────────────────────── */
function DoctorSelect({ value, onChange, doctors }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selected = doctors.find(d => d.id === value);

  const filtered = doctors.filter(d => {
    const q = search.toLowerCase();
    return (
      d.full_name?.toLowerCase().includes(q) ||
      d.specialization?.toLowerCase().includes(q) ||
      d.city?.toLowerCase().includes(q) ||
      d.hospital_name?.toLowerCase().includes(q)
    );
  });

  const formatDoctor = (d) => {
    const parts = [d.full_name];
    if (d.specialization) parts.push(d.specialization);
    if (d.city) parts.push(d.city);
    return parts;
  };

  return (
    <div ref={ref} className="relative">
      <label className="block text-sm font-medium text-slate-700 mb-1">Select Doctor</label>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-left focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white flex items-center justify-between gap-2"
      >
        {selected ? (
          <span className="truncate">
            <span className="font-medium text-slate-800">{selected.full_name}</span>
            {selected.specialization && (
              <span className="text-teal-600 ml-1.5">— {selected.specialization}</span>
            )}
            {selected.city && (
              <span className="text-slate-400 ml-1.5">({selected.city})</span>
            )}
          </span>
        ) : (
          <span className="text-slate-400">Choose a doctor...</span>
        )}
        <svg className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-slate-100">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, specialty, or city..."
              autoFocus
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>
          {/* Options */}
          <ul className="max-h-60 overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="px-4 py-3 text-sm text-slate-400 text-center">No doctors found</li>
            ) : (
              filtered.map(d => {
                const [name, spec, city] = formatDoctor(d);
                const isSelected = d.id === value;
                return (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => { onChange(d.id); setOpen(false); setSearch(''); }}
                      className={`w-full text-left px-4 py-3 hover:bg-teal-50 transition-colors flex items-center justify-between gap-2 ${
                        isSelected ? 'bg-teal-50' : ''
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-slate-800">{name}</span>
                          {spec && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-700">
                              {spec}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          {city && (
                            <span className="text-xs text-slate-500 flex items-center gap-1">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                              </svg>
                              {city}{d.state ? `, ${d.state}` : ''}
                            </span>
                          )}
                          {d.hospital_name && (
                            <span className="text-xs text-slate-500 flex items-center gap-1">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75" />
                              </svg>
                              {d.hospital_name}
                            </span>
                          )}
                        </div>
                      </div>
                      {isSelected && (
                        <svg className="w-5 h-5 text-teal-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      )}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ── Main Component ────────────────────────────────────────────────────── */
export default function Appointments() {
  const { user } = useAuth();
  const isDoctor = user?.role === 'doctor';
  const [appointments, setAppointments] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [actionId, setActionId] = useState(null);
  const [form, setForm] = useState({ doctor_id: '', date: '', time: '', notes: '' });

  const fetchAppointments = async () => {
    try {
      const { data } = await api.get('/appointments');
      setAppointments(data.appointments || []);
    } catch {
      toast.error('Failed to load appointments');
    } finally {
      setLoading(false);
    }
  };

  const fetchDoctors = async () => {
    try {
      const { data } = await api.get('/appointments/doctors');
      setDoctors(data.doctors || []);
    } catch {
      // silent — dropdown will just be empty
    }
  };

  useEffect(() => {
    fetchAppointments();
    if (!isDoctor) fetchDoctors();
  }, []);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleRequest = async (e) => {
    e.preventDefault();
    if (!form.doctor_id || !form.date) {
      toast.error('Doctor and date are required');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/appointments', {
        doctor_id: form.doctor_id,
        scheduled_at: `${form.date}T${form.time || '09:00'}`,
        notes: form.notes,
      });
      toast.success('Appointment requested');
      setForm({ doctor_id: '', date: '', time: '', notes: '' });
      fetchAppointments();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to request appointment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAction = async (id, status) => {
    setActionId(id);
    try {
      await api.put(`/appointments/${id}`, { status });
      toast.success(`Appointment ${status}`);
      fetchAppointments();
    } catch (err) {
      toast.error(err.message || 'Action failed');
    } finally {
      setActionId(null);
    }
  };

  const formatDate = (d) =>
    new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const formatTime = (d) =>
    new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  // Find doctor details for appointment list display
  const getDoctorInfo = (apt) => {
    const doc = doctors.find(d => d.id === apt.doctor_id);
    return doc;
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
        <h1 className="text-2xl font-bold text-slate-800">Appointments</h1>
        <p className="text-sm text-slate-500 mt-1">
          {isDoctor ? 'Manage incoming appointment requests' : 'Request and track your appointments'}
        </p>
      </div>

      {/* Patient: Request Form */}
      {!isDoctor && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Request Appointment</h2>
          <form onSubmit={handleRequest} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Doctor dropdown — full width on first row */}
              <div className="sm:col-span-2">
                <DoctorSelect
                  value={form.doctor_id}
                  onChange={(id) => setForm({ ...form, doctor_id: id })}
                  doctors={doctors}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                <input
                  type="date"
                  name="date"
                  value={form.date}
                  onChange={handleChange}
                  required
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Time</label>
                <input
                  type="time"
                  name="time"
                  value={form.time}
                  onChange={handleChange}
                  className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
              <textarea
                name="notes"
                value={form.notes}
                onChange={handleChange}
                rows={2}
                placeholder="Reason for visit..."
                className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white font-semibold px-6 py-2.5 rounded-xl transition-colors"
            >
              {submitting ? 'Requesting...' : 'Request Appointment'}
            </button>
          </form>
        </div>
      )}

      {/* Appointments List */}
      <div>
        <h2 className="text-lg font-semibold text-slate-800 mb-4">
          {isDoctor ? 'Incoming Requests' : 'My Appointments'}
        </h2>

        {appointments.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-12 text-center">
            <p className="text-slate-500">No appointments found.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence>
              {appointments.map((apt, i) => {
                const statusStyle = STATUS_STYLE[apt.status] || STATUS_STYLE.pending;
                const docInfo = !isDoctor ? getDoctorInfo(apt) : null;
                return (
                  <motion.div
                    key={apt.id || i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className="font-semibold text-slate-800 text-sm">
                            {isDoctor
                              ? apt.patient_name || 'Patient'
                              : apt.doctor_name || 'Doctor'}
                          </h3>
                          {/* Show specialization & city for patient view */}
                          {!isDoctor && docInfo?.specialization && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-700">
                              {docInfo.specialization}
                            </span>
                          )}
                          {!isDoctor && docInfo?.city && (
                            <span className="text-xs text-slate-400">{docInfo.city}</span>
                          )}
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${statusStyle}`}>
                            {apt.status}
                          </span>
                        </div>
                        <p className="text-sm text-slate-600">
                          {apt.scheduled_at
                            ? `${formatDate(apt.scheduled_at)} at ${formatTime(apt.scheduled_at)}`
                            : 'No date set'}
                        </p>
                        {apt.notes && (
                          <p className="text-xs text-slate-500 mt-1">{apt.notes}</p>
                        )}
                      </div>

                      {/* Doctor actions */}
                      {isDoctor && apt.status === 'pending' && (
                        <div className="flex gap-2 shrink-0">
                          <button
                            onClick={() => handleAction(apt.id, 'accepted')}
                            disabled={actionId === apt.id}
                            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
                          >
                            Accept
                          </button>
                          <button
                            onClick={() => handleAction(apt.id, 'declined')}
                            disabled={actionId === apt.id}
                            className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
                          >
                            Decline
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </motion.div>
  );
}
