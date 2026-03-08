import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';

// ── Symptom data ───────────────────────────────────────────────────────────────
const SYMPTOM_SYSTEMS = [
  { system: 'General',          icon: '🌡️', symptoms: ['Fever','Fatigue','Weight Loss','Weight Gain','Night Sweats','Loss of Appetite','Weakness'] },
  { system: 'Head & Neurological', icon: '🧠', symptoms: ['Headache','Dizziness','Confusion','Memory Loss','Seizures','Numbness / Tingling'] },
  { system: 'Chest & Heart',    icon: '❤️', symptoms: ['Chest Pain','Shortness of Breath','Palpitations','Cough','Wheezing'] },
  { system: 'Digestive',        icon: '🫃', symptoms: ['Nausea','Vomiting','Diarrhea','Constipation','Abdominal Pain','Bloating','Heartburn'] },
  { system: 'Musculoskeletal',  icon: '🦴', symptoms: ['Joint Pain','Muscle Pain','Back Pain','Swelling','Stiffness'] },
  { system: 'Skin',             icon: '🩹', symptoms: ['Rash','Itching','Yellowing (Jaundice)','Pale Skin','Bruising'] },
  { system: 'Urinary & Other',  icon: '🫧', symptoms: ['Frequent Urination','Painful Urination','Blood in Urine','Increased Thirst','Blurred Vision'] },
];

const CONDITIONS = ['Diabetes','Hypertension','Asthma','Heart Disease','Thyroid Disorder','Cancer','Arthritis','Kidney Disease','None'];
const BLOOD_GROUPS = ['A+','A-','B+','B-','AB+','AB-','O+','O-'];

// Map DB snake_case → form camelCase
function profileToForm(p) {
  return {
    age:               p.age       || '',
    gender:            p.gender    || '',
    weightKg:          p.weight_kg || '',
    heightCm:          p.height_cm || '',
    bloodGroup:        p.blood_group || '',
    existingConditions: p.existing_conditions || [],
    allergies:         p.allergies            || [],
    currentMedications: p.current_medications || [],
    smokingStatus:     p.smoking_status || '',
    alcoholUse:        p.alcohol_use   || '',
  };
}

