/**
 * useVoice.js — ElevenLabs TTS + Browser Speech Recognition hook
 *
 * Usage:
 *   const { speak, listen, stopListening, isSpeaking, isListening, transcript, supported } = useVoice();
 *
 * speak(text)  — sends text to /api/voice/speak, plays audio
 * listen()     — starts SpeechRecognition, returns Promise<string>
 * stopListening() — cancels SpeechRecognition mid-stream
 */

import { useState, useRef, useCallback } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';

export function useVoice() {
  const [isSpeaking,  setIsSpeaking]  = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcript,  setTranscript]  = useState('');

  const audioCtxRef   = useRef(null);
  const audioSrcRef   = useRef(null);
  const recognitionRef = useRef(null);

  // Check browser support
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const supported = !!SpeechRecognition;

  // ── Must be called synchronously inside a click handler (unlocks AudioContext) ──
  const initAudio = useCallback(() => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();   // fire-and-forget is fine here
    }
  }, []);

  // ── Speak (TTS via ElevenLabs) ────────────────────────────────────────────
  const speak = useCallback(async (text) => {
    if (!text) return;

    // Stop any ongoing speech
    if (audioSrcRef.current) {
      try { audioSrcRef.current.stop(); } catch {}
      audioSrcRef.current = null;
    }

    setIsSpeaking(true);

    try {
      const response = await api.post('/voice/speak', { text }, { responseType: 'arraybuffer' });

      // AudioContext must already exist (created by initAudio on click)
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') await ctx.resume();

      const audioBuffer = await ctx.decodeAudioData(response.data);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      audioSrcRef.current = source;

      await new Promise((resolve, reject) => {
        source.onended = resolve;
        source.onerror = reject;
        source.start(0);
      });
    } catch (err) {
      // Decode arraybuffer error body if present
      let msg = err.message;
      if (err?.response?.data instanceof ArrayBuffer) {
        try { msg = new TextDecoder().decode(err.response.data); } catch {}
      }
      console.error('[useVoice] TTS error:', msg);
      toast.error(`Voice error: ${msg}`, { id: 'tts-error', duration: 4000 });
    } finally {
      setIsSpeaking(false);
      audioSrcRef.current = null;
    }
  }, []);

  // ── Stop speech mid-play ─────────────────────────────────────────────────
  const stopSpeaking = useCallback(() => {
    if (audioSrcRef.current) {
      try { audioSrcRef.current.stop(); } catch {}
      audioSrcRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

  // ── Listen (STT via browser Web Speech API) ──────────────────────────────
  const listen = useCallback((options = {}) => {
    const { lang = 'en-US', maxSeconds = 15 } = options;

    return new Promise((resolve, reject) => {
      if (!SpeechRecognition) {
        reject(new Error('Speech recognition not supported in this browser. Use Chrome or Edge.'));
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.lang = lang;
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognitionRef.current = recognition;

      setIsListening(true);
      setTranscript('');

      const timeout = setTimeout(() => {
        recognition.stop();
      }, maxSeconds * 1000);

      recognition.onresult = (event) => {
        clearTimeout(timeout);
        const text = event.results[0][0].transcript;
        setTranscript(text);
        resolve(text);
      };

      recognition.onerror = (event) => {
        clearTimeout(timeout);
        setIsListening(false);
        if (event.error === 'no-speech') {
          resolve('');    // treat silence as empty answer
        } else {
          reject(new Error(`Speech recognition error: ${event.error}`));
        }
      };

      recognition.onend = () => {
        clearTimeout(timeout);
        setIsListening(false);
        recognitionRef.current = null;
      };

      recognition.start();
    });
  }, [SpeechRecognition]);

  // ── Stop listening ────────────────────────────────────────────────────────
  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  // ── Parse spoken text with Groq via backend ───────────────────────────────
  const parseSpoken = useCallback(async (step, text, symptomName) => {
    if (!text) return null;
    const body = { step, text };
    if (symptomName) body.symptomName = symptomName;
    const { data } = await api.post('/voice/parse', body);
    return data.parsed;
  }, []);

  return {
    speak,
    stopSpeaking,
    listen,
    stopListening,
    parseSpoken,
    initAudio,
    isSpeaking,
    isListening,
    transcript,
    supported,
  };
}
