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

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" />
        <Routes>
          {/* Public */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Patient */}
          <Route path="/patient/intake" element={
            <PrivateRoute role="patient"><Layout><Intake /></Layout></PrivateRoute>
          } />
          <Route path="/patient/results" element={
            <PrivateRoute role="patient"><Layout><Results /></Layout></PrivateRoute>
          } />
          <Route path="/patient/tests" element={
            <PrivateRoute role="patient"><Layout><Tests /></Layout></PrivateRoute>
          } />
          <Route path="/patient/upload-report" element={
            <PrivateRoute role="patient"><Layout><UploadReport /></Layout></PrivateRoute>
          } />
          <Route path="/patient/analysis" element={
            <PrivateRoute role="patient"><Layout><Analysis /></Layout></PrivateRoute>
          } />
          <Route path="/patient/doctors" element={
            <PrivateRoute role="patient"><Layout><Doctors /></Layout></PrivateRoute>
          } />

          {/* Doctor */}
          <Route path="/doctor/dashboard" element={
            <PrivateRoute role="doctor"><Layout><DoctorDashboard /></Layout></PrivateRoute>
          } />
          <Route path="/doctor/assist" element={
            <PrivateRoute role="doctor"><Layout><DoctorAssist /></Layout></PrivateRoute>
          } />

          {/* Default */}
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
