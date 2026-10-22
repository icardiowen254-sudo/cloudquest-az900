import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { AuthLayout } from '../components/AuthLayout';
import { Alert, Button, TextField } from '../components/ui';
import { friendlyAuthError } from '../lib/errors';
import { supabase } from '../lib/supabase';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!EMAIL_PATTERN.test(email.trim())) {
      setEmailError('Enter a valid email address.');
      return;
    }
    setEmailError(undefined);
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) setFormError(friendlyAuthError(error.message));
    else setSent(true);
  }

  return (
    <AuthLayout>
      <h1 className="text-center text-2xl font-bold text-forest">Reset your password</h1>
      {sent ? (
        <div className="mt-6 space-y-5">
          <Alert tone="success">
            If an account exists for {email.trim()}, a reset link is on its way. It can take a few minutes to arrive.
          </Alert>
          <Link to="/login" className="block text-center text-sm font-semibold text-forest underline-offset-2 hover:underline">
            Back to log in
          </Link>
        </div>
      ) : (
        <form onSubmit={(e) => void onSubmit(e)} noValidate className="mt-7 space-y-3">
          <p className="px-2 text-center text-sm text-muted">Enter your email and we will send you a link to choose a new password.</p>
          <TextField
            label="Email"
            type="email"
            placeholder="Email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={emailError}
            icon={<Mail className="h-4 w-4" aria-hidden />}
          />
          {formError && <Alert tone="error">{formError}</Alert>}
          <Button type="submit" full loading={busy}>
            Send reset link
          </Button>
          <div className="pt-2 text-center">
            <Link to="/login" className="text-sm text-muted underline underline-offset-2 hover:text-forest">
              Back to log in
            </Link>
          </div>
        </form>
      )}
    </AuthLayout>
  );
}
