import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Mail, User } from 'lucide-react';
import { AuthLayout } from '../components/AuthLayout';
import { PasswordField } from '../components/PasswordField';
import { Alert, Button, TextField, buttonClass } from '../components/ui';
import { MIN_PASSWORD_LENGTH } from '../lib/constants';
import { friendlyAuthError } from '../lib/errors';
import { supabase } from '../lib/supabase';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface RegisterErrors {
  name?: string;
  email?: string;
  password?: string;
}

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<RegisterErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const next: RegisterErrors = {};
    if (!name.trim()) next.name = 'Enter the name you want us to use.';
    else if (name.trim().length > 60) next.name = 'Use 60 characters or fewer.';
    if (!EMAIL_PATTERN.test(email.trim())) next.email = 'Enter a valid email address.';
    if (password.length < MIN_PASSWORD_LENGTH) next.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { display_name: name.trim() },
        emailRedirectTo: `${window.location.origin}/login`,
      },
    });
    setBusy(false);

    if (error) {
      setFormError(friendlyAuthError(error.message));
      return;
    }
    // With email confirmation on there is no session yet. With it off, the listener redirects into onboarding.
    if (!data.session) setSentTo(email.trim());
  }

  if (sentTo) {
    return (
      <AuthLayout>
        <h1 className="text-center text-2xl font-bold text-forest">Check your email</h1>
        <p className="mt-3 text-center text-sm text-muted">
          If <strong className="text-forest">{sentTo}</strong> can be registered, a confirmation link is on its way.
          Open it, then log in.
        </p>
        <Link to="/login" className={`${buttonClass('primary', true)} mt-6`}>
          Go to log in
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <h1 className="text-center text-2xl font-bold text-forest">Create your account</h1>
      <form onSubmit={(e) => void onSubmit(e)} noValidate className="mt-7 space-y-3">
        <TextField
          label="Your name"
          placeholder="Your name"
          autoComplete="given-name"
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
          icon={<User className="h-4 w-4" aria-hidden />}
        />
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
        <PasswordField
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          error={errors.password}
          hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
        />
        {formError && <Alert tone="error">{formError}</Alert>}
        <Button type="submit" full loading={busy}>
          Create account
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-forest underline-offset-2 hover:underline">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}
