/**
 * VoiceIntake.jsx — AI-powered Voice Patient Assistant
 *
 * Redesigned to feel like a dedicated medical assistant guiding the patient
 * with clear speaking/listening/thinking states and a warm, accessible UI.
 */

import { useState, useRef, useCallback } from 'react';
import { useVoice } from '../hooks/useVoice';
import toast from 'react-hot-toast';

// ── Conversation scripts ────────────────────────────────────────────────────
const STEP1_QUESTIONS = [
  { key: 'age',        q: 'Please tell me your age.' },
  { key: 'gender',     q: 'What is your gender? Say male, female, or other.' },
  { key: 'weightKg',   q: 'What is your weight in kilograms? Say skip if you prefer not to share.' },
  { key: 'heightCm',   q: 'What is your height in centimeters? Say skip if you prefer not to share.' },
  { key: 'bloodGroup', q: 'What is your blood group? For example: A positive, B negative, O positive. Say skip if unknown.' },
];

const STEP2_QUESTIONS = [
  { key: 'existingConditions', parseStep: 'conditions', q: 'Do you have any existing medical conditions? For example: diabetes, hypertension, asthma, heart disease. You can list all of them. Say none if not applicable.' },
  { key: 'allergies',          parseStep: 'allergies',  q: 'Do you have any known allergies? You can list all of them — for example: penicillin, pollen, shellfish. Say none if not.' },
  { key: 'currentMedications', parseStep: 'medications',q: 'Are you currently taking any medications? Please list all of them. Say none if not.' },
  { key: 'smokingStatus',      parseStep: 'smoking',    q: 'What is your smoking status? Say never, former, or current.' },
  { key: 'alcoholUse',         parseStep: 'alcohol',    q: 'How would you describe your alcohol use? Say none, occasional, or regular.' },
];

const STEP_LABELS = ['Basic Info', 'Medical History', 'Symptoms'];

// ── Waveform bars (animated while listening) ─────────────────────────────────
function Waveform({ active }) {
  return (
    <div className="flex items-end gap-[3px] h-6">
      {[0.4, 0.7, 1, 0.6, 0.9, 0.5, 0.8, 0.4, 1, 0.7].map((h, i) => (
        <div
          key={i}
          className={`w-[3px] rounded-full transition-all ${active ? 'bg-teal-500' : 'bg-slate-200'}`}
          style={{
            height: active ? `${Math.round(h * 24)}px` : '4px',
            animationName: active ? 'voiceBar' : 'none',
            animationDuration: `${0.5 + i * 0.07}s`,
            animationTimingFunction: 'ease-in-out',
            animationIterationCount: 'infinite',
            animationDirection: 'alternate',
            transition: 'height 0.2s ease',
          }}
        />
      ))}
      <style>{`
        @keyframes voiceBar {
          from { transform: scaleY(0.3); }
          to   { transform: scaleY(1);   }
        }
      `}</style>
    </div>
  );
}

