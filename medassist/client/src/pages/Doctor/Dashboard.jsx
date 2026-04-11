import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import AgentLogModal from '../../components/AgentLogModal';

const URGENCY_STYLE = {
  critical: 'bg-red-500/10 text-red-600 ring-red-500/20',
  urgent:   'bg-amber-500/10 text-amber-600 ring-amber-500/20',
  routine:  'bg-emerald-500/10 text-emerald-600 ring-emerald-500/20',
};

function UrgencyBadge({ urgency }) {
  const cls = URGENCY_STYLE[urgency] || 'bg-slate-100 text-slate-500 ring-slate-200';
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ring-1 ring-inset uppercase tracking-wider ${cls}`}>
      {urgency}
    </span>
  );
}

function SessionCard({ session, onClick, onViewLog, index }) {
  const summary = session.patient_summary || {};
  const results = summary.results || [];
  const date = new Date(session.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const time = new Date(session.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const critCount = results.filter(r => r.urgency === 'critical').length;
  const urgCount  = results.filter(r => r.urgency === 'urgent').length;

  return (
    <div
      className="group bg-white rounded-2xl border border-slate-200/60 p-5 hover:border-teal-300 hover:shadow-lg hover:shadow-teal-500/5
                 transition-all duration-300 cursor-pointer relative overflow-hidden"
      style={{ animationDelay: `${index * 50}ms` }}
      onClick={onClick}
    >
      <div className={`absolute top-0 left-0 w-1 h-full rounded-l-2xl transition-all duration-300
        ${critCount > 0 ? 'bg-red-500' : urgCount > 0 ? 'bg-amber-500' : 'bg-teal-500'}
        opacity-0 group-hover:opacity-100`}
      />

      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-800 text-sm truncate group-hover:text-teal-700 transition-colors">
            {summary.chiefComplaint || 'Patient Case'}
          </p>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            {summary.age ? `${summary.age}yr` : '—'}
            {summary.gender ? ` · ${summary.gender}` : ''}
            {summary.symptoms ? ` · ${summary.symptoms.slice(0, 60)}…` : ''}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[11px] font-semibold text-slate-500">{date}</p>
          <p className="text-[10px] text-slate-400">{time}</p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-1.5 flex-wrap">
        {results.slice(0, 4).map((r, i) => <UrgencyBadge key={i} urgency={r.urgency} />)}
        {results.length > 0 && (
          <span className="text-[10px] text-slate-400 ml-1">{results.length} test{results.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {session.suggested_tests?.length > 0 && (
        <p className="mt-2 text-[11px] text-slate-400 truncate">
          {session.suggested_tests.slice(0, 4).join(' · ')}
          {session.suggested_tests.length > 4 ? ` +${session.suggested_tests.length - 4}` : ''}
        </p>
      )}

      <div className="mt-3 pt-3 border-t border-slate-100/80 flex items-center justify-between">
        <button
          onClick={e => { e.stopPropagation(); onViewLog(session); }}
          className="text-[11px] text-teal-600 hover:text-teal-800 font-semibold flex items-center gap-1 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Zm3.75 11.625a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
          </svg>
          Agent Log
        </button>
        <svg className="w-4 h-4 text-slate-300 group-hover:text-teal-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
        </svg>
      </div>
    </div>
  );
}

export default function DoctorDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile]       = useState(null);
  const [sessions, setSessions]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [logSession, setLogSession] = useState(null);

  useEffect(() => {
    Promise.all([
      api.get('/doctor-assist/profile'),
      api.get('/doctor-assist/sessions'),
    ])
      .then(([profileRes, sessionsRes]) => {
        setProfile(profileRes.data.profile);
        setSessions(sessionsRes.data.sessions || []);
      })
      .catch(() => toast.error('Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, []);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-400 font-medium">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const urgentCount = sessions.reduce((acc, s) => {
    const r = s.patient_summary?.results || [];
    return acc + r.filter(t => t.urgency === 'urgent' || t.urgency === 'critical').length;
  }, 0);
  const totalTests = sessions.reduce((acc, s) => acc + (s.suggested_tests?.length || 0), 0);

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-10">
      {/* ── Hero Banner ── */}
      <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-slate-900 via-teal-900 to-slate-900">
        <div className="absolute top-0 right-0 w-96 h-96 bg-teal-400/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-400/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/4" />

        <div className="relative px-6 sm:px-8 py-8">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-teal-500/20 backdrop-blur-sm rounded-2xl flex items-center justify-center ring-1 ring-white/15 text-2xl font-bold text-white shrink-0">
                {(user?.name || 'D').charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-teal-400 text-sm font-medium tracking-wide">{greeting()}</p>
                <h1 className="text-2xl sm:text-3xl font-bold text-white mt-0.5">
                  Dr. {user?.name || profile?.full_name || 'Doctor'}
                </h1>
                {profile && (
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    {profile.specialization && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white/10 rounded-lg text-xs text-teal-200 font-medium backdrop-blur-sm">
                        {profile.specialization}
                      </span>
                    )}
                    {profile.hospital_name && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white/10 rounded-lg text-xs text-slate-300 font-medium backdrop-blur-sm">
                        {profile.hospital_name}
                      </span>
                    )}
                    {profile.city && (
                      <span className="text-xs text-slate-400">{profile.city}{profile.state ? `, ${profile.state}` : ''}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={() => navigate('/doctor/profile')}
              className="shrink-0 flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-all border border-white/10 backdrop-blur-sm"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
              </svg>
              View Profile
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 mt-6">
            <div className="bg-white/5 backdrop-blur-md rounded-xl px-4 py-3.5 text-center border border-white/10 hover:bg-white/10 transition-colors">
              <p className="text-2xl font-bold text-white">{sessions.length}</p>
              <p className="text-[11px] text-slate-400 mt-0.5 font-medium">Total Sessions</p>
            </div>
            <div className="bg-white/5 backdrop-blur-md rounded-xl px-4 py-3.5 text-center border border-white/10 hover:bg-white/10 transition-colors">
              <p className="text-2xl font-bold text-amber-400">{urgentCount}</p>
              <p className="text-[11px] text-slate-400 mt-0.5 font-medium">Urgent / Critical</p>
            </div>
            <div className="bg-white/5 backdrop-blur-md rounded-xl px-4 py-3.5 text-center border border-white/10 hover:bg-white/10 transition-colors">
              <p className="text-2xl font-bold text-emerald-400">{totalTests}</p>
              <p className="text-[11px] text-slate-400 mt-0.5 font-medium">Tests Suggested</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Prompt to complete profile ── */}
      {!profile && (
        <div className="bg-amber-50 border border-amber-200/60 rounded-2xl p-5 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold text-amber-800">Complete your clinic profile</p>
              <p className="text-xs text-amber-600">Add your specialization and clinic details so patients can find you.</p>
            </div>
          </div>
          <button onClick={() => navigate('/doctor/profile')}
            className="shrink-0 bg-amber-600 text-white font-bold text-sm px-5 py-2.5 rounded-xl hover:bg-amber-700 transition-all shadow-sm">
            Set Up Profile
          </button>
        </div>
      )}

      {/* ── Disclaimer ── */}
      <div className="bg-amber-50/80 border border-amber-200/50 rounded-xl px-4 py-2.5 text-[11px] text-amber-600 font-medium">
        MedAssist AI is an educational tool for CS 595 — AI suggestions are not a substitute for clinical judgment.
      </div>

      {/* ── New Assist CTA ── */}
      <div
        onClick={() => navigate('/doctor/assist')}
        className="group relative bg-gradient-to-br from-teal-600 to-emerald-600 rounded-2xl p-6 cursor-pointer
                   hover:from-teal-700 hover:to-emerald-700 transition-all shadow-lg shadow-teal-500/20 hover:shadow-xl hover:shadow-teal-500/30 overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4" />
        <div className="relative flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-white/15 backdrop-blur-sm rounded-2xl flex items-center justify-center shrink-0 ring-1 ring-white/20">
              <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0 1 12 15a9.065 9.065 0 0 0-6.23.693L5 14.5m14.8.8 1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0 1 12 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
              </svg>
            </div>
            <div className="text-white">
              <h2 className="text-lg font-bold">New Patient Assist</h2>
              <p className="text-sm text-teal-100/80 mt-0.5">Enter a case and let AI flag missing blood tests</p>
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-2 bg-white text-teal-700 font-bold px-6 py-3 rounded-xl shadow-lg group-hover:shadow-xl transition-all text-sm whitespace-nowrap">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Assist Session
          </div>
        </div>
      </div>

      {/* ── Recent Sessions ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-slate-700">
            Recent Sessions
            {sessions.length > 0 && (
              <span className="ml-2 text-xs font-normal text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{sessions.length}</span>
            )}
          </h2>
        </div>

        {sessions.length === 0 ? (
          <div className="bg-white border border-slate-200/60 rounded-2xl p-14 text-center">
            <div className="w-16 h-16 bg-gradient-to-br from-teal-50 to-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4 ring-1 ring-teal-100">
              <svg className="w-8 h-8 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-slate-700 mb-1">No assist sessions yet</h3>
            <p className="text-sm text-slate-400 mb-5">Start by entering a patient case above</p>
            <button onClick={() => navigate('/doctor/assist')}
              className="text-teal-600 text-sm font-semibold hover:text-teal-700 transition-colors">
              Start your first session →
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sessions.map((session, i) => (
              <SessionCard
                key={session.id}
                session={session}
                index={i}
                onClick={() => navigate('/doctor/assist', { state: { sessionResult: session } })}
                onViewLog={s => setLogSession(s)}
              />
            ))}
          </div>
        )}
      </div>

      {logSession && (
        <AgentLogModal sessionId={logSession.id} agentName="Doctor Assist Agent" onClose={() => setLogSession(null)} />
      )}
    </div>
  );
}
