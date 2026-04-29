import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider, useAuth } from './context/AuthContext';
import PrivateRoute from './components/PrivateRoute';
import Navbar from './components/Layout/Navbar';
import ErrorBoundary from './components/ErrorBoundary';
import SessionExpiryModal from './components/SessionExpiryModal';

// Auth pages
import Login from './pages/Auth/Login';
import Register from './pages/Auth/Register';
import ForgotPassword from './pages/Auth/ForgotPassword';
import ResetPassword from './pages/Auth/ResetPassword';
import EmailVerify from './pages/Auth/EmailVerify';

// Patient pages
import PatientDashboard from './pages/Patient/PatientDashboard';
import ReportHistory from './pages/Patient/ReportHistory';
import UploadReport from './pages/Patient/UploadReport';
import Analysis from './pages/Patient/Analysis';
import Doctors from './pages/Patient/Doctors';
import PatientProfile from './pages/Patient/Profile';
import Vitals from './pages/Patient/Vitals';

// Doctor pages
import DoctorDashboard from './pages/Doctor/Dashboard';
import DoctorAssist from './pages/Doctor/Assist';
import SharedReports from './pages/Doctor/SharedReports';
import DoctorPrescriptions from './pages/Doctor/Prescriptions';
import DrugChecker from './pages/Doctor/DrugChecker';
import DoctorAnalytics from './pages/Doctor/Analytics';
import DoctorProfile from './pages/Doctor/Profile';

// Appointments (doctor only)
import DoctorAppointments from './pages/Doctor/Appointments';

// Admin pages
import AdminDashboard from './pages/Admin/AdminDashboard';
import AuditLog from './pages/Admin/AuditLog';

// Public pages (no auth)
import SharedReport from './pages/Shared/SharedReport';

function Layout({ children }) {
  return (
    <div className="min-h-screen bg-slate-50 flex">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-teal-600 focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:text-sm focus:font-semibold"
      >
        Skip to main content
      </a>
      <Navbar />
      <div className="flex-1 min-h-screen overflow-y-auto">
        {/* Mobile top bar spacer */}
        <div className="h-14 md:hidden" />
        <main id="main-content" className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 text-center" role="note">
            This application is an educational CS 595 project and is NOT a substitute for professional medical advice.
          </div>
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>
    </div>
  );
}

function SmartRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'admin') return <Navigate to="/admin/dashboard" replace />;
  if (user.role === 'doctor') return <Navigate to="/doctor/dashboard" replace />;
  return <Navigate to="/patient/dashboard" replace />;
}

function P({ children }) {
  return <PrivateRoute role="patient"><Layout>{children}</Layout></PrivateRoute>;
}
function D({ children }) {
  return <PrivateRoute role="doctor"><Layout>{children}</Layout></PrivateRoute>;
}
function A({ children }) {
  return <PrivateRoute role="admin"><Layout>{children}</Layout></PrivateRoute>;
}

export default function App() {
  return (
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID || ''}>
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" toastOptions={{
          style: { borderRadius: '12px', fontSize: '14px' },
        }} />
        <SessionExpiryModal />
        <Routes>
          {/* Public — Auth */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/auth/verify-email" element={<EmailVerify />} />

          {/* Public — Shared views */}
          <Route path="/shared/:token" element={<SharedReport />} />

          {/* Patient */}
          <Route path="/patient/dashboard" element={<P><PatientDashboard /></P>} />
          <Route path="/patient/history" element={<P><ReportHistory /></P>} />
          <Route path="/patient/vitals" element={<P><Vitals /></P>} />
          <Route path="/patient/profile" element={<P><PatientProfile /></P>} />
          <Route path="/patient/upload-report" element={<P><UploadReport /></P>} />
          <Route path="/patient/upload-report/:sessionId" element={<P><UploadReport /></P>} />
          <Route path="/patient/analysis/:reportId" element={<P><Analysis /></P>} />
          <Route path="/patient/analysis" element={<P><Analysis /></P>} />
          <Route path="/patient/doctors" element={<P><Doctors /></P>} />

          {/* Doctor */}
          <Route path="/doctor/dashboard" element={<D><DoctorDashboard /></D>} />
          <Route path="/doctor/assist" element={<D><DoctorAssist /></D>} />
          <Route path="/doctor/shared-reports" element={<D><SharedReports /></D>} />
          <Route path="/doctor/prescriptions" element={<D><DoctorPrescriptions /></D>} />
          <Route path="/doctor/drug-checker" element={<D><DrugChecker /></D>} />
          <Route path="/doctor/analytics" element={<D><DoctorAnalytics /></D>} />
          <Route path="/doctor/profile" element={<D><DoctorProfile /></D>} />
          <Route path="/doctor/appointments" element={<D><DoctorAppointments /></D>} />

          {/* Admin */}
          <Route path="/admin/dashboard" element={<A><AdminDashboard /></A>} />
          <Route path="/admin/audit-log" element={<A><AuditLog /></A>} />

          {/* Default */}
          <Route path="/" element={<SmartRedirect />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
    </GoogleOAuthProvider>
  );
}
