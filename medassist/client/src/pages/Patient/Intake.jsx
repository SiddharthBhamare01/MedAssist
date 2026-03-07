import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../services/api';

// ── Symptom data: 7 body systems ─────────────────────────────────────────────
const SYMPTOM_SYSTEMS = [
  {
    system: 'General',
    icon: '🌡️',
    symptoms: ['Fever', 'Fatigue', 'Weight Loss', 'Weight Gain', 'Night Sweats', 'Loss of Appetite', 'Weakness'],
  },
  {
    system: 'Head & Neurological',
    icon: '🧠',
    symptoms: ['Headache', 'Dizziness', 'Confusion', 'Memory Loss', 'Seizures', 'Numbness / Tingling'],
  },
  {
    system: 'Chest & Heart',
    icon: '❤️',
    symptoms: ['Chest Pain', 'Shortness of Breath', 'Palpitations', 'Cough', 'Wheezing'],
  },
  {
    system: 'Digestive',
    icon: '🫃',
    symptoms: ['Nausea', 'Vomiting', 'Diarrhea', 'Constipation', 'Abdominal Pain', 'Bloating', 'Heartburn'],
  },
  {
    system: 'Musculoskeletal',
    icon: '🦴',
    symptoms: ['Joint Pain', 'Muscle Pain', 'Back Pain', 'Swelling', 'Stiffness'],
  },
  {
    system: 'Skin',
    icon: '🩹',
    symptoms: ['Rash', 'Itching', 'Yellowing (Jaundice)', 'Pale Skin', 'Bruising'],
  },
  {
    system: 'Urinary & Other',
    icon: '🫧',
    symptoms: ['Frequent Urination', 'Painful Urination', 'Blood in Urine', 'Increased Thirst', 'Blurred Vision'],
  },
];

const CONDITIONS = [
  'Diabetes', 'Hypertension', 'Asthma', 'Heart Disease',
  'Thyroid Disorder', 'Cancer', 'Arthritis', 'Kidney Disease', 'None',
];

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

