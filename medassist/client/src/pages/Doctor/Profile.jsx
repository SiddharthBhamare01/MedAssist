import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';

const inputClass = 'w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400 transition-all placeholder:text-slate-400';
const labelClass = 'block text-xs font-semibold text-slate-500 mb-1.5';

function InfoRow({ icon, label, value }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-slate-100 last:border-0">
      <div className="w-8 h-8 bg-teal-50 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
        <span className="text-sm">{icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
        <p className="text-sm text-slate-800 font-medium mt-0.5">{value || '—'}</p>
      </div>
    </div>
  );
}

export default function DoctorProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState({ sessions: 0, urgent: 0, tests: 0 });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const { register, handleSubmit, reset } = useForm();

  useEffect(() => {
    Promise.all([
      api.get('/doctor-assist/profile'),
      api.get('/doctor-assist/sessions'),
    ])
      .then(([profileRes, sessionsRes]) => {
        const p = profileRes.data.profile;
        setProfile(p);
        if (p) {
          reset({
            specialization: p.specialization || '',
            hospital_name: p.hospital_name || '',
            city: p.city || '',
            state: p.state || '',
            phone: p.phone || '',
          });
        }
        const sessions = sessionsRes.data.sessions || [];
        const urgent = sessions.reduce((acc, s) => {
          const r = s.patient_summary?.results || [];
          return acc + r.filter(t => t.urgency === 'urgent' || t.urgency === 'critical').length;
        }, 0);
        const tests = sessions.reduce((acc, s) => acc + (s.suggested_tests?.length || 0), 0);
        setStats({ sessions: sessions.length, urgent, tests });
      })
      .catch(() => toast.error('Failed to load profile'))
      .finally(() => setLoading(false));
  }, []);

  async function onSubmit(data) {
    setSaving(true);
    try {
      const res = await api.put('/doctor-assist/profile', data);
      setProfile(res.data.profile);
      setEditing(false);
      toast.success('Profile updated!');
    } catch {
      toast.error('Failed to save profile');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-400">Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-10">
      {/* Hero */}
      <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-slate-900 via-teal-900 to-slate-900">
        <div className="absolute top-0 right-0 w-72 h-72 bg-teal-400/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-emerald-400/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/4" />

        <div className="relative px-6 sm:px-8 py-8">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-teal-500/20 backdrop-blur-sm rounded-2xl flex items-center justify-center ring-1 ring-white/15 text-3xl font-bold text-white">
                {(user?.name || 'D').charAt(0).toUpperCase()}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Dr. {user?.name || 'Doctor'}</h1>
                <p className="text-slate-400 text-sm mt-0.5">{user?.email}</p>
                {profile?.specialization && (
                  <span className="inline-flex items-center gap-1.5 mt-1.5 px-2.5 py-0.5 bg-teal-500/15 text-teal-300 rounded-lg text-xs font-semibold backdrop-blur-sm ring-1 ring-teal-500/20">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                    {profile.specialization}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => setEditing(v => !v)}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-all border border-white/10 backdrop-blur-sm"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
              </svg>
              {editing ? 'Cancel' : 'Edit Profile'}
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 mt-6">
            <div className="bg-white/5 backdrop-blur-md rounded-xl px-4 py-3.5 text-center border border-white/10">
              <p className="text-2xl font-bold text-white">{stats.sessions}</p>
              <p className="text-[11px] text-slate-400 mt-0.5 font-medium">Assist Sessions</p>
            </div>
            <div className="bg-white/5 backdrop-blur-md rounded-xl px-4 py-3.5 text-center border border-white/10">
              <p className="text-2xl font-bold text-amber-400">{stats.urgent}</p>
              <p className="text-[11px] text-slate-400 mt-0.5 font-medium">Urgent Flags</p>
            </div>
            <div className="bg-white/5 backdrop-blur-md rounded-xl px-4 py-3.5 text-center border border-white/10">
              <p className="text-2xl font-bold text-emerald-400">{stats.tests}</p>
              <p className="text-[11px] text-slate-400 mt-0.5 font-medium">Tests Suggested</p>
            </div>
          </div>
        </div>
      </div>

      {editing ? (
        /* ── Edit Mode ── */
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6 space-y-5">
            <h2 className="text-sm font-bold text-slate-700 pb-3 border-b border-slate-100">Clinic Information</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Specialization</label>
                <input {...register('specialization')} placeholder="e.g. Cardiologist" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Hospital / Clinic</label>
                <input {...register('hospital_name')} placeholder="e.g. City General Hospital" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>City</label>
                <input {...register('city')} placeholder="e.g. Phoenix" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>State</label>
                <input {...register('state')} placeholder="e.g. AZ" className={inputClass} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Phone</label>
                <input {...register('phone')} placeholder="e.g. (602) 555-0100" className={inputClass} />
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button type="submit" disabled={saving}
              className="bg-teal-600 text-white font-bold text-sm px-8 py-3 rounded-xl hover:bg-teal-700 disabled:opacity-50 transition-all shadow-md hover:shadow-lg">
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
            <button type="button" onClick={() => setEditing(false)}
              className="text-slate-500 font-medium text-sm px-6 py-3 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        /* ── View Mode ── */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
            <h2 className="text-sm font-bold text-slate-700 pb-3 mb-1 border-b border-slate-100">Clinic Details</h2>
            <InfoRow icon="🏥" label="Specialization" value={profile?.specialization} />
            <InfoRow icon="🏢" label="Hospital / Clinic" value={profile?.hospital_name} />
            <InfoRow icon="📍" label="Location" value={profile?.city ? `${profile.city}, ${profile.state || ''}` : null} />
            <InfoRow icon="📞" label="Phone" value={profile?.phone} />
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
            <h2 className="text-sm font-bold text-slate-700 pb-3 mb-1 border-b border-slate-100">Account Details</h2>
            <InfoRow icon="👤" label="Full Name" value={user?.name} />
            <InfoRow icon="📧" label="Email" value={user?.email} />
            <InfoRow icon="🔑" label="Role" value="Doctor" />
            <InfoRow icon="✅" label="Status" value={profile?.available !== false ? 'Available' : 'Unavailable'} />
          </div>
        </div>
      )}

      {!profile && !editing && (
        <div className="bg-teal-50 border border-teal-200 rounded-2xl p-8 text-center">
          <div className="w-14 h-14 bg-teal-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <svg className="w-7 h-7 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
            </svg>
          </div>
          <h3 className="text-base font-bold text-teal-800 mb-1">Complete Your Profile</h3>
          <p className="text-sm text-teal-600 mb-4">Set up your clinic details so patients can find and reach you.</p>
          <button onClick={() => setEditing(true)}
            className="bg-teal-600 text-white font-bold text-sm px-6 py-2.5 rounded-xl hover:bg-teal-700 transition-all shadow-md">
            Set Up Profile
          </button>
        </div>
      )}
    </div>
  );
}