// ── Progress Bar ───────────────────────────────────────────────────────────────
function ProgressBar({ step }) {
  const steps = ['Basic Info', 'Medical History', 'Symptoms'];
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-2">
        {steps.map((label, i) => (
          <div key={i} className="flex flex-col items-center flex-1">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all
              ${i + 1 < step  ? 'bg-green-500 border-green-500 text-white' :
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
        <div className="absolute h-1.5 bg-blue-600 rounded-full transition-all duration-300"
          style={{ width: `${((step - 1) / 2) * 100}%` }} />
      </div>
    </div>
  );
}

// ── Tag Input ──────────────────────────────────────────────────────────────────
function TagInput({ label, tags, onChange, placeholder }) {
  const [input, setInput] = useState('');
  const addTag = () => {
    const val = input.trim();
    if (val && !tags.includes(val)) onChange([...tags, val]);
    setInput('');
  };
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="flex flex-wrap gap-2 mb-2">
        {tags.map(tag => (
          <span key={tag} className="flex items-center gap-1 bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-sm">
            {tag}
            <button type="button" onClick={() => onChange(tags.filter(t => t !== tag))} className="text-blue-400 hover:text-blue-700">×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text" value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())}
          placeholder={placeholder}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button type="button" onClick={addTag}
          className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm hover:bg-blue-200">
          Add
        </button>
      </div>
    </div>
  );
}

// ── Step 1 ─────────────────────────────────────────────────────────────────────
function Step1({ onNext, defaultValues }) {
  const { register, handleSubmit, formState: { errors }, watch } = useForm({ defaultValues });
  const selectedBloodGroup = watch('bloodGroup');

  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-5">
      <h2 className="text-xl font-bold text-gray-800 mb-1">Basic Information</h2>
      <p className="text-sm text-gray-500 mb-4">Review and update your details before continuing.</p>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Age <span className="text-red-500">*</span></label>
          <input type="number" min="1" max="120"
            {...register('age', { required: 'Age is required', min: { value: 1, message: 'Enter valid age' } })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {errors.age && <p className="text-red-500 text-xs mt-1">{errors.age.message}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Gender <span className="text-red-500">*</span></label>
          <select {...register('gender', { required: 'Gender is required' })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
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
          <input type="number" step="0.1" min="1" {...register('weightKg')} placeholder="e.g. 70"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Height (cm)</label>
          <input type="number" step="0.1" min="1" {...register('heightCm')} placeholder="e.g. 170"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Blood Group</label>
        <div className="flex flex-wrap gap-2">
          {BLOOD_GROUPS.map(bg => (
            <label key={bg} className="cursor-pointer">
              <input type="radio" value={bg} {...register('bloodGroup')} className="sr-only" />
              <span className={`px-3 py-1.5 border-2 rounded-lg text-sm font-medium transition-all cursor-pointer select-none
                ${selectedBloodGroup === bg ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-200 text-gray-600 hover:border-blue-400'}`}>
                {bg}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors">
          Next →
        </button>
      </div>
    </form>
  );
}

// ── Step 2 ─────────────────────────────────────────────────────────────────────
function Step2({ onNext, onBack, defaultValues }) {
  const { register, handleSubmit } = useForm({ defaultValues });
  const [allergies, setAllergies]     = useState(defaultValues?.allergies || []);
  const [medications, setMedications] = useState(defaultValues?.currentMedications || []);

  const onSubmit = data => onNext({ ...data, allergies, currentMedications: medications });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <h2 className="text-xl font-bold text-gray-800 mb-1">Medical History</h2>
      <p className="text-sm text-gray-500 mb-4">Review and update your medical history.</p>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Existing Conditions</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {CONDITIONS.map(c => (
            <label key={c} className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" value={c} {...register('existingConditions')}
                defaultChecked={defaultValues?.existingConditions?.includes(c)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              {c}
            </label>
          ))}
        </div>
      </div>

      <TagInput label="Allergies" tags={allergies} onChange={setAllergies}
        placeholder="Type allergy + press Enter (e.g. Penicillin)" />
      <TagInput label="Current Medications" tags={medications} onChange={setMedications}
        placeholder="Type medication + press Enter (e.g. Metformin)" />

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Smoking Status</label>
        <div className="flex gap-4">
          {['Never','Former','Current'].map(s => (
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
          {['None','Occasional','Regular'].map(a => (
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
          className="text-gray-600 font-medium px-4 py-2.5 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors">
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

// ── Step 3 ─────────────────────────────────────────────────────────────────────
function Step3({ onSubmit, onBack, loading }) {
  const [selected, setSelected] = useState({});

  const toggleSymptom = name => setSelected(prev => {
    if (prev[name]) { const n = { ...prev }; delete n[name]; return n; }
    return { ...prev, [name]: { duration: '', severity: 5, onset: 'gradual' } };
  });

  const updateSymptom = (name, field, value) =>
    setSelected(prev => ({ ...prev, [name]: { ...prev[name], [field]: value } }));

  const handleSubmit = e => {
    e.preventDefault();
    if (!Object.keys(selected).length) { toast.error('Please select at least one symptom'); return; }
    onSubmit(Object.entries(selected).map(([name, d]) => ({
      name, duration: d.duration || 'unknown', severity: d.severity, onset: d.onset,
    })));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-800 mb-1">Current Symptoms</h2>
        <p className="text-sm text-gray-500">Select what you are experiencing right now.</p>
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
              {symptoms.map(symptom => {
                const isSelected = !!selected[symptom];
                return (
                  <button key={symptom} type="button" onClick={() => toggleSymptom(symptom)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium border-2 transition-all
                      ${isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300'}`}>
                    {isSelected ? '✓ ' : ''}{symptom}
                  </button>
                );
              })}
            </div>
            {symptoms.filter(s => selected[s]).map(symptom => (
              <div key={symptom} className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-3">
                <p className="text-sm font-semibold text-blue-800">{symptom}</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-gray-600 block mb-1">Duration (days)</label>
                    <input type="number" min="1" value={selected[symptom].duration}
                      onChange={e => updateSymptom(symptom, 'duration', e.target.value)}
                      placeholder="e.g. 3"
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600 block mb-1">
                      Severity: <span className="font-bold text-blue-700">{selected[symptom].severity}/10</span>
                    </label>
                    <input type="range" min="1" max="10" value={selected[symptom].severity}
                      onChange={e => updateSymptom(symptom, 'severity', parseInt(e.target.value))}
                      className="w-full accent-blue-600" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600 block mb-1">Onset</label>
                    <div className="flex gap-3">
                      {['sudden','gradual'].map(o => (
                        <label key={o} className="flex items-center gap-1 text-sm cursor-pointer capitalize">
                          <input type="radio" name={`onset-${symptom}`} value={o}
                            checked={selected[symptom].onset === o}
                            onChange={() => updateSymptom(symptom, 'onset', o)}
                            className="text-blue-600" />
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
          className="text-gray-600 font-medium px-4 py-2.5 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors">
          ← Back
        </button>
        <button type="submit" disabled={loading}
          className="bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-semibold px-8 py-2.5 rounded-lg transition-colors flex items-center gap-2">
          {loading ? (
            <><span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full inline-block" />Analyzing…</>
          ) : 'Analyze Symptoms →'}
        </button>
      </div>
    </form>
  );
}

// ── Session History Card ────────────────────────────────────────────────────────
function SessionHistoryCard({ session, onReview }) {
  const diseases = session.predicted_diseases || [];
  const date = new Date(session.created_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-start justify-between gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-400 mb-1">{date}</p>
        {diseases.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {diseases.slice(0, 3).map((d, i) => (
              <span key={i} className="bg-blue-50 text-blue-700 border border-blue-100 text-xs px-2 py-0.5 rounded-full font-medium">
                {d.disease}
              </span>
            ))}
            {diseases.length > 3 && (
              <span className="text-xs text-gray-400">+{diseases.length - 3} more</span>
            )}
          </div>
        ) : (
          <p className="text-xs text-gray-400 italic">No diseases recorded</p>
        )}
      </div>
      <button onClick={() => onReview(session)}
        className="shrink-0 text-xs text-blue-600 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors">
        View →
      </button>
    </div>
  );
}

// ── Main Intake Component ──────────────────────────────────────────────────────
export default function Intake() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [profileLoading, setProfileLoading] = useState(true);
  const [hasExistingProfile, setHasExistingProfile] = useState(false);
  const [pastSessions, setPastSessions] = useState([]);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Pre-filled data from DB (carried across steps)
  const [step1Data, setStep1Data] = useState({});
  const [step2Data, setStep2Data] = useState({});

  // Load profile + sessions on mount
  useEffect(() => {
    async function loadPatientData() {
      try {
        const [profileRes, sessionsRes] = await Promise.all([
          api.get('/patient/profile'),
          api.get('/patient/sessions').catch(() => ({ data: { sessions: [] } })),
        ]);

        const profile  = profileRes.data.profile;
        const sessions = sessionsRes.data.sessions || [];
        setPastSessions(sessions);

        if (profile) {
          const mapped = profileToForm(profile);
          setStep1Data({
            age:        mapped.age,
            gender:     mapped.gender,
            weightKg:   mapped.weightKg,
            heightCm:   mapped.heightCm,
            bloodGroup: mapped.bloodGroup,
          });
          setStep2Data({
            existingConditions: mapped.existingConditions,
            allergies:          mapped.allergies,
            currentMedications: mapped.currentMedications,
            smokingStatus:      mapped.smokingStatus,
            alcoholUse:         mapped.alcoholUse,
          });
          setHasExistingProfile(true);
        }
      } catch {
        // New patient — no profile yet, start fresh
      } finally {
        setProfileLoading(false);
      }
    }
    loadPatientData();
  }, []);

  const handleStep1 = data => { setStep1Data(data); setStep(2); };

  const handleStep2 = data => {
    const merged = { ...data,
      allergies: data.allergies || [],
      currentMedications: data.currentMedications || [],
      existingConditions: data.existingConditions
        ? (Array.isArray(data.existingConditions) ? data.existingConditions : [data.existingConditions])
        : [],
    };
    setStep2Data(merged);

    // Save / update profile in DB
    api.put('/patient/profile', {
      age: step1Data.age, gender: step1Data.gender,
      weightKg: step1Data.weightKg || null, heightCm: step1Data.heightCm || null,
      bloodGroup: step1Data.bloodGroup || null,
      existingConditions: merged.existingConditions,
      allergies: merged.allergies,
      currentMedications: merged.currentMedications,
      smokingStatus: merged.smokingStatus || null,
      alcoholUse: merged.alcoholUse || null,
    }).then(() => {
      setHasExistingProfile(true);
    }).catch(err => toast.error('Profile save failed: ' + err.message));

    setStep(3);
  };

  const handleStep3 = async symptoms => {
    setLoading(true);
    try {
      const { data } = await api.post('/disease/predict', { symptoms });
      toast.success('Diagnosis complete!');
      navigate('/patient/results', {
        state: { sessionId: data.sessionId, diseases: data.diseases, turns: data.turns },
      });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Skip directly to symptoms if profile is complete
  const skipToSymptoms = () => {
    // Profile already saved — just go to Step 3
    setStep(3);
  };

  if (profileLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-12">

      {/* ── Returning patient banner ── */}
      {hasExistingProfile && step < 3 && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="font-semibold text-green-800 text-sm">
                👋 Welcome back, {user?.name?.split(' ')[0] || 'there'}!
              </p>
              <p className="text-green-700 text-xs mt-0.5">
                Your profile is pre-filled from your last visit. You can update any field or skip straight to symptoms.
              </p>
            </div>
            <button
              onClick={skipToSymptoms}
              className="shrink-0 bg-green-600 text-white text-sm font-semibold px-5 py-2 rounded-xl hover:bg-green-700 transition-colors"
            >
              Skip to Symptoms →
            </button>
          </div>
        </div>
      )}

      {/* ── Progress bar + form card ── */}
      <div>
        <ProgressBar step={step} />
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
          {step === 1 && <Step1 onNext={handleStep1} defaultValues={step1Data} />}
          {step === 2 && <Step2 onNext={handleStep2} onBack={() => setStep(1)} defaultValues={step2Data} />}
          {step === 3 && <Step3 onSubmit={handleStep3} onBack={() => setStep(hasExistingProfile ? 1 : 2)} loading={loading} />}
        </div>
      </div>

      {/* ── Past sessions ── */}
      {pastSessions.length > 0 && step < 3 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
            Your Previous Diagnoses
          </h2>
          {pastSessions.map(session => (
            <SessionHistoryCard
              key={session.id}
              session={session}
              onReview={s => navigate('/patient/results', {
                state: { sessionId: s.id, diseases: s.predicted_diseases || [] },
              })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
