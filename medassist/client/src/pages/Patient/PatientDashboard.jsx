import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../services/api';

// Maps DB status to human-readable label + color
const STATUS_META = {
  pending:         { label: 'Running…',       color: 'bg-gray-100 text-gray-600',    step: 1 },
  diagnosed:       { label: 'Diseases Found', color: 'bg-blue-100 text-blue-700',    step: 2 },
  tests_ready:     { label: 'Tests Ready',    color: 'bg-yellow-100 text-yellow-800', step: 3 },
  report_uploaded: { label: 'Report Uploaded',color: 'bg-orange-100 text-orange-700', step: 4 },
  analyzed:        { label: 'Complete',       color: 'bg-green-100 text-green-700',   step: 5 },
};

const STEP_LABELS = ['Symptoms', 'Diagnosed', 'Tests Ready', 'Report Uploaded', 'Analyzed'];

function ProgressBar({ status }) {
  const step = STATUS_META[status]?.step || 1;
  return (
    <div className="flex items-center gap-1 mt-3">
      {STEP_LABELS.map((label, i) => (
        <div key={label} className="flex-1 flex flex-col items-center gap-1">
          <div className={`h-1.5 w-full rounded-full transition-colors ${
            i < step ? 'bg-blue-500' : 'bg-gray-200'
          }`} />
        </div>
      ))}
    </div>
  );
}

function getResumeTarget(session) {
  switch (session.status) {
    case 'diagnosed':
      return { path: `/patient/results/${session.id}`, label: 'View Diseases' };
    case 'tests_ready':
      return { path: `/patient/tests/${session.id}`, label: 'View Tests' };
    case 'report_uploaded':
      return session.report_id
        ? { path: `/patient/analysis/${session.report_id}`, label: 'Run Analysis' }
        : { path: `/patient/upload-report/${session.id}`, label: 'Upload Report' };
    case 'analyzed':
      return session.report_id
        ? { path: `/patient/analysis/${session.report_id}`, label: 'View Analysis' }
        : null;
    default:
      return null; // pending — agent still running, nothing to resume
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

function SessionCard({ session, onResume }) {
  const meta = STATUS_META[session.status] || STATUS_META.pending;
  const resume = getResumeTarget(session);
  const date = new Date(session.created_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${meta.color}`}>
              {meta.label}
            </span>
            <span className="text-xs text-gray-400">{date}</span>
          </div>

          {/* Disease name if selected */}
          {session.selected_disease && (
            <p className="mt-1.5 font-semibold text-gray-800 text-sm truncate">
              {session.selected_disease}
            </p>
          )}

          {/* Symptom preview */}
          <p className="text-xs text-gray-500 mt-0.5 truncate">
            {symptomPreview(session.symptoms)}
          </p>
        </div>

        {/* Resume button */}
        {resume ? (
          <button
            onClick={() => onResume(resume.path)}
            className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold
                       px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
          >
            {resume.label} →
          </button>
        ) : (
          <span className="shrink-0 text-xs text-gray-400 italic self-center">In progress…</span>
        )}
      </div>

      {/* Flow progress bar */}
      <ProgressBar status={session.status} />

      {/* Step labels below bar */}
      <div className="flex mt-1">
        {STEP_LABELS.map((label) => (
          <p key={label} className="flex-1 text-center text-xs text-gray-400 truncate px-0.5">
            {label}
          </p>
        ))}
      </div>
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
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-800">My Health Sessions</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Resume an in-progress assessment or start a new one
            </p>
          </div>
          <button
            onClick={() => navigate('/patient/intake')}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-2.5
                       rounded-lg transition-colors text-sm whitespace-nowrap"
          >
            + New Assessment
          </button>
        </div>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-4">
          {[1, 2].map((n) => (
            <div key={n} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 animate-pulse">
              <div className="flex gap-3">
                <div className="h-5 w-24 bg-gray-200 rounded-full" />
                <div className="h-5 w-20 bg-gray-200 rounded-full" />
              </div>
              <div className="h-4 w-48 bg-gray-200 rounded mt-3" />
              <div className="h-2 w-full bg-gray-200 rounded mt-4" />
            </div>
          ))}
        </div>
      )}

      {/* In-progress sessions */}
      {!loading && inProgress.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide px-1">
            In Progress ({inProgress.length})
          </h2>
          {inProgress.map((s) => (
            <SessionCard key={s.id} session={s} onResume={(path) => navigate(path)} />
          ))}
        </div>
      )}

      {/* Completed sessions */}
      {!loading && completed.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide px-1">
            Completed ({completed.length})
          </h2>
          {completed.map((s) => (
            <SessionCard key={s.id} session={s} onResume={(path) => navigate(path)} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && sessions.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <div className="text-5xl mb-4">🩺</div>
          <h2 className="text-lg font-semibold text-gray-700 mb-2">No assessments yet</h2>
          <p className="text-sm text-gray-400 mb-6">
            Start by entering your symptoms — the AI will guide you through diagnosis,
            blood tests, and a full report analysis.
          </p>
          <button
            onClick={() => navigate('/patient/intake')}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2.5
                       rounded-lg transition-colors"
          >
            Start First Assessment
          </button>
        </div>
      )}
    </div>
  );
}
