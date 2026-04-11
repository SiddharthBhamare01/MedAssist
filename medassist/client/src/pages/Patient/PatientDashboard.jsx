import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../services/api';

const STATUS_META = {
  pending:         { label: 'Running...',      color: 'bg-slate-100 text-slate-600',     step: 1 },
  diagnosed:       { label: 'Diseases Found',  color: 'bg-teal-50 text-teal-700',        step: 2 },
  tests_ready:     { label: 'Tests Ready',     color: 'bg-amber-50 text-amber-700',      step: 3 },
  report_uploaded: { label: 'Report Uploaded',  color: 'bg-orange-50 text-orange-700',    step: 4 },
  analyzed:        { label: 'Complete',         color: 'bg-emerald-50 text-emerald-700',  step: 5 },
};

const STEP_LABELS = ['Symptoms', 'Diagnosed', 'Tests', 'Uploaded', 'Analyzed'];

function ProgressBar({ status }) {
  const step = STATUS_META[status]?.step || 1;
  return (
    <div className="flex items-center gap-1.5 mt-4">
      {STEP_LABELS.map((label, i) => (
        <div key={label} className="flex-1 flex flex-col items-center gap-1.5">
          <div className={`h-1.5 w-full rounded-full transition-all duration-500 ${
            i < step ? 'bg-gradient-to-r from-teal-500 to-teal-400' : 'bg-slate-100'
          }`} />
          <span className={`text-[10px] font-medium truncate ${
            i < step ? 'text-teal-600' : 'text-slate-300'
          }`}>{label}</span>
        </div>
      ))}
    </div>
  );
}

function getResumeTarget(session) {
  // Build state to pass along so resumed pages have full context
  const sessionState = {
    sessionId: session.id,
    disease: session.selected_disease_data || (session.selected_disease ? { disease: session.selected_disease } : null),
    reportId: session.report_id,
  };

  switch (session.status) {
    case 'pending':
      return { path: `/patient/results/${session.id}`, label: 'View Progress', state: sessionState };
    case 'diagnosed':
      return { path: `/patient/results/${session.id}`, label: 'View Diseases', state: sessionState };
    case 'tests_ready':
      return { path: `/patient/tests/${session.id}`, label: 'View Tests', state: sessionState };
    case 'report_uploaded':
      return session.report_id
        ? { path: `/patient/analysis/${session.report_id}`, label: 'Run Analysis', state: sessionState }
        : { path: `/patient/upload-report/${session.id}`, label: 'Upload Report', state: sessionState };
    case 'analyzed':
      return session.report_id
        ? { path: `/patient/analysis/${session.report_id}`, label: 'View Analysis', state: sessionState }
        : null;
    default:
      return null;
  }
}

function symptomPreview(symptoms) {
  if (!symptoms) return 'No symptoms recorded';
  const list = Array.isArray(symptoms)
    ? symptoms.map((s) => (typeof s === 'string' ? s : s.name || s.symptom || '')).filter(Boolean)
    : Object.keys(symptoms);
  if (!list.length) return 'No symptoms recorded';
  const shown = list.slice(0, 3).join(', ');
  return list.length > 3 ? `${shown} +${list.length - 3} more` : shown;
}

