/**
 * aiClient.js — shared AI client
 *
 * To switch to Gemini (testing):
 *   const OpenAI = require('openai');
 *   const client = new OpenAI({ apiKey: process.env.GEMINI_API_KEY, baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/' });
 *   const MODEL = 'gemini-2.0-flash';
 */
const Groq = require('groq-sdk');

const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

// llama-3.3-70b-versatile: 12,000 TPM on Groq free tier
// llama-3.1-8b-instant only gets 6,000 TPM — worse for multi-turn agents.
const MODEL = 'llama-3.3-70b-versatile';

module.exports = { client, MODEL };
