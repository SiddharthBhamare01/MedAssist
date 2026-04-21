import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../services/api';

const fadeIn = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

const STATUS_CONFIG = {
  pending:     { label: 'Pending',     cls: 'bg-amber-50 text-amber-700 border-amber-200',   dot: 'bg-amber-400' },
  accepted:    { label: 'Confirmed',   cls: 'bg-green-50 text-green-700 border-green-200',   dot: 'bg-green-500' },
  rescheduled: { label: 'Rescheduled', cls: 'bg-blue-50 text-blue-700 border-blue-200',      dot: 'bg-blue-500' },
  declined:    { label: 'Declined',    cls: 'bg-red-50 text-red-700 border-red-200',          dot: 'bg-red-400'  },
  cancelled:   { label: 'Cancelled',   cls: 'bg-slate-50 text-slate-500 border-slate-200',   dot: 'bg-slate-300' },
  completed:   { label: 'Completed',   cls: 'bg-teal-50 text-teal-700 border-teal-200',      dot: 'bg-teal-500' },
};

function fmt(iso, opts = {}) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    weekday: opts.short ? undefined : 'short',
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
    ...opts,
  });
}

function dateStr(d) {
  return d.toISOString().split('T')[0];
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/* ── Reschedule / Action Modal ──────────────────────────────────────────── */
function ActionModal({ apt, onClose, onDone }) {
  const [action, setAction] = useState('accepted');  // accepted | rescheduled | declined | cancelled
  const [date, setDate] = useState(apt.scheduled_at ? apt.scheduled_at.slice(0, 10) : '');
  const [time, setTime] = useState(apt.scheduled_at ? apt.scheduled_at.slice(11, 16) : '09:00');
  const [doctorNotes, setDoctorNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const needsTime = action === 'rescheduled';

  const handleSubmit = async () => {
    if (needsTime && !date) return toast.error('Please select a new date');
    setSaving(true);
    try {
      const payload = { status: action, doctor_notes: doctorNotes || undefined };
      if (needsTime) payload.scheduled_at = `${date}T${time}`;
      await api.put(`/appointments/${apt.id}`, payload);
      toast.success({
        accepted: 'Appointment approved — patient notified',
        rescheduled: 'New time proposed — patient notified',
        declined: 'Appointment declined — patient notified',
        cancelled: 'Appointment cancelled — patient notified',
      }[action]);
      onDone();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const ACTION_OPTS = [
    { key: 'accepted',    label: 'Approve',    cls: 'border-green-300 text-green-700 bg-green-50 data-[sel=true]:bg-green-600 data-[sel=true]:text-white data-[sel=true]:border-green-600' },
    { key: 'rescheduled', label: 'Reschedule', cls: 'border-blue-300 text-blue-700 bg-blue-50 data-[sel=true]:bg-blue-600 data-[sel=true]:text-white data-[sel=true]:border-blue-600' },
    { key: 'declined',    label: 'Decline',    cls: 'border-red-300 text-red-700 bg-red-50 data-[sel=true]:bg-red-600 data-[sel=true]:text-white data-[sel=true]:border-red-600' },
    { key: 'cancelled',   label: 'Cancel',     cls: 'border-slate-300 text-slate-700 bg-slate-50 data-[sel=true]:bg-slate-600 data-[sel=true]:text-white data-[sel=true]:border-slate-600' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-800">Manage Appointment</h3>
            <p className="text-sm text-slate-500 mt-0.5">
              Patient: <span className="font-semibold text-slate-700">{apt.patient_name}</span>
            </p>
            {apt.scheduled_at && (
              <p className="text-xs text-slate-400 mt-0.5">Current: {fmt(apt.scheduled_at)}</p>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 mt-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          {/* Action choice */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Action</label>
            <div className="grid grid-cols-2 gap-2">
              {ACTION_OPTS.map(opt => (
                <button key={opt.key} type="button"
                  data-sel={action === opt.key}
                  onClick={() => setAction(opt.key)}
                  className={`px-3 py-2 rounded-xl text-sm font-semibold border transition-all ${opt.cls}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* New time (only for reschedule) */}
          {needsTime && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">New Date *</label>
                <input type="date" value={date} min={dateStr(new Date())}
                  onChange={e => setDate(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">New Time</label>
                <input type="time" value={time} onChange={e => setTime(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
              </div>
            </div>
          )}

          {/* Doctor notes */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {action === 'rescheduled' ? 'Reason for reschedule' : 'Note to patient'}{' '}
              <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <textarea value={doctorNotes} onChange={e => setDoctorNotes(e.target.value)}
              rows={2} placeholder="Add a note for the patient…"
              className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none" />
          </div>

          <div className="flex items-center gap-1.5 text-xs text-teal-600 bg-teal-50 rounded-lg px-3 py-2">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
            </svg>
            Patient will receive an email notification automatically.
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-slate-300 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex-1 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors">
            {saving ? 'Saving…' : 'Confirm'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ── Calendar — Monthly View ────────────────────────────────────────────── */
function MonthlyCalendar({ appointments, onDayClick, selectedDay }) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const aptsByDay = {};
  appointments.forEach(apt => {
    if (!apt.scheduled_at) return;
    const d = new Date(apt.scheduled_at);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const key = d.getDate();
      (aptsByDay[key] = aptsByDay[key] || []).push(apt);
    }
  });

  const today = new Date();
  const todayKey = today.getFullYear() === year && today.getMonth() === month ? today.getDate() : null;

  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setCursor(new Date(year, month - 1, 1))}
          className="p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-500">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </button>
        <h3 className="font-bold text-slate-800">{MONTH_NAMES[month]} {year}</h3>
        <button onClick={() => setCursor(new Date(year, month + 1, 1))}
          className="p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-500">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_NAMES.map(d => (
          <div key={d} className="text-center text-xs font-semibold text-slate-400 py-1">{d}</div>
        ))}
      </div>

      {/* Cells — gap-px with slate-200 creates visible grid lines in both modes */}
      <div className="grid grid-cols-7 gap-px bg-slate-200 rounded-xl overflow-hidden">
        {cells.map((day, i) => {
          if (!day) return <div key={`e-${i}`} className="bg-slate-50 min-h-[60px]" />;
          const apts = aptsByDay[day] || [];
          const isToday = day === todayKey;
          const isSelected = selectedDay && selectedDay.getDate() === day &&
            selectedDay.getMonth() === month && selectedDay.getFullYear() === year;

          return (
            <button key={day} onClick={() => onDayClick(new Date(year, month, day))}
              className={`bg-white min-h-[60px] p-1.5 text-left hover:bg-teal-50 transition-colors relative
                ${isSelected ? 'ring-2 ring-inset ring-teal-500' : ''}`}>
              <span className={`text-xs font-semibold inline-flex w-5 h-5 items-center justify-center rounded-full
                ${isToday ? 'bg-teal-600 text-white' : 'text-slate-600'}`}>
                {day}
              </span>
              <div className="mt-1 space-y-0.5">
                {apts.slice(0, 3).map((apt, j) => {
                  const cfg = STATUS_CONFIG[apt.status] || STATUS_CONFIG.pending;
                  return (
                    <div key={j} className={`text-[9px] font-medium px-1 py-0.5 rounded truncate border ${cfg.cls}`}>
                      {new Date(apt.scheduled_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} {apt.patient_name?.split(' ')[0]}
                    </div>
                  );
                })}
                {apts.length > 3 && (
                  <div className="text-[9px] text-slate-400 px-1">+{apts.length - 3} more</div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Weekly View ────────────────────────────────────────────────────────── */
function WeeklyView({ appointments, weekStart }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const today = dateStr(new Date());

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow overflow-hidden">
      <div className="grid grid-cols-7 border-b border-slate-200">
        {days.map((d, i) => {
          const isToday = dateStr(d) === today;
          return (
            <div key={i} className={`px-2 py-3 text-center border-r last:border-r-0 border-slate-200 ${isToday ? 'bg-teal-50' : 'bg-slate-50'}`}>
              <div className="text-xs text-slate-400">{DAY_NAMES[d.getDay()]}</div>
              <div className={`text-sm font-bold mt-0.5 ${isToday ? 'text-teal-600' : 'text-slate-700'}`}>
                {d.getDate()}
              </div>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-7 min-h-[200px]">
        {days.map((d, i) => {
          const key = dateStr(d);
          const dayApts = appointments.filter(a => a.scheduled_at && a.scheduled_at.slice(0, 10) === key);
          const isToday = key === today;
          return (
            <div key={i} className={`border-r last:border-r-0 border-slate-200 p-1.5 space-y-1 ${isToday ? 'bg-teal-50/40' : ''}`}>
              {dayApts.map((apt, j) => {
                const cfg = STATUS_CONFIG[apt.status] || STATUS_CONFIG.pending;
                return (
                  <div key={j} className={`text-[10px] rounded-lg px-1.5 py-1 border ${cfg.cls} leading-tight`}>
                    <div className="font-semibold truncate">
                      {new Date(apt.scheduled_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div className="truncate">{apt.patient_name?.split(' ')[0]}</div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Appointment Row Card ────────────────────────────────────────────────── */
function AptRow({ apt, index, onAction }) {
  const cfg = STATUS_CONFIG[apt.status] || STATUS_CONFIG.pending;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className="bg-white rounded-2xl border border-slate-200 shadow p-4"
    >
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0 text-slate-600 font-bold text-sm">
          {(apt.patient_name || 'P').charAt(0)}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-800 text-sm">{apt.patient_name}</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${cfg.cls}`}>
              {cfg.label}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-500">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
            </svg>
            {apt.scheduled_at ? fmt(apt.scheduled_at) : 'Date not set'}
          </div>
          {apt.notes && <p className="text-xs text-slate-400 mt-1 truncate">"{apt.notes}"</p>}
          {apt.doctor_notes && <p className="text-xs text-blue-500 mt-1 truncate italic">Your note: {apt.doctor_notes}</p>}
        </div>

        {!['cancelled', 'declined', 'completed'].includes(apt.status) && (
          <button onClick={() => onAction(apt)}
            className="shrink-0 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg transition-colors">
            Manage
          </button>
        )}
      </div>
    </motion.div>
  );
}

/* ── Main ────────────────────────────────────────────────────────────────── */
export default function DoctorAppointments() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [managing, setManaging] = useState(null);
  const [calView, setCalView] = useState('month'); // month | week | list
  const [selectedDay, setSelectedDay] = useState(null);
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [listFilter, setListFilter] = useState('pending');

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/appointments');
      setAppointments(data.appointments || []);
    } catch {
      toast.error('Failed to load appointments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const dayAppointments = selectedDay
    ? appointments.filter(a => a.scheduled_at && a.scheduled_at.slice(0, 10) === dateStr(selectedDay))
    : appointments;

  const listApts = appointments.filter(a =>
    listFilter === 'all' ? true : a.status === listFilter
  );

  const pending = appointments.filter(a => a.status === 'pending').length;
  const today = appointments.filter(a =>
    a.scheduled_at && a.scheduled_at.slice(0, 10) === dateStr(new Date()) && a.status === 'accepted'
  ).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <motion.div variants={fadeIn} initial="hidden" animate="visible" className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Appointments</h1>
          <p className="text-sm text-slate-500 mt-1">Manage patient appointments and your schedule</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Pending Requests', value: pending, cls: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
          { label: "Today's Confirmed", value: today,   cls: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200' },
          { label: 'Total',             value: appointments.length, cls: 'text-teal-600', bg: 'bg-teal-50', border: 'border-teal-200' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-2xl p-4 border ${s.border} shadow-sm`}>
            <div className={`text-2xl font-bold ${s.cls}`}>{s.value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* View toggle */}
      <div className="flex items-center gap-2">
        <div className="flex gap-1 bg-slate-200 rounded-xl p-1">
          {[['month', 'Monthly'], ['week', 'Weekly'], ['list', 'List']].map(([k, l]) => (
            <button key={k} onClick={() => setCalView(k)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${calView === k ? 'bg-white text-teal-700 shadow' : 'text-slate-600 hover:text-slate-800'}`}>
              {l}
            </button>
          ))}
        </div>

        {calView === 'week' && (
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={() => setWeekStart(addDays(weekStart, -7))}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
            </button>
            <span className="text-sm text-slate-600 font-medium min-w-[160px] text-center">
              {weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} –{' '}
              {addDays(weekStart, 6).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
            <button onClick={() => setWeekStart(addDays(weekStart, 7))}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Calendar views */}
      {calView === 'month' && (
        <div className="space-y-4">
          <MonthlyCalendar appointments={appointments} onDayClick={setSelectedDay} selectedDay={selectedDay} />
          {selectedDay && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-slate-700">
                  {selectedDay.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                  {' '}— {dayAppointments.length} appointment{dayAppointments.length !== 1 ? 's' : ''}
                </h3>
                <button onClick={() => setSelectedDay(null)} className="text-xs text-slate-400 hover:text-slate-600">
                  Clear
                </button>
              </div>
              <div className="space-y-2">
                {dayAppointments.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-4">No appointments this day</p>
                ) : dayAppointments.map((apt, i) => (
                  <AptRow key={apt.id} apt={apt} index={i} onAction={setManaging} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {calView === 'week' && (
        <WeeklyView appointments={appointments} weekStart={weekStart} />
      )}

      {calView === 'list' && (
        <div className="space-y-4">
          <div className="flex gap-1 bg-slate-200 rounded-xl p-1 w-fit">
            {[['pending','Pending'], ['accepted','Confirmed'], ['all','All']].map(([k, l]) => (
              <button key={k} onClick={() => setListFilter(k)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${listFilter === k ? 'bg-white text-teal-700 shadow' : 'text-slate-600 hover:text-slate-800'}`}>
                {l}
                {k === 'pending' && pending > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold bg-amber-500 text-white rounded-full">
                    {pending}
                  </span>
                )}
              </button>
            ))}
          </div>

          {listApts.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow p-10 text-center">
              <p className="text-slate-400 text-sm">No {listFilter === 'all' ? '' : listFilter} appointments</p>
            </div>
          ) : (
            <div className="space-y-3">
              <AnimatePresence>
                {listApts.map((apt, i) => (
                  <AptRow key={apt.id} apt={apt} index={i} onAction={setManaging} />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      )}

      {managing && (
        <ActionModal apt={managing} onClose={() => setManaging(null)} onDone={load} />
      )}
    </motion.div>
  );
}
