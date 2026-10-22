import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { AuthLayout } from '../components/AuthLayout';
import { PasswordField } from '../components/PasswordField';
import { FullPageSpinner } from '../components/states';
import { Alert, Button, buttonClass } from '../components/ui';
import { MIN_PASSWORD_LENGTH } from '../lib/constants';
import { friendlyAuthError } from '../lib/errors';
import { supabase } from '../lib/supabase';

export default function ResetPassword() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) return <FullPageSpinner />;

  // The emailed link signs the learner in with a short-lived recovery session. No session means the link is invalid or expired.
  if (!session) {
    return (
      <AuthLayout>
        <h1 className="text-center text-2xl font-bold text-forest">This link has expired</h1>
        <p className="mt-3 text-center text-sm text-muted">Reset links work once and expire quickly. Request a new one.</p>
        <Link to="/forgot-password" className={`${buttonClass('primary', true)} mt-6`}>
          Request a new link
        </Link>
      </AuthLayout>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setFieldError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    setFieldError(undefined);
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setFormError(friendlyAuthError(error.message));
      return;
    }
    navigate('/dashboard', { replace: true });
  }

  return (
    <AuthLayout>
      <h1 className="text-center text-2xl font-bold text-forest">Choose a new password</h1>
      <form onSubmit={(e) => void onSubmit(e)} noValidate className="mt-7 space-y-3">
        <PasswordField
          label="New password"
          placeholder="New password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          error={fieldError}
          hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
        />
        {formError && <Alert tone="error">{formError}</Alert>}
        <Button type="submit" full loading={busy}>
          Save password
        </Button>
      </form>
    </AuthLayout>
  );
}
