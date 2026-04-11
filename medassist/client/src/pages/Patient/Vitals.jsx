import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import api from '../../services/api';

const fadeIn = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

const VITAL_TYPES = [
  { value: 'blood_pressure', label: 'Blood Pressure', unit: 'mmHg', dual: true },
  { value: 'glucose', label: 'Blood Glucose', unit: 'mg/dL' },
  { value: 'weight', label: 'Weight', unit: 'kg' },
  { value: 'heart_rate', label: 'Heart Rate', unit: 'bpm' },
  { value: 'spo2', label: 'SpO2', unit: '%' },
  { value: 'temperature', label: 'Temperature', unit: '\u00B0F' },
];

const NORMAL_RANGES = {
  blood_pressure: 'Systolic: 90-120, Diastolic: 60-80',
  glucose: '70 - 100 mg/dL (fasting)',
  weight: 'Varies by individual',
  heart_rate: '60 - 100 bpm',
  spo2: '95 - 100%',
  temperature: '97.8 - 99.1\u00B0F',
};

export default function Vitals() {
  const [selectedType, setSelectedType] = useState('blood_pressure');
  const [values, setValues] = useState({ value: '', systolic: '', diastolic: '' });
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const typeConfig = VITAL_TYPES.find((t) => t.value === selectedType);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/patient/vitals?type=${selectedType}&days=30`);
      const formatted = (data.vitals || []).map((v) => ({
        date: new Date(v.recorded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        value: v.value,
        systolic: v.value,     // DB stores systolic in 'value'
        diastolic: v.value2,   // DB stores diastolic in 'value2'
      }));
      setChartData(formatted.reverse()); // chronological order for chart
    } catch {
      // silent — chart just stays empty
    } finally {
      setLoading(false);
    }
  }, [selectedType]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = { type: selectedType };
      if (typeConfig.dual) {
        payload.value = Number(values.systolic);   // systolic as primary
        payload.value2 = Number(values.diastolic); // diastolic as secondary
      } else {
        payload.value = Number(values.value);
      }
      await api.post('/patient/vitals', payload);
      toast.success(`${typeConfig.label} recorded`);
      setValues({ value: '', systolic: '', diastolic: '' });
      fetchData();
    } catch (err) {
      toast.error(err.message || 'Failed to save vital');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div variants={fadeIn} initial="hidden" animate="visible" className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Health Vitals Tracker</h1>
        <p className="text-sm text-slate-500 mt-1">Monitor your vitals over time</p>
      </div>

      {/* Type Selector */}
      <div className="flex flex-wrap gap-2">
        {VITAL_TYPES.map((t) => (
          <button
            key={t.value}
            onClick={() => { setSelectedType(t.value); setValues({ value: '', systolic: '', diastolic: '' }); }}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              selectedType === t.value
                ? 'bg-teal-600 text-white shadow-md'
                : 'bg-white text-slate-600 border border-slate-200 hover:border-teal-300 hover:text-teal-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Entry Form */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6"
        >
          <h2 className="text-lg font-semibold text-slate-800 mb-1">Record {typeConfig.label}</h2>
          <p className="text-xs text-slate-400 mb-4">Normal: {NORMAL_RANGES[selectedType]}</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {typeConfig.dual ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Systolic</label>
                  <input
                    type="number"
                    value={values.systolic}
                    onChange={(e) => setValues({ ...values, systolic: e.target.value })}
                    required
                    placeholder="120"
                    className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Diastolic</label>
                  <input
                    type="number"
                    value={values.diastolic}
                    onChange={(e) => setValues({ ...values, diastolic: e.target.value })}
                    required
                    placeholder="80"
                    className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Value ({typeConfig.unit})
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={values.value}
                  onChange={(e) => setValues({ ...values, value: e.target.value })}
                  required
                  placeholder="Enter value"
                  className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl transition-colors"
            >
              {submitting ? 'Saving...' : 'Record Vital'}
            </button>
          </form>
        </motion.div>

        {/* Chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-1">
            {typeConfig.label} — Last 30 Days
          </h2>
          <p className="text-xs text-slate-400 mb-4">Unit: {typeConfig.unit}</p>

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : chartData.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
              No data yet. Start recording your {typeConfig.label.toLowerCase()} above.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <Tooltip
                  contentStyle={{
                    borderRadius: '12px',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  }}
                />
                <Legend />
                {typeConfig.dual ? (
                  <>
                    <Line type="monotone" dataKey="systolic" stroke="#0D9488" strokeWidth={2} dot={{ r: 4, fill: '#0D9488' }} name="Systolic" />
                    <Line type="monotone" dataKey="diastolic" stroke="#F59E0B" strokeWidth={2} dot={{ r: 4, fill: '#F59E0B' }} name="Diastolic" />
                  </>
                ) : (
                  <Line type="monotone" dataKey="value" stroke="#0D9488" strokeWidth={2} dot={{ r: 4, fill: '#0D9488' }} name={typeConfig.label} />
                )}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </motion.div>
  );
}
