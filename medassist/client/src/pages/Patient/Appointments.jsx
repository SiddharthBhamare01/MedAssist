import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../services/api';

const fadeIn = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

const STATUS_CONFIG = {
  pending:     { label: 'Pending',     cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  accepted:    { label: 'Confirmed',   cls: 'bg-green-50 text-green-700 border-green-200' },
  declined:    { label: 'Declined',    cls: 'bg-red-50 text-red-700 border-red-200' },
  cancelled:   { label: 'Cancelled',   cls: 'bg-slate-50 text-slate-500 border-slate-200' },
  rescheduled: { label: 'Rescheduled', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  completed:   { label: 'Completed',   cls: 'bg-teal-50 text-teal-700 border-teal-200' },
};

const CANCEL_HOURS = 24;

function canCancel(apt) {
  if (!apt.scheduled_at) return true;
  return (new Date(apt.scheduled_at) - Date.now()) > CANCEL_HOURS * 3600 * 1000;
}

function fmt(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

/* ── Doctor search dropdown ─────────────────────────────────────────────── */
function DoctorSelect({ value, onChange, doctors }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const selected = doctors.find(d => d.id === value);
  const filtered = doctors.filter(d =>
    [d.full_name, d.specialization, d.city, d.hospital_name]
      .filter(Boolean).join(' ').toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div ref={ref} className="relative">
      <label className="block text-sm font-medium text-slate-700 mb-1">Select Doctor *</label>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-left bg-white flex items-center justify-between gap-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
      >
        {selected ? (
          <span className="truncate">
            <span className="font-semibold text-slate-800">{selected.full_name}</span>
            {selected.specialization && <span className="text-teal-600 ml-1.5">— {selected.specialization}</span>}
            {selected.city && <span className="text-slate-400 ml-1.5">({selected.city})</span>}
          </span>
        ) : (
          <span className="text-slate-400">Choose a doctor…</span>
        )}
        <svg className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          <div className="p-2 border-b border-slate-200">
            <input autoFocus type="text" value={q} onChange={e => setQ(e.target.value)}
              placeholder="Search by name, specialty, city…"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
          <ul className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="px-4 py-3 text-sm text-slate-400 text-center">No doctors found</li>
            ) : filtered.map(d => (
              <li key={d.id}>
                <button type="button"
                  onClick={() => { onChange(d.id); setOpen(false); setQ(''); }}
                  className={`w-full text-left px-4 py-3 hover:bg-teal-50 transition-colors ${d.id === value ? 'bg-teal-50' : ''}`}
                >
                  <div className="text-sm font-semibold text-slate-800">{d.full_name}</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {[d.specialization, d.hospital_name, d.city].filter(Boolean).join(' · ')}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ── Edit Modal ─────────────────────────────────────────────────────────── */
function EditModal({ apt, onClose, onSaved }) {
  const [date, setDate] = useState(apt.scheduled_at ? apt.scheduled_at.slice(0, 10) : '');
  const [time, setTime] = useState(apt.scheduled_at ? apt.scheduled_at.slice(11, 16) : '09:00');
  const [notes, setNotes] = useState(apt.notes || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/appointments/${apt.id}`, {
        scheduled_at: date ? `${date}T${time}` : undefined,
        notes,
      });
      toast.success('Appointment updated');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-slate-800">Edit Appointment</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
              <input type="date" value={date} min={todayStr()} onChange={e => setDate(e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Time</label>
              <input type="time" value={time} onChange={e => setTime(e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              placeholder="Reason for visit…"
              className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none" />
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-slate-300 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ── Appointment Card ────────────────────────────────────────────────────── */
function AppointmentCard({ apt, index, onCancel, onEdit, cancelling }) {
  const cfg = STATUS_CONFIG[apt.status] || STATUS_CONFIG.pending;
  const cancellable = canCancel(apt) && ['pending', 'accepted'].includes(apt.status);
  const editable = apt.status === 'pending';
  const hoursLeft = apt.scheduled_at
    ? Math.round((new Date(apt.scheduled_at) - Date.now()) / 3600000)
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="bg-white rounded-2xl border border-slate-200 shadow p-5"
    >
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center shrink-0 text-teal-700 font-bold text-sm">
          {(apt.doctor_name || 'D').charAt(0)}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="font-semibold text-slate-800 text-sm">Dr. {apt.doctor_name}</span>
            {apt.specialization && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-700">
                {apt.specialization}
              </span>
            )}
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${cfg.cls}`}>
              {cfg.label}
            </span>
          </div>

          {apt.hospital_name && (
            <p className="text-xs text-slate-400">{apt.hospital_name}{apt.city ? ` · ${apt.city}` : ''}</p>
          )}

          <div className="mt-2 space-y-1">
            <div className="flex items-center gap-1.5 text-sm text-slate-600">
              <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
              </svg>
              {apt.scheduled_at ? fmt(apt.scheduled_at) : 'Date TBD — awaiting doctor confirmation'}
            </div>
            {apt.notes && (
              <p className="text-xs text-slate-500 pl-5.5">{apt.notes}</p>
            )}
            {apt.doctor_notes && (
              <p className="text-xs text-blue-600 pl-5.5 italic">Doctor's note: {apt.doctor_notes}</p>
            )}
          </div>

          {/* Cancel restriction warning */}
          {['pending', 'accepted'].includes(apt.status) && apt.scheduled_at && !cancellable && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
              Cannot cancel — appointment is in {hoursLeft} hour{hoursLeft !== 1 ? 's' : ''} ({CANCEL_HOURS}h minimum required)
            </div>
          )}
        </div>

        {/* Actions */}
        {(editable || cancellable) && (
          <div className="flex flex-col gap-2 shrink-0">
            {editable && (
              <button onClick={() => onEdit(apt)}
                className="px-3 py-1.5 border border-teal-300 text-teal-700 hover:bg-teal-50 text-xs font-semibold rounded-lg transition-colors">
                Edit
              </button>
            )}
            {cancellable && (
              <button onClick={() => onCancel(apt)} disabled={cancelling === apt.id}
                className="px-3 py-1.5 border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50">
                {cancelling === apt.id ? '…' : 'Cancel'}
              </button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ── Main ────────────────────────────────────────────────────────────────── */
export default function PatientAppointments() {
  const [appointments, setAppointments] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(null);
  const [editing, setEditing] = useState(null);
  const [tab, setTab] = useState('upcoming'); // upcoming | past | all
  const [form, setForm] = useState({ doctor_id: '', date: '', time: '', notes: '' });

  const load = async () => {
    try {
      const { data } = await api.get('/appointments');
      setAppointments(data.appointments || []);
    } catch {
      toast.error('Failed to load appointments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    api.get('/appointments/doctors').then(({ data }) => setDoctors(data.doctors || [])).catch(() => {});
  }, []);

  const handleBook = async (e) => {
    e.preventDefault();
    if (!form.doctor_id || !form.date) return toast.error('Doctor and date are required');
    setSubmitting(true);
    try {
      await api.post('/appointments', {
        doctor_id: form.doctor_id,
        scheduled_at: `${form.date}T${form.time || '09:00'}`,
        notes: form.notes,
      });
      toast.success('Appointment requested');
      setForm({ doctor_id: '', date: '', time: '', notes: '' });
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to book');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (apt) => {
    if (!window.confirm('Cancel this appointment?')) return;
    setCancelling(apt.id);
    try {
      await api.put(`/appointments/${apt.id}`, { status: 'cancelled' });
      toast.success('Appointment cancelled');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to cancel');
    } finally {
      setCancelling(null);
    }
  };

  const now = Date.now();
  const filtered = appointments.filter(apt => {
    if (tab === 'upcoming') return !['cancelled', 'declined', 'completed'].includes(apt.status);
    if (tab === 'past') return ['cancelled', 'declined', 'completed'].includes(apt.status);
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <motion.div variants={fadeIn} initial="hidden" animate="visible" className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">My Appointments</h1>
        <p className="text-sm text-slate-500 mt-1">Book and manage your doctor appointments</p>
      </div>

      {/* Book form */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow p-6">
        <h2 className="text-base font-semibold text-slate-800 mb-4">Request New Appointment</h2>
        <form onSubmit={handleBook} className="space-y-4">
          <DoctorSelect value={form.doctor_id} onChange={id => setForm({ ...form, doctor_id: id })} doctors={doctors} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Preferred Date *</label>
              <input type="date" value={form.date} min={todayStr()} required
                onChange={e => setForm({ ...form, date: e.target.value })}
                className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Preferred Time</label>
              <input type="time" value={form.time}
                onChange={e => setForm({ ...form, time: e.target.value })}
                className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Reason for Visit</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
              rows={2} placeholder="Brief description of your concern…"
              className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none" />
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">
              Note: cancellations must be made at least {CANCEL_HOURS} hours before the appointment.
            </p>
            <button type="submit" disabled={submitting}
              className="bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors shrink-0">
              {submitting ? 'Booking…' : 'Request Appointment'}
            </button>
          </div>
        </form>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-200 rounded-xl p-1 w-fit">
        {[['upcoming', 'Upcoming'], ['past', 'Past'], ['all', 'All']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === key ? 'bg-white text-teal-700 shadow' : 'text-slate-600 hover:text-slate-800'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Appointment list */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow p-12 text-center">
          <p className="text-slate-400 text-sm">No {tab === 'all' ? '' : tab} appointments found.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {filtered.map((apt, i) => (
              <AppointmentCard key={apt.id} apt={apt} index={i}
                onCancel={handleCancel} onEdit={setEditing} cancelling={cancelling} />
            ))}
          </AnimatePresence>
        </div>
      )}

      {editing && (
        <EditModal apt={editing} onClose={() => setEditing(null)} onSaved={load} />
      )}
    </motion.div>
  );
}