// ── Thinking dots ─────────────────────────────────────────────────────────────
function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-1">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-1.5 h-1.5 bg-teal-400 rounded-full inline-block"
          style={{
            animation: 'dotBounce 1s ease-in-out infinite',
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
      <style>{`
        @keyframes dotBounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40%            { transform: translateY(-5px); opacity: 1; }
        }
      `}</style>
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function VoiceIntake({
  step, onStep1Done, onStep2Done, onStep3Done, onClose, onFailure = () => {}, onLiveUpdate, step1Data, step2Data,
}) {
  const { speak, listen, stopSpeaking, stopListening, initAudio, isSpeaking, isListening, supported } = useVoice();

  const [isThinking,       setIsThinking]       = useState(false);
  const [currentQ,         setCurrentQ]         = useState('');
  const [transcript,       setTranscript]       = useState('');
  const [collectedData,    setCollectedData]    = useState({});
  const [qIndex,           setQIndex]           = useState(0);
  const [phase,            setPhase]            = useState('idle');
  const [retryAttempt,     setRetryAttempt]     = useState(0);
  const [symptomsCollected, setSymptomsCollected] = useState([]);
  const [symptomDetailIdx, setSymptomDetailIdx] = useState(0);
  const [activeStep,       setActiveStep]       = useState(step);

  const running   = useRef(false);
  const cancelRef = useRef(false);

  // ── Ask one question ──────────────────────────────────────────────────────
  const askAndListen = useCallback(async (questionText) => {
    if (cancelRef.current) return null;
    setCurrentQ(questionText);

    const task = async () => {
      await speak(questionText);
      if (cancelRef.current) return null;
      try {
        const heard = await listen({ maxSeconds: 20 });
        setTranscript(heard || '');
        return heard || '';
      } catch (err) {
        console.warn('[VoiceIntake] listen error:', err.message);
        return '';
      }
    };

    // Safety net: if the entire ask+listen cycle freezes for 30s, unblock with ''
    // This triggers the retry loop which will re-ask the same question
    const stuckGuard = new Promise(resolve => setTimeout(() => resolve(''), 30000));
    return Promise.race([task(), stuckGuard]);
  }, [speak, listen]);

  // ── Retry logic ────────────────────────────────────────────────────────────
  const RETRY_PROMPTS = [
    q => q,
    q => `Sorry, I didn't catch that. ${q}`,
    q => `One last try — please speak clearly. ${q}`,
  ];

  const askWithRetry = useCallback(async (questionText) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (cancelRef.current) return null;
      setRetryAttempt(attempt);
      const prompt = RETRY_PROMPTS[attempt](questionText);
      const heard  = await askAndListen(prompt);
      if (cancelRef.current) return null;
      if (heard && heard.trim()) { setRetryAttempt(0); return heard; }
    }
    setRetryAttempt(0);
    return null;
  }, [askAndListen]);

  const closeWithHint = useCallback(async (reason, redirect = false) => {
    cancelRef.current = true;
    setCurrentQ('');
    await speak(reason);
    running.current = false;
    setPhase('idle');
    if (redirect) onFailure();
    else onClose();
  }, [speak, onClose, onFailure]);

  // ── Step runners ───────────────────────────────────────────────────────────
  const runStep1 = useCallback(async () => {
    const api = (await import('../services/api')).default;
    const collected = {};
    setActiveStep(1);

    for (let i = 0; i < STEP1_QUESTIONS.length; i++) {
      if (cancelRef.current) return;
      setQIndex(i);
      const { key, q } = STEP1_QUESTIONS[i];

      const heard = await askWithRetry(q);
      if (cancelRef.current) return;
      if (heard === null) {
        await closeWithHint('I was unable to hear your response after three attempts. Please try voice mode again, or fill in the form manually.', true);
        return;
      }
      if (heard.toLowerCase().includes('skip')) { collected[key] = null; continue; }

      setIsThinking(true);
      let parsedVal = null;
      try {
        const { data } = await api.post('/voice/parse', { step: 'step1', text: heard, context: q }, { timeout: 10000 });
        const parsed = data.parsed || {};
        if (parsed[key] !== undefined && parsed[key] !== null) parsedVal = parsed[key];
      } catch (err) { console.warn('[VoiceIntake] parse error:', err.message); }
      setIsThinking(false);

      // Clarification: heard something but couldn't extract a value
      if (parsedVal === null && !cancelRef.current) {
        const clarifyHeard = await askAndListen("I didn't quite understand that. Could you please repeat your answer more clearly?");
        if (!cancelRef.current && clarifyHeard && clarifyHeard.trim() && !clarifyHeard.toLowerCase().includes('skip')) {
          setIsThinking(true);
          try {
            const { data } = await api.post('/voice/parse', { step: 'step1', text: clarifyHeard, context: q }, { timeout: 10000 });
            const parsed = data.parsed || {};
            if (parsed[key] !== undefined && parsed[key] !== null) parsedVal = parsed[key];
          } catch (err) { console.warn('[VoiceIntake] clarification parse error:', err.message); }
          setIsThinking(false);
        }
      }

      if (parsedVal !== null) {
        collected[key] = parsedVal;
        onLiveUpdate?.('step1', key, parsedVal);
      }
      setCollectedData(prev => ({ ...prev, [key]: collected[key] }));
    }

    if (cancelRef.current) return;
    const summary = [collected.age ? `Age: ${collected.age}` : '', collected.gender ? `Gender: ${collected.gender}` : '', collected.bloodGroup ? `Blood group: ${collected.bloodGroup}` : ''].filter(Boolean).join(', ');
    await speak(`Great! I've recorded: ${summary || 'your basic information'}. Moving to medical history.`);
    if (cancelRef.current) return;
    onStep1Done({ age: collected.age || step1Data?.age || '', gender: collected.gender || step1Data?.gender || '', weightKg: collected.weightKg || step1Data?.weightKg || '', heightCm: collected.heightCm || step1Data?.heightCm || '', bloodGroup: collected.bloodGroup || step1Data?.bloodGroup || '' });
  }, [askWithRetry, askAndListen, speak, closeWithHint, onStep1Done, step1Data, onLiveUpdate]);

  const runStep2 = useCallback(async () => {
    const api = (await import('../services/api')).default;
    const collected = {};
    setActiveStep(2);

    for (let i = 0; i < STEP2_QUESTIONS.length; i++) {
      if (cancelRef.current) return;
      setQIndex(i);
      const { key, parseStep, q } = STEP2_QUESTIONS[i];

      const heard = await askWithRetry(q);
      if (cancelRef.current) return;
      if (heard === null) {
        await closeWithHint('I was unable to hear your response after three attempts. Please try voice mode again, or fill in the form manually.', true);
        return;
      }

      setIsThinking(true);
      let rawVal = undefined;
      try {
        const { data } = await api.post('/voice/parse', { step: parseStep, text: heard, context: q }, { timeout: 10000 });
        rawVal = data.parsed;
      } catch (err) { console.warn('[VoiceIntake] parse error:', err.message); }
      setIsThinking(false);

      // Clarification: heard something but parse returned empty/null
      const isEmpty2 = rawVal == null || (Array.isArray(rawVal) && rawVal.length === 0) || rawVal === '';
      if (isEmpty2 && !cancelRef.current) {
        const clarifyHeard = await askAndListen("I didn't quite understand. Could you please repeat your answer?");
        if (!cancelRef.current && clarifyHeard && clarifyHeard.trim() && !clarifyHeard.toLowerCase().includes('skip')) {
          setIsThinking(true);
          try {
            const { data } = await api.post('/voice/parse', { step: parseStep, text: clarifyHeard, context: q }, { timeout: 10000 });
            rawVal = data.parsed;
          } catch (err) { console.warn('[VoiceIntake] clarification parse error:', err.message); }
          setIsThinking(false);
        }
      }

      if (Array.isArray(rawVal)) collected[key] = rawVal;
      else if (typeof rawVal === 'string') collected[key] = rawVal.trim().toLowerCase();
      else if (rawVal != null) collected[key] = rawVal;
      if (collected[key] !== undefined) onLiveUpdate?.('step2', key, collected[key]);
      setCollectedData(prev => ({ ...prev, [key]: collected[key] }));
    }

    if (cancelRef.current) return;
    await speak("Thank you. Now let's talk about your current symptoms.");
    if (cancelRef.current) return;
    onStep2Done({ existingConditions: collected.existingConditions ?? step2Data?.existingConditions ?? [], allergies: collected.allergies ?? step2Data?.allergies ?? [], currentMedications: collected.currentMedications ?? step2Data?.currentMedications ?? [], smokingStatus: collected.smokingStatus ?? step2Data?.smokingStatus ?? '', alcoholUse: collected.alcoholUse ?? step2Data?.alcoholUse ?? '' });
  }, [askWithRetry, askAndListen, speak, closeWithHint, onStep2Done, step2Data, onLiveUpdate]);

  const runStep3 = useCallback(async () => {
    const api = (await import('../services/api')).default;
    setActiveStep(3);
    const SYMPTOM_Q = 'Please describe all the symptoms you are experiencing right now. You can list multiple symptoms.';

    const heard1 = await askWithRetry(SYMPTOM_Q);
    if (cancelRef.current) return;
    if (heard1 === null) {
      await closeWithHint('I was unable to hear your symptoms after three attempts. Please use the form to select them manually.', true);
      return;
    }

    let symptomNames = [];
    setIsThinking(true);
    try {
      const { data } = await api.post('/voice/parse', { step: 'step3symptoms', text: heard1, context: SYMPTOM_Q }, { timeout: 10000 });
      symptomNames = Array.isArray(data.parsed) ? data.parsed : [];
    } catch (err) { console.warn('[VoiceIntake] symptom parse error:', err.message); }
    setIsThinking(false);

    // Clarification: heard something but couldn't extract any symptom names
    if (!symptomNames.length && !cancelRef.current) {
      const clarifyHeard = await askAndListen("I didn't catch any symptoms. Could you list them again? For example: fever, headache, cough.");
      if (!cancelRef.current && clarifyHeard && clarifyHeard.trim()) {
        setIsThinking(true);
        try {
          const { data } = await api.post('/voice/parse', { step: 'step3symptoms', text: clarifyHeard, context: SYMPTOM_Q }, { timeout: 10000 });
          symptomNames = Array.isArray(data.parsed) ? data.parsed : [];
        } catch (err) { console.warn('[VoiceIntake] symptom clarify error:', err.message); }
        setIsThinking(false);
      }
    }

    if (!symptomNames.length) {
      await speak('I could not detect any symptoms. Please use the form to select them manually. Closing now.');
      cancelRef.current = true;
      running.current = false;
      setPhase('idle');
      onFailure();
      return;
    }

    setSymptomsCollected(symptomNames);
    await speak(`I heard ${symptomNames.length} symptom${symptomNames.length > 1 ? 's' : ''}: ${symptomNames.join(', ')}. Now I will ask about each one.`);

    const finalSymptoms = [];
    for (let i = 0; i < symptomNames.length; i++) {
      if (cancelRef.current) return;
      setSymptomDetailIdx(i);
      const name = symptomNames[i];
      const q = `For ${name}: how many days have you had it, how severe is it on a scale of 1 to 10, and did it come on suddenly or gradually?`;
      const heard2 = await askWithRetry(q);
      if (cancelRef.current) return;

      let details = { duration: 'unknown', severity: 5, onset: 'gradual' };
      if (heard2 !== null && heard2.trim()) {
        setIsThinking(true);
        try {
          const { data } = await api.post('/voice/parse', { step: 'step3detail', text: heard2, symptomName: name }, { timeout: 10000 });
          details = { ...details, ...(data.parsed || {}) };
        } catch (err) { console.warn('[VoiceIntake] detail parse error:', err.message); }
        setIsThinking(false);
      }
      finalSymptoms.push({ name, ...details });
    }

    if (cancelRef.current) return;
    await speak('All done! Sending your symptoms for analysis now.');
    if (cancelRef.current) return;
    onStep3Done(finalSymptoms);
  }, [askWithRetry, askAndListen, speak, closeWithHint, onStep3Done, onFailure]);

  // ── Start / Stop ──────────────────────────────────────────────────────────
  const startVoice = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    cancelRef.current = false;
    setPhase('active');
    setCollectedData({});
    setTranscript('');
    setQIndex(0);

    try {
      if (step <= 1) { await runStep1(); if (cancelRef.current) return; }
      if (step <= 2) { await runStep2(); if (cancelRef.current) return; }
      await runStep3();
    } catch (err) {
      console.error('[VoiceIntake] runner error:', err);
      toast.error('Voice assistant encountered an error. Please try again.');
    }
    running.current = false;
    setPhase('done');
  }, [step, runStep1, runStep2, runStep3]);

  const cancelVoice = useCallback(() => {
    cancelRef.current = true;
    stopSpeaking();
    stopListening();
    running.current = false;
    setPhase('idle');
    setCurrentQ('');
    setTranscript('');
  }, [stopSpeaking, stopListening]);

  // ── Browser not supported ─────────────────────────────────────────────────
  if (!supported) {
    return (
      <div className="fixed bottom-6 right-6 z-50 w-72 bg-white border border-red-200 rounded-2xl shadow-xl p-5 text-center">
        <div className="text-3xl mb-2">🚫</div>
        <p className="text-sm font-semibold text-red-700">Browser not supported</p>
        <p className="text-xs text-red-500 mt-1">Voice mode requires Chrome or Edge with microphone access.</p>
      </div>
    );
  }

  // ── Status helpers ────────────────────────────────────────────────────────
  const questions = step === 1 ? STEP1_QUESTIONS : step === 2 ? STEP2_QUESTIONS : [];
  const totalQ = step === 3
    ? (symptomsCollected.length > 0 ? 1 + symptomsCollected.length : 1)
    : questions.length;
  const currentIndex = step === 3 && symptomsCollected.length > 0 ? 1 + symptomDetailIdx : qIndex;
  const progress = totalQ > 0 ? Math.round(((currentIndex) / totalQ) * 100) : 0;

  const statusLabel = isSpeaking ? 'Speaking to you…'
    : isListening   ? 'Listening…'
    : isThinking    ? 'Processing your answer…'
    : phase === 'done' ? 'All done!'
    : phase === 'active' ? 'Ready'
    : null;

  const collectedEntries = Object.entries(collectedData).filter(([, v]) => {
    const d = Array.isArray(v) ? v.join(', ') : String(v ?? '');
    return d && d !== 'null';
  });

  // ── Idle: just the mic button ─────────────────────────────────────────────
  if (phase === 'idle') {
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <button
          onClick={() => { initAudio(); startVoice(); }}
          title="Start voice assistant"
          className="group relative w-16 h-16 rounded-full shadow-2xl flex items-center justify-center text-white bg-teal-600 hover:bg-teal-700 hover:scale-105 transition-all duration-200"
        >
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
          </svg>
          {/* Tooltip */}
          <span className="absolute bottom-full right-0 mb-2 whitespace-nowrap bg-slate-800 text-white text-xs rounded-lg px-3 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-lg">
            Start Voice Assistant
          </span>
        </button>
      </div>
    );
  }

  // ── Active / Done: full assistant card ───────────────────────────────────
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">

      {/* ── Assistant panel ── */}
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-[340px] overflow-hidden">

        {/* ── Header strip ── */}
        <div className="bg-teal-700 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {/* pulse ring on avatar when speaking */}
            <div className={`relative shrink-0 w-8 h-8 bg-white/20 rounded-full flex items-center justify-center ${isSpeaking ? 'ring-2 ring-white/60 ring-offset-1 ring-offset-teal-700' : ''}`}>
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
              </svg>
            </div>
            <div>
              <p className="text-white text-sm font-semibold leading-tight">MedAssist AI</p>
              <p className="text-teal-200 text-[11px]">Voice Assistant</p>
            </div>
          </div>
          <button
            onClick={() => { cancelVoice(); onClose(); }}
            className="text-white/60 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
            aria-label="Close voice assistant"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Step progress tabs ── */}
        <div className="flex border-b border-slate-200">
          {STEP_LABELS.map((label, i) => {
            const n = i + 1;
            const isActive  = activeStep === n;
            const isDone    = activeStep > n;
            return (
              <div key={n} className={`flex-1 py-2 text-center text-[11px] font-semibold transition-colors
                ${isActive  ? 'text-teal-700 border-b-2 border-teal-600 bg-teal-50/50' : ''}
                ${isDone    ? 'text-teal-500' : ''}
                ${!isActive && !isDone ? 'text-slate-300' : ''}`}>
                {isDone ? '✓ ' : ''}{label}
              </div>
            );
          })}
        </div>

        {/* ── Question progress bar ── */}
        {phase === 'active' && totalQ > 0 && (
          <div className="h-0.5 bg-slate-100">
            <div className="h-0.5 bg-teal-500 transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        )}

        {/* ── Body ── */}
        <div className="px-4 py-4 space-y-4">

          {/* Status row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isThinking ? (
                <><ThinkingDots /><span className="text-xs text-teal-600 font-medium">Processing…</span></>
              ) : isSpeaking ? (
                <><span className="w-2 h-2 bg-teal-500 rounded-full animate-pulse inline-block" /><span className="text-xs text-teal-700 font-medium">Speaking to you…</span></>
              ) : isListening ? (
                <><Waveform active /><span className="text-xs text-red-600 font-medium ml-1">Listening…</span></>
              ) : phase === 'done' ? (
                <><span className="text-green-600 text-xs font-semibold">✓ Complete</span></>
              ) : (
                <span className="text-xs text-slate-400">Ready</span>
              )}
            </div>

            {retryAttempt > 0 && isListening && (
              <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                Attempt {retryAttempt + 1}/3
              </span>
            )}
          </div>

          {/* Question bubble (AI speaking) */}
          {currentQ && (
            <div className="flex items-start gap-2.5">
              <div className="shrink-0 w-6 h-6 bg-teal-100 rounded-full flex items-center justify-center mt-0.5">
                <svg className="w-3.5 h-3.5 text-teal-600" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                </svg>
              </div>
              <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl rounded-tl-none px-3 py-2.5">
                <p className="text-xs font-semibold text-teal-700 mb-0.5">MedAssist</p>
                <p className="text-sm text-slate-700 leading-snug">{currentQ}</p>
              </div>
            </div>
          )}

          {/* Patient's last response */}
          {transcript && (
            <div className="flex items-start gap-2.5 flex-row-reverse">
              <div className="shrink-0 w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center mt-0.5">
                <svg className="w-3.5 h-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0" />
                </svg>
              </div>
              <div className="flex-1 bg-blue-50 border border-blue-100 rounded-xl rounded-tr-none px-3 py-2.5">
                <p className="text-xs font-semibold text-blue-600 mb-0.5">You said</p>
                <p className="text-sm text-slate-700 leading-snug italic">"{transcript}"</p>
              </div>
            </div>
          )}

          {/* Done confirmation */}
          {phase === 'done' && (
            <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-3 text-center">
              <p className="text-green-700 font-semibold text-sm">All set! Submitting your answers…</p>
            </div>
          )}

          {/* Collected answers (compact chips) */}
          {collectedEntries.length > 0 && (
            <div className="border-t border-slate-200 pt-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Captured so far</p>
              <div className="flex flex-wrap gap-1.5">
                {collectedEntries.map(([k, v]) => {
                  const display = Array.isArray(v) ? v.join(', ') : String(v);
                  return (
                    <span key={k} className="inline-flex items-center gap-1 text-[11px] bg-teal-50 text-teal-700 border border-teal-200 px-2 py-0.5 rounded-full font-medium">
                      <svg className="w-2.5 h-2.5 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                      {display}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        {phase === 'active' && (
          <div className="border-t border-slate-200 px-4 py-3 flex items-center justify-between">
            <p className="text-[11px] text-slate-400">
              {isListening ? 'Speak now — I\'m listening' : isSpeaking ? 'Please wait…' : 'Processing…'}
            </p>
            <button
              onClick={cancelVoice}
              className="text-xs text-slate-400 hover:text-red-500 transition-colors font-medium px-2 py-1 rounded-lg hover:bg-red-50"
            >
              Stop
            </button>
          </div>
        )}
      </div>

      {/* ── Floating stop button (active) / mic button (visible for reference) ── */}
      {phase === 'active' && (
        <button
          onClick={cancelVoice}
          title="Stop voice assistant"
          className="w-14 h-14 rounded-full shadow-xl flex items-center justify-center bg-red-500 hover:bg-red-600 text-white transition-all duration-200 ring-4 ring-red-200"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M4.5 7.5A3 3 0 0 1 7.5 4.5h9A3 3 0 0 1 19.5 7.5v9a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3v-9Z" />
          </svg>
        </button>
      )}
    </div>
  );
}
