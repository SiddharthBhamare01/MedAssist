import { useLocation, useNavigate } from 'react-router-dom';

export default function Results() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const sessionId = state?.sessionId;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
        <div className="text-5xl mb-4">🧬</div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">Symptoms Received!</h2>
        {sessionId && (
          <p className="text-sm text-gray-500 mb-2">
            Session ID: <code className="bg-gray-100 px-2 py-0.5 rounded text-xs">{sessionId}</code>
          </p>
        )}
        <p className="text-gray-500 text-sm mb-6">
          The Diagnostic Agent (Gemini AI) will be connected in Day 4.<br />
          It will analyse your symptoms and return the top 5 predicted diseases with ICD codes.
        </p>
        <button
          onClick={() => navigate('/patient/intake')}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors"
        >
          ← Back to Intake
        </button>
      </div>
    </div>
  );
}
