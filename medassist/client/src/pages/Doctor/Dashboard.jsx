import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import AgentLogModal from '../../components/AgentLogModal';

const URGENCY_STYLE = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  urgent:   'bg-orange-100 text-orange-700 border-orange-200',
  routine:  'bg-green-100 text-green-700 border-green-200',
};

function UrgencyBadge({ urgency }) {
  const cls = URGENCY_STYLE[urgency] || 'bg-gray-100 text-gray-600 border-gray-200';
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${cls} uppercase tracking-wide`}>
      {urgency}
    </span>
  );
}

function SessionCard({ session, onClick, onViewLog }) {
  const summary = session.patient_summary || {};
  const results = summary.results || [];
  const date = new Date(session.created_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
  const time = new Date(session.created_at).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 hover:border-blue-300 hover:shadow-md transition-all">
      <div className="flex items-start justify-between gap-4 cursor-pointer" onClick={onClick}>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm truncate">
            {summary.chiefComplaint || 'Patient Case'}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {summary.age ? `${summary.age}yr` : '—'}
            {summary.gender ? ` · ${summary.gender}` : ''}
            {summary.symptoms ? ` · ${summary.symptoms.slice(0, 50)}…` : ''}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs font-medium text-gray-700">{date}</p>
          <p className="text-xs text-gray-400">{time}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5 cursor-pointer" onClick={onClick}>
        {results.slice(0, 4).map((r, i) => (
          <UrgencyBadge key={i} urgency={r.urgency} />
        ))}
        {results.length > 0 && (
          <span className="text-xs text-gray-500 self-center">
            {results.length} test{results.length !== 1 ? 's' : ''} suggested
          </span>
        )}
      </div>

      {session.suggested_tests?.length > 0 && (
        <p className="mt-2 text-xs text-gray-400 truncate cursor-pointer" onClick={onClick}>
          {session.suggested_tests.slice(0, 5).join(' · ')}
          {session.suggested_tests.length > 5 ? ` +${session.suggested_tests.length - 5} more` : ''}
        </p>
      )}

      {/* View Agent Log button */}
      <div className="mt-3 pt-3 border-t border-gray-100">
        <button
          onClick={e => { e.stopPropagation(); onViewLog(session); }}
          className="text-xs text-purple-600 hover:text-purple-800 font-medium flex items-center gap-1 hover:underline"
        >
          🔍 View Agent Log
        </button>
      </div>
    </div>
  );
}

function ProfileEditPanel({ profile, onSave, onCancel }) {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: {
      specialization: profile?.specialization || '',
      hospital_name:  profile?.hospital_name  || '',
      city:           profile?.city           || '',
      state:          profile?.state          || '',
      phone:          profile?.phone          || '',
    },
  });

  async function onSubmit(data) {
    try {
      const res = await api.put('/doctor-assist/profile', data);
      toast.success('Profile updated!');
      onSave(res.data.profile);
    } catch {
      toast.error('Failed to update profile');
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}
      className="bg-white border border-blue-200 rounded-2xl p-6 space-y-4">
      <h3 className="font-bold text-gray-900">Edit Clinic Profile</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Specialization</label>
          <input {...register('specialization')} placeholder="e.g. Cardiologist"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Hospital / Clinic</label>
          <input {...register('hospital_name')} placeholder="e.g. City General Hospital"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">City</label>
          <input {...register('city')} placeholder="e.g. Phoenix"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">State</label>
          <input {...register('state')} placeholder="e.g. AZ"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
          <input {...register('phone')} placeholder="e.g. (602) 555-0100"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>
      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={isSubmitting}
          className="bg-blue-600 text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
          {isSubmitting ? 'Saving…' : 'Save Profile'}
        </button>
        <button type="button" onClick={onCancel}
          className="text-gray-600 text-sm px-5 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors">
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function DoctorDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile]       = useState(null);
  const [sessions, setSessions]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [editingProfile, setEditingProfile] = useState(false);
  const [logSession, setLogSession] = useState(null); // session whose log is open

  useEffect(() => {
    async function load() {
      try {
        const [profileRes, sessionsRes] = await Promise.all([
          api.get('/doctor-assist/profile'),
          api.get('/doctor-assist/sessions'),
        ]);
        setProfile(profileRes.data.profile);
        setSessions(sessionsRes.data.sessions || []);
        // Prompt to complete profile if missing
        if (!profileRes.data.profile) setEditingProfile(true);
      } catch (err) {
        toast.error('Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="animate-spin w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header banner */}
      <div className="bg-gradient-to-r from-blue-700 to-blue-500 text-white px-6 py-8">
        <div className="max-w-5xl mx-auto flex items-start justify-between gap-4">
          <div>
            <p className="text-blue-200 text-sm font-medium mb-1">{greeting()},</p>
            <h1 className="text-3xl font-bold">{user?.name || profile?.full_name || 'Doctor'}</h1>
            {profile ? (
              <p className="text-blue-100 text-sm mt-1">
                {profile.specialization && <span>{profile.specialization}</span>}
                {profile.hospital_name  && <span> · {profile.hospital_name}</span>}
                {profile.city           && <span> · {profile.city}, {profile.state}</span>}
                {profile.phone          && <span> · {profile.phone}</span>}
              </p>
            ) : (
              <p className="text-blue-200 text-sm mt-1 italic">No clinic profile yet — add your details below</p>
            )}
          </div>
          <button
            onClick={() => setEditingProfile(v => !v)}
            className="shrink-0 bg-white/20 hover:bg-white/30 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors border border-white/30"
          >
            {editingProfile ? '✕ Cancel Edit' : '✏️ Edit Profile'}
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">

        {/* Inline profile editor */}
        {editingProfile && (
          <ProfileEditPanel
            profile={profile}
            onSave={updated => { setProfile(updated); setEditingProfile(false); }}
            onCancel={() => setEditingProfile(false)}
          />
        )}

        {/* Disclaimer */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 text-xs text-yellow-700">
          ⚠️ MedAssist AI is an educational tool for CS 595 — Medical Informatics & AI.
          AI suggestions are not a substitute for clinical judgment.
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4" aria-label="Dashboard statistics">
          <div className="bg-white rounded-xl border border-gray-200 p-5 text-center" aria-label="Total sessions">
            <p className="text-3xl font-bold text-blue-600">{sessions.length}</p>
            <p className="text-xs text-gray-500 mt-1">Total Sessions</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5 text-center" aria-label="Urgent or critical tests flagged">
            <p className="text-3xl font-bold text-orange-500">
              {sessions.reduce((acc, s) => {
                const r = s.patient_summary?.results || [];
                return acc + r.filter(t => t.urgency === 'urgent' || t.urgency === 'critical').length;
              }, 0)}
            </p>
            <p className="text-xs text-gray-500 mt-1">Urgent/Critical Tests Flagged</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5 text-center col-span-2 sm:col-span-1" aria-label="Total tests suggested">
            <p className="text-3xl font-bold text-green-600">
              {sessions.reduce((acc, s) => acc + (s.suggested_tests?.length || 0), 0)}
            </p>
            <p className="text-xs text-gray-500 mt-1">Total Tests Suggested</p>
          </div>
        </div>

        {/* New Patient Assist CTA */}
        <div className="bg-white border-2 border-dashed border-blue-200 rounded-xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">New Patient Assist</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Enter a patient case and let the AI flag missing blood tests from the prescription.
            </p>
          </div>
          <button
            onClick={() => navigate('/doctor/assist')}
            className="shrink-0 bg-blue-600 text-white font-semibold px-6 py-3 rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
          >
            + New Assist Session
          </button>
        </div>

        {/* Recent sessions */}
        <div>
          <h2 className="text-lg font-bold text-gray-900 mb-4">
            Recent Sessions
            {sessions.length > 0 && (
              <span className="ml-2 text-sm font-normal text-gray-400">({sessions.length})</span>
            )}
          </h2>

          {sessions.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
              <div className="text-4xl mb-3">🩺</div>
              <p className="text-gray-500 text-sm">No assist sessions yet.</p>
              <button
                onClick={() => navigate('/doctor/assist')}
                className="mt-4 text-blue-600 text-sm underline"
              >
                Start your first session →
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map(session => (
                <SessionCard
                  key={session.id}
                  session={session}
                  onClick={() => navigate('/doctor/assist', { state: { sessionResult: session } })}
                  onViewLog={s => setLogSession(s)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Agent Log Modal */}
      {logSession && (
        <AgentLogModal
          sessionId={logSession.id}
          agentName="Doctor Assist Agent"
          onClose={() => setLogSession(null)}
        />
      )}
    </div>
  );
}
