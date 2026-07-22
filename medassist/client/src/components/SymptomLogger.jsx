/**
 * SymptomLogger — anemia symptom tracking for the Anemia Mode dashboard.
 *
 * Lets a patient log how they feel (fatigue, breathlessness, etc.) against a
 * blood report and see their history, so they can track symptoms across the
 * recovery journey. One log per report per day (upserts).
 */
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../services/api';

const SYMPTOMS = [
  { key: 'fatigue',       label: 'Fatigue / tiredness' },
  { key: 'weakness',      label: 'Weakness' },
  { key: 'breathless',    label: 'Shortness of breath' },
  { key: 'dizzy',         label: 'Dizziness' },
  { key: 'pale',          label: 'Pale skin' },
  { key: 'cold',          label: 'Cold hands & feet' },
  { key: 'headache',      label: 'Headaches' },
  { key: 'palpitations',  label: 'Fast / irregular heartbeat' },
  { key: 'nails_hair',    label: 'Brittle nails / hair loss' },
  { key: 'concentration', label: 'Poor concentration' },
];
const LABEL = Object.fromEntries(SYMPTOMS.map((s) => [s.key, s.label]));

export default function SymptomLogger({ reportId }) {
  const [selected, setSelected] = useState(new Set());
  const [note, setNote] = useState('');
  const [logs, setLogs] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!reportId) return;
    api.get(`/blood-report/${reportId}/symptoms`)
      .then((res) => {
        const list = res.data.logs || [];
        setLogs(list);
        // Prefill from the most recent log so re-logging is easy
        const latest = list[0];
        if (latest?.symptoms?.length) setSelected(new Set(latest.symptoms));
        if (latest?.note) setNote(latest.note);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [reportId]);

  function toggle(key) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      const res = await api.post(`/blood-report/${reportId}/symptoms`, {
        symptoms: [...selected],
        note: note.trim() || null,
      });
      const saved = res.data.log;
      // Replace today's entry (same logged_at) or prepend
      setLogs((prev) => {
        const rest = prev.filter((l) => l.logged_at !== saved.logged_at);
        return [saved, ...rest];
      });
      toast.success("Today's symptoms logged");
    } catch {
      toast.error('Could not save symptoms');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow p-6 space-y-4 animate-slide-up">
      <h2 className="text-base font-bold font-display text-slate-800 border-b border-slate-200 pb-3 flex items-center gap-2">
        <span className="text-lg">📝</span>
        Symptom Log
        <span className="ml-auto text-[11px] font-normal text-slate-400">Track how you feel over time</span>
      </h2>

      <div className="flex flex-wrap gap-2">
        {SYMPTOMS.map((s) => {
          const on = selected.has(s.key);
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => toggle(s.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                on
                  ? 'bg-teal-50 text-teal-700 border-teal-300'
                  : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300'
              }`}
            >
              {on ? '✓ ' : ''}{s.label}
            </button>
          );
        })}
      </div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Optional note (e.g. worse in the mornings)…"
        rows={2}
        className="w-full text-sm rounded-xl border border-slate-200 px-3 py-2 focus:ring-teal-500 focus:border-teal-500 resize-none"
      />

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="px-4 py-2 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-60"
      >
        {saving ? 'Saving…' : "Save today's log"}
      </button>

      {/* History */}
      {loaded && logs.length > 0 && (
        <div className="pt-3 border-t border-slate-100 space-y-2">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Recent logs</p>
          {logs.slice(0, 5).map((l) => (
            <div key={l.id} className="text-xs text-slate-600 flex flex-wrap items-center gap-1.5">
              <span className="font-semibold text-slate-500 w-24 shrink-0">
                {new Date(l.logged_at).toLocaleDateString()}
              </span>
              {(l.symptoms || []).length === 0
                ? <span className="text-slate-400">No symptoms</span>
                : (l.symptoms || []).map((k) => (
                    <span key={k} className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px]">
                      {LABEL[k] || k}
                    </span>
                  ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
