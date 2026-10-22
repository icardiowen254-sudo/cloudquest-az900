import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { AuthLayout } from '../components/AuthLayout';
import { DaysField, ExamDateField, HoursField, NameField, PreferenceFields } from '../components/GoalFields';
import { Alert, Button, SegmentedProgress } from '../components/ui';
import {
  formFromProfile,
  hasErrors,
  validateGoals,
  type GoalsErrors,
  type GoalsField,
  type GoalsForm,
} from '../lib/goals';
import { saveGoals } from '../lib/profileApi';
import type { Profile } from '../types';

const STEPS: { title: string; body: string; fields: GoalsField[] }[] = [
  { title: 'What should we call you?', body: 'We use this name to greet you in the app.', fields: ['displayName'] },
  { title: 'When is your exam?', body: 'We count down the days and plan your study around it.', fields: ['examDate'] },
  { title: 'How much time can you study?', body: 'Choose hours and days that are realistic for you.', fields: ['weeklyHours', 'studyDays'] },
  { title: 'How do you like to learn?', body: 'These choices shape how the study buddy explains things.', fields: [] },
];

function OnboardingFlow({ profile }: { profile: Profile }) {
  const { user, refreshProfile } = useAuth();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<GoalsForm>(() => formFromProfile(profile));
  const [errors, setErrors] = useState<GoalsErrors>({});
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const patch = (changes: Partial<GoalsForm>) => setForm((f) => ({ ...f, ...changes }));

  async function next() {
    const all = validateGoals(form);
    const stepErrors: GoalsErrors = {};
    for (const field of current.fields) if (all[field]) stepErrors[field] = all[field];
    setErrors(stepErrors);
    if (hasErrors(stepErrors)) return;
    if (!isLast) {
      setStep(step + 1);
      return;
    }

    if (hasErrors(all)) {
      // An earlier answer became invalid (for example the date rolled over). Send the learner back to it.
      setErrors(all);
      setStep(Math.max(0, STEPS.findIndex((s) => s.fields.some((f) => all[f]))));
      return;
    }
    if (!user) return;

    setBusy(true);
    setSaveError(null);
    try {
      await saveGoals(user.id, form, { markOnboarded: true });
      await refreshProfile(); // onboarded_at is now set, so this page redirects to the dashboard
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save your goals. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <SegmentedProgress total={STEPS.length} current={step} />
      <p className="mt-2 text-center text-xs text-muted">
        Step {step + 1} of {STEPS.length}
      </p>
      <h1 className="mt-6 text-center text-2xl font-bold text-forest">{current.title}</h1>
      <p className="mt-2 text-center text-sm text-muted">{current.body}</p>

      <form
        noValidate
        className="mt-7 space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void next();
        }}
      >
        {step === 0 && <NameField form={form} errors={errors} onChange={patch} />}
        {step === 1 && <ExamDateField form={form} errors={errors} onChange={patch} />}
        {step === 2 && (
          <>
            <HoursField form={form} errors={errors} onChange={patch} />
            <DaysField form={form} errors={errors} onChange={patch} />
          </>
        )}
        {step === 3 && <PreferenceFields form={form} onChange={patch} />}

        {saveError && <Alert tone="error">{saveError}</Alert>}

        <div className="flex gap-3 pt-2">
          {step > 0 && (
            <Button
              variant="soft"
              onClick={() => {
                setErrors({});
                setStep(step - 1);
              }}
            >
              Back
            </Button>
          )}
          <Button type="submit" full loading={busy}>
            {isLast ? 'Start learning' : 'Continue'}
          </Button>
        </div>
      </form>
    </AuthLayout>
  );
}

export default function Onboarding() {
  const { profile } = useAuth();
  if (!profile) return null;
  if (profile.onboarded_at) return <Navigate to="/dashboard" replace />;
  return <OnboardingFlow profile={profile} />;
}
