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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchMedicalID = async () => {
      try {
        const { data } = await api.get('/patient/medical-id');
        if (data.medicalId) {
          setForm({
            emergency_name: data.medicalId.emergency_name || '',
            emergency_phone: data.medicalId.emergency_phone || '',
            blood_type: data.medicalId.blood_type || '',
            organ_donor: data.medicalId.organ_donor || false,
            critical_notes: data.medicalId.critical_notes || '',
            pin: '',
          });
        }
      } catch {
        // First time — form starts empty
      } finally {
        setLoading(false);
      }
    };
    fetchMedicalID();
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
    setSaving(true);
    try {
      await api.put('/patient/medical-id', form);
      toast.success('Medical ID updated');
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
        <p className="text-sm text-slate-500 mt-1">Emergency information accessible via a shareable link</p>
      </div>

      {/* Share Link Card */}
      <div className="bg-gradient-to-r from-teal-50 to-amber-50 border border-teal-100 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Shareable Emergency Link</h3>
        <div className="flex items-center gap-2">
          <input
            type="text"
            readOnly
            value={shareLink}
            className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-600 font-mono truncate"
          />
          <button
            onClick={copyLink}
            className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-xl transition-colors shrink-0"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-2">Anyone with this link will need your PIN to view your emergency info.</p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-5">
        <h2 className="text-lg font-semibold text-slate-800 border-b border-slate-100 pb-3">Emergency Information</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Emergency Contact Name</label>
            <input
              type="text"
              name="emergency_name"
              value={form.emergency_name}
              onChange={handleChange}
              placeholder="Jane Doe"
              className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Emergency Contact Phone</label>
            <input
              type="tel"
              name="emergency_phone"
              value={form.emergency_phone}
              onChange={handleChange}
              placeholder="+1 (555) 123-4567"
              className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Blood Type</label>
            <select
              name="blood_type"
              value={form.blood_type}
              onChange={handleChange}
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
                  type="checkbox"
                  name="organ_donor"
                  checked={form.organ_donor}
                  onChange={handleChange}
                  className="sr-only peer"
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
            name="critical_notes"
            value={form.critical_notes}
            onChange={handleChange}
            rows={3}
            placeholder="e.g., Allergic to penicillin, diabetic, pacemaker"
            className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
          />
        </div>

        <div className="border-t border-slate-100 pt-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-2">Access PIN</h3>
          <p className="text-xs text-slate-400 mb-2">Set a 4-digit PIN to protect your public Medical ID page. Leave blank to keep current PIN.</p>
          <input
            type="password"
            name="pin"
            value={form.pin}
            onChange={handleChange}
            maxLength={4}
            pattern="\d{4}"
            placeholder="4-digit PIN"
            className="w-32 border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl transition-colors"
        >
          {saving ? 'Saving...' : 'Save Medical ID'}
        </button>
      </form>
    </motion.div>
  );
}
