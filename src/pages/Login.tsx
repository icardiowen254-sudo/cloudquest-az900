import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { AuthLayout } from '../components/AuthLayout';
import { GoogleButton } from '../components/GoogleButton';
import { PasswordField } from '../components/PasswordField';
import { Alert, Button, TextField } from '../components/ui';
import { GOOGLE_AUTH_ENABLED } from '../lib/constants';
import { friendlyAuthError } from '../lib/errors';
import { supabase } from '../lib/supabase';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!EMAIL_PATTERN.test(email.trim())) next.email = 'Enter a valid email address.';
    if (!password) next.password = 'Enter your password.';
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setFormError(friendlyAuthError(error.message));
    // On success the auth listener fires and <PublicOnly> redirects into the app.
  }

  return (
    <AuthLayout>
      <h1 className="text-center text-2xl font-bold text-forest">Log in</h1>
      <form onSubmit={(e) => void onSubmit(e)} noValidate className="mt-7 space-y-3">
        <TextField
          label="Email"
          type="email"
          placeholder="Email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
          icon={<Mail className="h-4 w-4" aria-hidden />}
        />
        <PasswordField value={password} onChange={setPassword} autoComplete="current-password" error={errors.password} />
        <div className="text-center">
          <Link to="/forgot-password" className="text-sm text-muted underline underline-offset-2 hover:text-forest">
            Forgot password?
          </Link>
        </div>
        {formError && <Alert tone="error">{formError}</Alert>}
        <Button type="submit" full loading={busy}>
          Log in
        </Button>
      </form>

      {GOOGLE_AUTH_ENABLED && (
        <>
          <div className="my-5 flex items-center gap-3 text-sm text-muted">
            <span className="h-px flex-1 bg-forest/10" />
            or
            <span className="h-px flex-1 bg-forest/10" />
          </div>
          <GoogleButton onError={setFormError} />
        </>
      )}

      <p className="mt-6 text-center text-sm text-muted">
        Need an account?{' '}
        <Link to="/register" className="font-semibold text-forest underline-offset-2 hover:underline">
          Sign up
        </Link>
      </p>
    </AuthLayout>
  );
}
