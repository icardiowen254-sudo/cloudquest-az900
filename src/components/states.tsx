import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { friendlyDbError } from '../lib/errors';
import { AuthLayout } from './AuthLayout';
import { Alert, Button, Spinner, buttonClass } from './ui';

export function FullPageSpinner() {
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas">
      <Spinner label="Loading CloudQuest" />
    </div>
  );
}

export function SetupNotice() {
  return (
    <AuthLayout>
      <h1 className="text-center text-2xl font-bold text-forest">Connect Supabase to start</h1>
      <div className="mt-6 space-y-4 text-sm text-muted">
        <Alert tone="info">This app needs a Supabase project for sign-in and data. Nothing is simulated without one.</Alert>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Copy <code className="rounded bg-mist px-1.5 py-0.5 text-forest">.env.example</code> to{' '}
            <code className="rounded bg-mist px-1.5 py-0.5 text-forest">.env.local</code>.
          </li>
          <li>Paste your project URL and anon key from Supabase, under Project Settings, API.</li>
          <li>
            Restart <code className="rounded bg-mist px-1.5 py-0.5 text-forest">npm run dev</code>.
          </li>
        </ol>
      </div>
    </AuthLayout>
  );
}

export function ProfileLoadError({ message }: { message: string | null }) {
  const { refreshProfile, signOut } = useAuth();
  const [busy, setBusy] = useState(false);

  async function retry() {
    setBusy(true);
    await refreshProfile();
    setBusy(false);
  }

  return (
    <AuthLayout>
      <h1 className="text-center text-2xl font-bold text-forest">We could not load your profile</h1>
      <div className="mt-6">
        <Alert tone="error">{friendlyDbError(message ?? '')}</Alert>
      </div>
      <div className="mt-6 flex flex-col gap-3">
        <Button full loading={busy} onClick={() => void retry()}>
          Try again
        </Button>
        <Button full variant="soft" onClick={() => void signOut()}>
          Log out
        </Button>
      </div>
    </AuthLayout>
  );
}

export function NotFound() {
  return (
    <AuthLayout>
      <h1 className="text-center text-2xl font-bold text-forest">Page not found</h1>
      <p className="mt-2 text-center text-sm text-muted">That address does not lead anywhere in CloudQuest.</p>
      <Link to="/" className={`${buttonClass('primary', true)} mt-6`}>
        Back to CloudQuest
      </Link>
    </AuthLayout>
  );
}