function SessionCard({ session, onResume, index }) {
  const meta = STATUS_META[session.status] || STATUS_META.pending;
  const resume = getResumeTarget(session);
  const date = new Date(session.created_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  return (
    <div
      className={`bg-white rounded-2xl border border-slate-100 shadow-card p-5 transition-all duration-300 animate-slide-up
        ${resume ? 'hover:shadow-card-hover hover:border-teal-200 cursor-pointer' : ''}`}
      style={{ animationDelay: `${index * 60}ms` }}
      onClick={resume ? () => onResume(resume.path, resume.state) : undefined}
      role={resume ? 'button' : undefined}
      tabIndex={resume ? 0 : undefined}
      onKeyDown={resume ? (e) => e.key === 'Enter' && onResume(resume.path, resume.state) : undefined}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${meta.color}`}>
              {session.status === 'pending' && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-slate-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-slate-500" />
                </span>
              )}
              {meta.label}
            </span>
            <span className="text-xs text-slate-400">{date}</span>
          </div>

          {session.selected_disease && (
            <p className="mt-2 font-semibold text-slate-800 text-sm truncate">
              {session.selected_disease}
            </p>
          )}

          <p className="text-xs text-slate-400 mt-0.5 truncate">
            {symptomPreview(session.symptoms)}
          </p>
        </div>

        {resume && (
          <button
            onClick={(e) => { e.stopPropagation(); onResume(resume.path, resume.state); }}
            className="shrink-0 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-700 hover:to-teal-600
                       text-white text-sm font-semibold px-4 py-2 rounded-xl transition-all shadow-sm hover:shadow-md whitespace-nowrap"
          >
            {resume.label}
          </button>
        )}
      </div>

      <ProgressBar status={session.status} />
    </div>
  );
}

export default function PatientDashboard() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/patient/sessions')
      .then((res) => setSessions(res.data.sessions || []))
      .catch(() => toast.error('Could not load your sessions'))
      .finally(() => setLoading(false));
  }, []);

  const inProgress = sessions.filter((s) => s.status !== 'analyzed');
  const completed  = sessions.filter((s) => s.status === 'analyzed');

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Hero Header */}
      <div className="bg-gradient-to-br from-teal-700 via-teal-600 to-emerald-600 rounded-2xl shadow-lg p-6 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/4" />
        <div className="relative flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold font-display">My Health Sessions</h1>
            <p className="text-teal-100 text-sm mt-1">
              Resume an in-progress assessment or start a new one
            </p>
          </div>
          <button
            onClick={() => navigate('/patient/intake')}
            className="flex items-center gap-2 bg-white text-teal-700 font-bold px-6 py-3 rounded-xl
                       hover:bg-teal-50 transition-all text-sm whitespace-nowrap shadow-md hover:shadow-lg"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Assessment
          </button>
        </div>

        {/* Inline Stats */}
        {!loading && sessions.length > 0 && (
          <div className="relative grid grid-cols-3 gap-3 mt-5">
            <div className="bg-white/15 backdrop-blur-sm rounded-xl px-4 py-3 text-center border border-white/10">
              <p className="text-2xl font-bold">{sessions.length}</p>
              <p className="text-xs text-teal-100 mt-0.5">Total</p>
            </div>
            <div className="bg-white/15 backdrop-blur-sm rounded-xl px-4 py-3 text-center border border-white/10">
              <p className="text-2xl font-bold text-amber-200">{inProgress.length}</p>
              <p className="text-xs text-teal-100 mt-0.5">In Progress</p>
            </div>
            <div className="bg-white/15 backdrop-blur-sm rounded-xl px-4 py-3 text-center border border-white/10">
              <p className="text-2xl font-bold text-emerald-200">{completed.length}</p>
              <p className="text-xs text-teal-100 mt-0.5">Completed</p>
            </div>
          </div>
        )}
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-4">
          {[1, 2].map((n) => (
            <div key={n} className="bg-white rounded-2xl border border-slate-100 shadow-card p-5 animate-pulse">
              <div className="flex gap-3">
                <div className="h-5 w-24 bg-slate-100 rounded-lg" />
                <div className="h-5 w-20 bg-slate-100 rounded-lg" />
              </div>
              <div className="h-4 w-48 bg-slate-100 rounded mt-3" />
              <div className="h-1.5 w-full bg-slate-100 rounded-full mt-4" />
            </div>
          ))}
        </div>
      )}

      {/* In-progress sessions */}
      {!loading && inProgress.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1">
            In Progress ({inProgress.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {inProgress.map((s, i) => (
              <SessionCard key={s.id} session={s} index={i} onResume={(path, state) => navigate(path, { state })} />
            ))}
          </div>
        </div>
      )}

      {/* Completed sessions */}
      {!loading && completed.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1">
            Completed ({completed.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {completed.map((s, i) => (
              <SessionCard key={s.id} session={s} index={i} onResume={(path, state) => navigate(path, { state })} />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && sessions.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-12 text-center">
          <div className="w-20 h-20 bg-teal-50 rounded-3xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-10 h-10 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m8.9-4.414c.376.023.75.05 1.124.08 1.131.094 1.976 1.057 1.976 2.192V16.5A2.25 2.25 0 0 1 18 18.75h-2.25m-7.5-10.5H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V18.75m-7.5-10.5h6.375c.621 0 1.125.504 1.125 1.125v9.375m-8.25-3 1.5 1.5 3-3.75" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold font-display text-slate-700 mb-2">No assessments yet</h2>
          <p className="text-sm text-slate-400 mb-6 max-w-sm mx-auto">
            Start by entering your symptoms — the AI will guide you through diagnosis, blood tests, and a full report analysis.
          </p>
          <button
            onClick={() => navigate('/patient/intake')}
            className="bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-700 hover:to-teal-600
                       text-white font-semibold px-6 py-2.5 rounded-xl transition-all shadow-md hover:shadow-lg"
          >
            Start First Assessment
          </button>
        </div>
      )}
    </div>
  );
}
