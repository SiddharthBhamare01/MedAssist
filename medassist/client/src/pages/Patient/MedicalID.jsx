import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';

const fadeIn = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export default function MedicalID() {
  const { user } = useAuth();
  const [form, setForm] = useState({
    emergency_name: '',
    emergency_phone: '',
    blood_type: '',
    organ_donor: false,
    critical_notes: '',
    pin: '',
  });
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [copied,    setCopied]    = useState(false);
  const [hasPinSet, setHasPinSet] = useState(false);
  const [isNew,     setIsNew]     = useState(true);
  const [qrUrl,     setQrUrl]     = useState(null);

  const fetchQr = async () => {
    try {
      const res = await api.get('/patient/medical-id/qr', { responseType: 'blob' });
      setQrUrl(URL.createObjectURL(res.data));
    } catch { /* ignore — QR is non-critical */ }
  };

  useEffect(() => {
    const load = async () => {
      try {
        // Load medical ID and patient profile in parallel
        const [midRes, profileRes] = await Promise.allSettled([
          api.get('/patient/medical-id'),
          api.get('/patient/profile'),
        ]);

        const mid     = midRes.status === 'fulfilled' ? midRes.value.data.medicalId : null;
        const profile = profileRes.status === 'fulfilled' ? profileRes.value.data.profile : null;

        if (mid) {
          setIsNew(false);
          const pinSet = !!mid.has_pin_set;
          setHasPinSet(pinSet);
          if (pinSet) fetchQr();
          setForm({
            emergency_name:  mid.emergency_name  || '',
            emergency_phone: mid.emergency_phone || '',
            blood_type:      mid.blood_type      || (profile?.blood_group || ''),
            organ_donor:     mid.organ_donor     || false,
            critical_notes:  mid.critical_notes  || '',
            pin: '',
          });
        } else if (profile) {
          // Pre-fill from profile for a new Medical ID
          setForm(prev => ({
            ...prev,
            blood_type:     profile.blood_group || '',
            critical_notes: profile.allergies?.length
              ? `Allergies: ${profile.allergies.join(', ')}`
              : '',
          }));
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm({ ...form, [name]: type === 'checkbox' ? checked : value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.pin && form.pin.length !== 4) {
      toast.error('PIN must be exactly 4 digits');
      return;
    }
    if (isNew && !form.pin) {
      toast.error('Set a 4-digit PIN so the public link works');
      return;
    }
    setSaving(true);
    try {
      await api.put('/patient/medical-id', form);
      if (form.pin) { setHasPinSet(true); fetchQr(); }
      setIsNew(false);
      toast.success('Medical ID saved');
    } catch (err) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const shareLink = `${window.location.origin}/medical-id/${user?.id}`;

  const copyLink = () => {
    navigator.clipboard.writeText(shareLink);
    setCopied(true);
    toast.success('Link copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <motion.div variants={fadeIn} initial="hidden" animate="visible" className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Medical ID</h1>
        <p className="text-sm text-slate-500 mt-1">Emergency information accessible by first responders via a shareable link</p>
      </div>

      {/* Share Link Card */}
      <div className={`rounded-2xl p-5 border ${isNew ? 'bg-slate-50 border-slate-200' : hasPinSet ? 'bg-teal-50 border-teal-200/60' : 'bg-amber-50 border-amber-200'}`}>
        <div className="flex items-center gap-2 mb-3">
          <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${isNew ? 'bg-slate-200' : hasPinSet ? 'bg-teal-100' : 'bg-amber-100'}`}>
            {isNew ? (
              <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
              </svg>
            ) : hasPinSet ? (
              <svg className="w-3.5 h-3.5 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
            )}
          </div>
          <h3 className={`text-sm font-semibold ${isNew ? 'text-slate-600' : hasPinSet ? 'text-teal-800' : 'text-amber-800'}`}>
            {isNew ? 'Save your Medical ID to activate this link'
              : hasPinSet ? 'Shareable Emergency Link — Active'
              : 'PIN not set — link will not work'}
          </h3>
          {!isNew && hasPinSet && (
            <span className="ml-auto text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
              PIN set ✓
            </span>
          )}
        </div>

        {isNew ? (
          <p className="text-xs text-slate-500">Fill in your emergency information and set a PIN below, then save.</p>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <input
                type="text" readOnly value={shareLink}
                className="flex-1 bg-white border border-teal-200/80 rounded-xl px-3 py-2 text-sm text-slate-600 font-mono truncate focus:outline-none"
              />
              <button
                onClick={copyLink}
                disabled={!hasPinSet}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors shrink-0"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            {hasPinSet
              ? <p className="text-xs text-teal-600/70 mt-2">Anyone with this link must enter your PIN to view emergency info.</p>
              : <p className="text-xs text-amber-700 mt-2">Set a PIN in the Access PIN section below, then save — the link won't work until then.</p>
            }
            {hasPinSet && qrUrl && (
              <div className="mt-4 flex items-center gap-4">
                <img
                  src={qrUrl}
                  alt="QR code for Medical ID"
                  className="w-24 h-24 rounded-xl border border-teal-200 bg-white p-1"
                />
                <p className="text-xs text-slate-500 leading-relaxed">
                  Save or print this QR code. First responders can scan it to open your emergency page directly — no typing needed.
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 shadow p-6 space-y-5">
        <h2 className="text-lg font-semibold text-slate-800 border-b border-slate-200 pb-3">Emergency Information</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Emergency Contact Name</label>
            <input
              type="text" name="emergency_name" value={form.emergency_name} onChange={handleChange}
              placeholder="Jane Doe"
              className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Emergency Contact Phone</label>
            <input
              type="tel" name="emergency_phone" value={form.emergency_phone} onChange={handleChange}
              placeholder="+1 (555) 123-4567"
              className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Blood Type</label>
            <select
              name="blood_type" value={form.blood_type} onChange={handleChange}
              className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white"
            >
              <option value="">Select blood type</option>
              {BLOOD_TYPES.map((bt) => (
                <option key={bt} value={bt}>{bt}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-3 cursor-pointer py-2.5">
              <div className="relative">
                <input
                  type="checkbox" name="organ_donor" checked={form.organ_donor}
                  onChange={handleChange} className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 rounded-full peer-checked:bg-teal-600 transition-colors" />
                <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow peer-checked:translate-x-5 transition-transform" />
              </div>
              <span className="text-sm font-medium text-slate-700">Organ Donor</span>
            </label>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Critical Notes / Allergies</label>
          <textarea
            name="critical_notes" value={form.critical_notes} onChange={handleChange}
            rows={3}
            placeholder="e.g., Allergic to penicillin, diabetic, pacemaker"
            className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
          />
        </div>

        <div className="border-t border-slate-200 pt-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-slate-700">Access PIN</h3>
            {hasPinSet && (
              <span className="text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                PIN currently set ✓
              </span>
            )}
            {!hasPinSet && !isNew && (
              <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                No PIN — set one to enable sharing
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mb-2">
            {hasPinSet ? 'Enter a new 4-digit PIN to change it, or leave blank to keep the current one.'
              : 'Required — set a 4-digit PIN to protect your public emergency page.'}
          </p>
          <input
            type="password" name="pin" value={form.pin} onChange={handleChange}
            maxLength={4} pattern="\d{4}"
            placeholder={hasPinSet ? '••••  (leave blank to keep)' : '4-digit PIN (required)'}
            className="w-48 border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          />
        </div>

        <button
          type="submit" disabled={saving}
          className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl transition-colors"
        >
          {saving ? 'Saving...' : isNew ? 'Create Medical ID' : 'Save Changes'}
        </button>
      </form>
    </motion.div>
  );
}
