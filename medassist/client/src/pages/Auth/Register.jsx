import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';

export default function Register() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'patient',
  });
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post('/auth/register', {
        fullName: form.fullName,
        email: form.email,
        password: form.password,
        role: form.role,
      });
      login({ token: data.token, ...data.user });
      toast.success(`Account created! Welcome, ${data.user.name}!`);
      if (data.user.role === 'admin') {
        navigate('/admin/dashboard');
      } else if (data.user.role === 'doctor') {
        navigate('/doctor/dashboard');
      } else {
        navigate('/patient/dashboard');
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-teal-50/30 to-slate-100 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-96 h-96 bg-teal-200/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-teal-300/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

      <div className="relative bg-white/80 backdrop-blur-sm p-8 sm:p-10 rounded-3xl shadow-card-hover w-full max-w-md border border-white/60">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-gradient-to-br from-teal-500 to-teal-700 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-glow-teal">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.627 48.627 0 0 1 12 20.904a48.627 48.627 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold font-display text-gradient">MedAssist AI</h1>
          <p className="text-slate-400 mt-1 text-sm">CS 595 — Medical Informatics & AI</p>
        </div>

        <h2 className="text-lg font-semibold text-slate-800 mb-6">Create your account</h2>

        <form onSubmit={handleSubmit} className="space-y-4" aria-label="Create account form">
          <div>
            <label htmlFor="fullName" className="block text-sm font-medium text-slate-600 mb-1.5">Full Name</label>
            <input
              id="fullName"
              type="text"
              name="fullName"
              value={form.fullName}
              onChange={handleChange}
              required
              autoComplete="name"
              placeholder="John Doe"
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400 transition-all"
            />
          </div>

          <div>
            <label htmlFor="regEmail" className="block text-sm font-medium text-slate-600 mb-1.5">Email</label>
            <input
              id="regEmail"
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              required
              autoComplete="email"
              placeholder="you@example.com"
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400 transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-2">I am a...</label>
            <div className="grid grid-cols-2 gap-3">
              {['patient', 'doctor'].map((r) => (
                <label
                  key={r}
                  className={`flex items-center justify-center gap-2 border-2 rounded-xl py-3 cursor-pointer transition-all text-sm font-semibold capitalize
                    ${form.role === r
                      ? 'border-teal-500 bg-teal-50 text-teal-700 shadow-sm'
                      : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                >
                  <input
                    type="radio"
                    name="role"
                    value={r}
                    checked={form.role === r}
                    onChange={handleChange}
                    className="sr-only"
                  />
                  <span className="text-lg">{r === 'patient' ? '🤒' : '🩺'}</span> {r}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="regPassword" className="block text-sm font-medium text-slate-600 mb-1.5">Password</label>
            <input
              id="regPassword"
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              required
              minLength={6}
              autoComplete="new-password"
              placeholder="Min. 6 characters"
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400 transition-all"
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-600 mb-1.5">Confirm Password</label>
            <input
              id="confirmPassword"
              type="password"
              name="confirmPassword"
              value={form.confirmPassword}
              onChange={handleChange}
              required
              autoComplete="new-password"
              placeholder="Re-enter password"
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400 transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            aria-busy={loading}
            className="w-full bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-700 hover:to-teal-600 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-all shadow-md hover:shadow-lg"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                Creating account...
              </span>
            ) : 'Create Account'}
          </button>
        </form>

        <p className="text-center text-sm text-slate-500 mt-6">
          Already have an account?{' '}
          <Link to="/login" className="text-teal-600 hover:text-teal-700 font-semibold">
            Sign in
          </Link>
        </p>

        <div className="mt-6 p-3 bg-amber-50/80 border border-amber-200/60 rounded-xl text-xs text-amber-700 text-center">
          Educational project only — not a substitute for medical advice.
        </div>
      </div>
    </div>
  );
}
