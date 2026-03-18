import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import PrivateRoute from './components/PrivateRoute';
import Navbar from './components/Layout/Navbar';
import ErrorBoundary from './components/ErrorBoundary';

// Auth pages
import Login from './pages/Auth/Login';
import Register from './pages/Auth/Register';

// Patient pages
import PatientDashboard from './pages/Patient/PatientDashboard';
import Intake from './pages/Patient/Intake';
import Results from './pages/Patient/Results';
import Tests from './pages/Patient/Tests';
import UploadReport from './pages/Patient/UploadReport';
import Analysis from './pages/Patient/Analysis';
import Doctors from './pages/Patient/Doctors';

// Doctor pages
import DoctorDashboard from './pages/Doctor/Dashboard';
import DoctorAssist from './pages/Doctor/Assist';

function Layout({ children }) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Skip-to-content for keyboard users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-blue-600 focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:text-sm focus:font-semibold"
      >
        Skip to main content
      </a>
      <Navbar />
      <main id="main-content" className="max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-800 text-center" role="note">
          This application is an educational CS 595 project and is NOT a substitute for professional medical advice.
        </div>
        <ErrorBoundary>{children}</ErrorBoundary>
      </main>
    </div>
  );
}

// Shorthand wrappers to reduce repetition
function P({ children }) {
  return <PrivateRoute role="patient"><Layout>{children}</Layout></PrivateRoute>;
}
function D({ children }) {
  return <PrivateRoute role="doctor"><Layout>{children}</Layout></PrivateRoute>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" />
        <Routes>
          {/* Public */}
          <Route path="/login"    element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Patient — dashboard is the new home after login */}
          <Route path="/patient/dashboard" element={<P><PatientDashboard /></P>} />
          <Route path="/patient/intake"    element={<P><Intake /></P>} />

          {/* Patient — URL-param routes (bookmarkable, resumable) */}
          <Route path="/patient/results/:sessionId"       element={<P><Results /></P>} />
          <Route path="/patient/tests/:sessionId"         element={<P><Tests /></P>} />
          <Route path="/patient/upload-report/:sessionId" element={<P><UploadReport /></P>} />
          <Route path="/patient/analysis/:reportId"       element={<P><Analysis /></P>} />

          {/* Patient — flat routes (backward compat / state-based fresh flows) */}
          <Route path="/patient/results"       element={<P><Results /></P>} />
          <Route path="/patient/tests"         element={<P><Tests /></P>} />
          <Route path="/patient/upload-report" element={<P><UploadReport /></P>} />
          <Route path="/patient/analysis"      element={<P><Analysis /></P>} />
          <Route path="/patient/doctors"       element={<P><Doctors /></P>} />

          {/* Doctor */}
          <Route path="/doctor/dashboard" element={<D><DoctorDashboard /></D>} />
          <Route path="/doctor/assist"    element={<D><DoctorAssist /></D>} />

          {/* Default */}
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
