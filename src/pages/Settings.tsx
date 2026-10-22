import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { DaysField, ExamDateField, HoursField, NameField, PreferenceFields } from '../components/GoalFields';
import { Alert, Button, Card } from '../components/ui';
import { formFromProfile, hasErrors, validateGoals, type GoalsErrors, type GoalsForm } from '../lib/goals';
import { saveGoals } from '../lib/profileApi';
import type { Profile } from '../types';

function SettingsForm({ profile }: { profile: Profile }) {
  const { user, refreshProfile, signOut } = useAuth();
  const [form, setForm] = useState<GoalsForm>(() => formFromProfile(profile));
  const [errors, setErrors] = useState<GoalsErrors>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const patch = (changes: Partial<GoalsForm>) => {
    setSaved(false);
    setForm((f) => ({ ...f, ...changes }));
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaved(false);
    setSaveError(null);
    const found = validateGoals(form);
    setErrors(found);
    if (hasErrors(found) || !user) return;

    setBusy(true);
    try {
      await saveGoals(user.id, form);
      await refreshProfile();
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save your settings. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-forest sm:text-3xl">Settings</h1>
        <p className="mt-1 text-muted">Your goals shape your dashboard and study plan.</p>
      </header>

      <form onSubmit={(e) => void onSubmit(e)} noValidate className="space-y-6">
        <Card className="space-y-5">
          <h2 className="text-lg font-bold text-forest">You and your exam</h2>
          <NameField form={form} errors={errors} onChange={patch} />
          <ExamDateField form={form} errors={errors} onChange={patch} />
        </Card>
        <Card className="space-y-5">
          <h2 className="text-lg font-bold text-forest">Study time</h2>
          <HoursField form={form} errors={errors} onChange={patch} />
          <DaysField form={form} errors={errors} onChange={patch} />
        </Card>
        <Card className="space-y-5">
          <h2 className="text-lg font-bold text-forest">Learning preferences</h2>
          <PreferenceFields form={form} onChange={patch} />
        </Card>

        {saveError && <Alert tone="error">{saveError}</Alert>}
        {saved && <Alert tone="success">Your settings are saved.</Alert>}
        <Button type="submit" loading={busy}>
          Save changes
        </Button>
      </form>

      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-forest">Account</h2>
          <p className="truncate text-sm text-muted">{user?.email}</p>
        </div>
        <Button variant="soft" onClick={() => void signOut()}>
          Log out
        </Button>
      </Card>
    </div>
  );
}

export default function SettingsPage() {
  const { profile } = useAuth();
  return profile ? <SettingsForm profile={profile} /> : null;
}
