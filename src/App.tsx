import { Route, Routes } from 'react-router-dom';
import { PublicOnly, RequireAuth, RequireOnboarded } from './auth/guards';
import { AppShell } from './components/AppShell';
import { NotFound, SetupNotice } from './components/states';
import { isSupabaseConfigured } from './lib/supabase';
import Dashboard from './pages/Dashboard';
import ForgotPassword from './pages/ForgotPassword';
import Login from './pages/Login';
import Onboarding from './pages/Onboarding';
import QuizHome from './pages/QuizHome';
import QuizResults from './pages/QuizResults';
import QuizRun from './pages/QuizRun';
import Register from './pages/Register';
import ResetPassword from './pages/ResetPassword';
import SettingsPage from './pages/Settings';
import Welcome from './pages/Welcome';

export default function App() {
  if (!isSupabaseConfigured) return <SetupNotice />;

  return (
    <Routes>
      <Route element={<PublicOnly />}>
        <Route path="/" element={<Welcome />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
      </Route>

      {/* Outside PublicOnly on purpose: the emailed link creates a recovery session. */}
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route element={<RequireAuth />}>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route element={<RequireOnboarded />}>
          <Route element={<AppShell />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/quiz" element={<QuizHome />} />
            <Route path="/quiz/:attemptId" element={<QuizRun />} />
            <Route path="/quiz/:attemptId/results" element={<QuizResults />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
