import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../services/api';

const fadeIn = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

const EVENT_STYLES = {
  pending:         { color: 'bg-slate-400',  border: 'border-slate-200', bg: 'bg-slate-50',  text: 'text-slate-600',  label: 'Pending' },
  diagnosed:       { color: 'bg-teal-500',  border: 'border-teal-200', bg: 'bg-teal-50',  text: 'text-teal-700',  label: 'Diagnosed' },
  tests_ready:     { color: 'bg-amber-500', border: 'border-amber-200', bg: 'bg-amber-50', text: 'text-amber-700', label: 'Tests Ready' },
  report_uploaded: { color: 'bg-blue-500',  border: 'border-blue-200', bg: 'bg-blue-50',  text: 'text-blue-700',  label: 'Report Uploaded' },
  analyzed:        { color: 'bg-purple-500', border: 'border-purple-200', bg: 'bg-purple-50', text: 'text-purple-700', label: 'Analyzed' },
  vital:           { color: 'bg-cyan-500',  border: 'border-cyan-200', bg: 'bg-cyan-50',  text: 'text-cyan-700',  label: 'Vital Recorded' },
  medication:      { color: 'bg-green-500', border: 'border-green-200', bg: 'bg-green-50', text: 'text-green-700', label: 'Medication' },
  appointment:     { color: 'bg-rose-500',  border: 'border-rose-200', bg: 'bg-rose-50',  text: 'text-rose-700',  label: 'Appointment' },
};

const DEFAULT_STYLE = { color: 'bg-slate-400', border: 'border-slate-200', bg: 'bg-slate-50', text: 'text-slate-600', label: 'Event' };

export default function HealthTimeline() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTimeline = async () => {
      try {
        const { data } = await api.get('/patient/health-timeline');
        // Backend returns { timeline: [...] } with event_type field
        const raw = data.timeline || data.events || [];
        // Normalize fields for display
        const normalized = raw.map((e) => ({
          ...e,
          type: e.event_type === 'session' ? (e.status || 'diagnosed') : (e.event_type || e.type),
          disease_name: e.disease || e.selected_disease || (e.event_type === 'vital' ? `${e.type}: ${e.value}${e.value2 ? '/' + e.value2 : ''} ${e.unit || ''}` : null),
          title: e.disease || e.selected_disease || (e.event_type === 'vital' ? `${e.type} recorded` : 'Health Event'),
        }));
        setEvents(normalized);
      } catch {
        toast.error('Failed to load timeline');
      } finally {
        setLoading(false);
      }
    };
    fetchTimeline();
  }, []);

  const formatDate = (d) =>
    new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const formatTime = (d) =>
    new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <motion.div variants={fadeIn} initial="hidden" animate="visible" className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Health Timeline</h1>
        <p className="text-sm text-slate-500 mt-1">Your complete medical journey at a glance</p>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {Object.entries(EVENT_STYLES).map(([key, style]) => (
          <div key={key} className="flex items-center gap-1.5">
            <span className={`w-3 h-3 rounded-full ${style.color}`} />
            <span className="text-xs text-slate-500">{style.label}</span>
          </div>
        ))}
      </div>

      {events.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-12 text-center">
          <p className="text-slate-500">No events yet.</p>
          <p className="text-xs text-slate-400 mt-1">Complete a symptom session to start building your timeline.</p>
        </div>
      ) : (
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-slate-200" />

          <div className="space-y-0">
            {events.map((event, i) => {
              const style = EVENT_STYLES[event.type] || DEFAULT_STYLE;
              return (
                <motion.div
                  key={event.id || i}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06, duration: 0.3 }}
                  className="relative pl-14 pb-8 last:pb-0"
                >
                  {/* Dot */}
                  <div className={`absolute left-4 top-1.5 w-5 h-5 rounded-full ${style.color} border-4 border-white shadow-sm z-10`} />

                  {/* Card */}
                  <div className={`${style.bg} border ${style.border} rounded-2xl p-4`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${style.text} ${style.bg} border ${style.border} mb-2`}>
                          {style.label}
                        </span>
                        <h3 className="font-semibold text-slate-800 text-sm">
                          {event.disease_name || event.title || 'Health Event'}
                        </h3>
                        {event.description && (
                          <p className="text-xs text-slate-500 mt-1">{event.description}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-medium text-slate-600">{formatDate(event.date || event.created_at)}</p>
                        <p className="text-xs text-slate-400">{formatTime(event.date || event.created_at)}</p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}
    </motion.div>
  );
}