// ── Progress Bar ──────────────────────────────────────────────────────────────
function ProgressBar({ step }) {
  const steps = ['Basic Info', 'Medical History', 'Symptoms'];
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-2">
        {steps.map((label, i) => (
          <div key={i} className="flex flex-col items-center flex-1">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all
              ${i + 1 < step ? 'bg-green-500 border-green-500 text-white' :
                i + 1 === step ? 'bg-blue-600 border-blue-600 text-white' :
                'bg-white border-gray-300 text-gray-400'}`}>
              {i + 1 < step ? '✓' : i + 1}
            </div>
            <span className={`text-xs mt-1 font-medium ${i + 1 === step ? 'text-blue-600' : 'text-gray-400'}`}>
              {label}
            </span>
          </div>
        ))}
      </div>
      <div className="relative h-1.5 bg-gray-200 rounded-full">
        <div
          className="absolute h-1.5 bg-blue-600 rounded-full transition-all duration-300"
          style={{ width: `${((step - 1) / 2) * 100}%` }}
        />
      </div>
    </div>
  );
}

// ── Tag Input ─────────────────────────────────────────────────────────────────
function TagInput({ label, tags, onChange, placeholder }) {
  const [input, setInput] = useState('');

  const addTag = () => {
    const val = input.trim();
    if (val && !tags.includes(val)) onChange([...tags, val]);
    setInput('');
  };

  const removeTag = (tag) => onChange(tags.filter((t) => t !== tag));

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="flex flex-wrap gap-2 mb-2">
        {tags.map((tag) => (
          <span key={tag} className="flex items-center gap-1 bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-sm">
            {tag}
            <button type="button" onClick={() => removeTag(tag)} className="text-blue-400 hover:text-blue-700">×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
          placeholder={placeholder}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={addTag}
          className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm hover:bg-blue-200"
        >
          Add
        </button>
      </div>
    </div>
  );
}

// ── Step 1: Basic Info ────────────────────────────────────────────────────────
function Step1({ onNext, defaultValues }) {
  const { register, handleSubmit, formState: { errors } } = useForm({ defaultValues });

  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-5">
      <h2 className="text-xl font-bold text-gray-800 mb-1">Basic Information</h2>
      <p className="text-sm text-gray-500 mb-4">This helps the AI personalise your diagnosis.</p>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Age <span className="text-red-500">*</span></label>
          <input
            type="number"
            min="1" max="120"
            {...register('age', { required: 'Age is required', min: { value: 1, message: 'Enter valid age' }, max: { value: 120, message: 'Enter valid age' } })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {errors.age && <p className="text-red-500 text-xs mt-1">{errors.age.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Gender <span className="text-red-500">*</span></label>
          <select
            {...register('gender', { required: 'Gender is required' })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select…</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
            <option value="prefer-not-to-say">Prefer not to say</option>
          </select>
          {errors.gender && <p className="text-red-500 text-xs mt-1">{errors.gender.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Weight (kg)</label>
          <input
            type="number" step="0.1" min="1"
            {...register('weightKg')}
            placeholder="e.g. 70"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Height (cm)</label>
          <input
            type="number" step="0.1" min="1"
            {...register('heightCm')}
            placeholder="e.g. 170"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Blood Group</label>
        <div className="flex flex-wrap gap-2">
          {BLOOD_GROUPS.map((bg) => (
            <label key={bg} className="cursor-pointer">
              <input type="radio" value={bg} {...register('bloodGroup')} className="sr-only" />
              <span className={`px-3 py-1.5 border-2 rounded-lg text-sm font-medium transition-colors cursor-pointer
                peer-checked:border-blue-600`}>
                {bg}
              </span>
            </label>
          ))}
        </div>
        {/* blood group radio — use watch for highlight; simple version without watch */}
      </div>

      <div className="flex justify-end pt-2">
        <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors">
          Next →
        </button>
      </div>
    </form>
  );
}

// ── Step 2: Medical History ───────────────────────────────────────────────────
function Step2({ onNext, onBack, defaultValues }) {
  const { register, handleSubmit } = useForm({ defaultValues });
  const [allergies, setAllergies] = useState(defaultValues?.allergies || []);
  const [medications, setMedications] = useState(defaultValues?.currentMedications || []);

  const onSubmit = (data) => {
    onNext({ ...data, allergies, currentMedications: medications });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <h2 className="text-xl font-bold text-gray-800 mb-1">Medical History</h2>
      <p className="text-sm text-gray-500 mb-4">Helps the AI avoid unsafe recommendations.</p>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Existing Conditions</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {CONDITIONS.map((c) => (
            <label key={c} className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" value={c} {...register('existingConditions')}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              {c}
            </label>
          ))}
        </div>
      </div>

      <TagInput
        label="Allergies"
        tags={allergies}
        onChange={setAllergies}
        placeholder="Type allergy + press Enter (e.g. Penicillin)"
      />

      <TagInput
        label="Current Medications"
        tags={medications}
        onChange={setMedications}
        placeholder="Type medication + press Enter (e.g. Metformin)"
      />

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Smoking Status</label>
        <div className="flex gap-4">
          {['Never', 'Former', 'Current'].map((s) => (
            <label key={s} className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="radio" value={s.toLowerCase()} {...register('smokingStatus')}
                className="text-blue-600 focus:ring-blue-500" />
              {s}
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Alcohol Use</label>
        <div className="flex gap-4">
          {['None', 'Occasional', 'Regular'].map((a) => (
            <label key={a} className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="radio" value={a.toLowerCase()} {...register('alcoholUse')}
                className="text-blue-600 focus:ring-blue-500" />
              {a}
            </label>
          ))}
        </div>
      </div>

      <div className="flex justify-between pt-2">
        <button type="button" onClick={onBack}
          className="text-gray-600 hover:text-gray-800 font-medium px-4 py-2.5 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors">
          ← Back
        </button>
        <button type="submit"
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors">
          Next →
        </button>
      </div>
    </form>
  );
}

// ── Step 3: Symptoms ──────────────────────────────────────────────────────────
function Step3({ onSubmit, onBack, loading }) {
  // { symptomName: { duration: '', severity: 5, onset: 'gradual' } }
  const [selected, setSelected] = useState({});

  const toggleSymptom = (name) => {
    setSelected((prev) => {
      if (prev[name]) {
        const next = { ...prev };
        delete next[name];
        return next;
      }
      return { ...prev, [name]: { duration: '', severity: 5, onset: 'gradual' } };
    });
  };

  const updateSymptom = (name, field, value) => {
    setSelected((prev) => ({ ...prev, [name]: { ...prev[name], [field]: value } }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (Object.keys(selected).length === 0) {
      toast.error('Please select at least one symptom');
      return;
    }
    const symptoms = Object.entries(selected).map(([name, details]) => ({
      name,
      duration: details.duration || 'unknown',
      severity: details.severity,
      onset: details.onset,
    }));
    onSubmit(symptoms);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-800 mb-1">Symptoms</h2>
        <p className="text-sm text-gray-500">Select all symptoms you are experiencing. Fill in details for each.</p>
      </div>

      {Object.keys(selected).length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-sm text-blue-700">
          {Object.keys(selected).length} symptom(s) selected
        </div>
      )}

      {SYMPTOM_SYSTEMS.map(({ system, icon, symptoms }) => (
        <div key={system} className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="bg-gray-50 px-4 py-2.5 flex items-center gap-2 border-b border-gray-200">
            <span>{icon}</span>
            <span className="font-semibold text-gray-700 text-sm">{system}</span>
          </div>
          <div className="p-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              {symptoms.map((symptom) => {
                const isSelected = !!selected[symptom];
                return (
                  <button
                    key={symptom}
                    type="button"
                    onClick={() => toggleSymptom(symptom)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium border-2 transition-all
                      ${isSelected
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300'}`}
                  >
                    {isSelected ? '✓ ' : ''}{symptom}
                  </button>
                );
              })}
            </div>

            {/* Detail panel for selected symptoms in this system */}
            {symptoms.filter((s) => selected[s]).map((symptom) => (
              <div key={symptom} className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-3">
                <p className="text-sm font-semibold text-blue-800">{symptom}</p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-gray-600 block mb-1">Duration (days)</label>
                    <input
                      type="number" min="1"
                      value={selected[symptom].duration}
                      onChange={(e) => updateSymptom(symptom, 'duration', e.target.value)}
                      placeholder="e.g. 3"
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-gray-600 block mb-1">
                      Severity: <span className="font-bold text-blue-700">{selected[symptom].severity}/10</span>
                    </label>
                    <input
                      type="range" min="1" max="10"
                      value={selected[symptom].severity}
                      onChange={(e) => updateSymptom(symptom, 'severity', parseInt(e.target.value))}
                      className="w-full accent-blue-600"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-gray-600 block mb-1">Onset</label>
                    <div className="flex gap-3">
                      {['sudden', 'gradual'].map((o) => (
                        <label key={o} className="flex items-center gap-1 text-sm cursor-pointer capitalize">
                          <input
                            type="radio"
                            name={`onset-${symptom}`}
                            value={o}
                            checked={selected[symptom].onset === o}
                            onChange={() => updateSymptom(symptom, 'onset', o)}
                            className="text-blue-600"
                          />
                          {o}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="flex justify-between pt-2">
        <button type="button" onClick={onBack}
          className="text-gray-600 hover:text-gray-800 font-medium px-4 py-2.5 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors">
          ← Back
        </button>
        <button
          type="submit"
          disabled={loading}
          className="bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-semibold px-8 py-2.5 rounded-lg transition-colors flex items-center gap-2"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Analyzing…
            </>
          ) : (
            'Analyze Symptoms →'
          )}
        </button>
      </div>
    </form>
  );
}

// ── Main Intake Component ─────────────────────────────────────────────────────
export default function Intake() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Accumulated data across steps
  const [step1Data, setStep1Data] = useState({});
  const [step2Data, setStep2Data] = useState({});

  const handleStep1 = (data) => {
    setStep1Data(data);
    setStep(2);
  };

  const handleStep2 = (data) => {
    setStep2Data(data);
    // Save profile to DB (fire-and-forget; errors shown via toast)
    api.put('/patient/profile', {
      age: step1Data.age,
      gender: step1Data.gender,
      weightKg: step1Data.weightKg || null,
      heightCm: step1Data.heightCm || null,
      bloodGroup: step1Data.bloodGroup || null,
      existingConditions: data.existingConditions
        ? (Array.isArray(data.existingConditions) ? data.existingConditions : [data.existingConditions])
        : [],
      allergies: data.allergies || [],
      currentMedications: data.currentMedications || [],
      smokingStatus: data.smokingStatus || null,
      alcoholUse: data.alcoholUse || null,
    }).catch((err) => toast.error('Profile save failed: ' + err.message));

    setStep(3);
  };

  const handleStep3 = async (symptoms) => {
    setLoading(true);
    try {
      const { data } = await api.post('/disease/predict', { symptoms });
      toast.success('Symptoms submitted! Running diagnosis…');
      navigate('/patient/results', { state: { sessionId: data.sessionId } });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <ProgressBar step={step} />
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
        {step === 1 && <Step1 onNext={handleStep1} defaultValues={step1Data} />}
        {step === 2 && <Step2 onNext={handleStep2} onBack={() => setStep(1)} defaultValues={step2Data} />}
        {step === 3 && <Step3 onSubmit={handleStep3} onBack={() => setStep(2)} loading={loading} />}
      </div>
    </div>
  );
}
