import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthLayout } from '../components/AuthLayout';
import { GoogleButton } from '../components/GoogleButton';
import { Hero } from '../components/Hero';
import { Alert, SegmentedProgress, buttonClass } from '../components/ui';
import { GOOGLE_AUTH_ENABLED } from '../lib/constants';

const SLIDES = [
  { title: 'Practise with instant feedback', body: 'Original AZ-900 questions explain why each answer is right or wrong.' },
  { title: 'Remember what you forget', body: 'Flashcards come back sooner when a concept does not stick.' },
  { title: 'Plan around your exam date', body: 'Share your exam date and weekly hours, and get a schedule that fits.' },
];

export default function Welcome() {
  const [slide, setSlide] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const current = SLIDES[slide];

  return (
    <AuthLayout>
      <div className="flex flex-col items-center text-center">
        <Hero className="w-48" />
        <div aria-live="polite" className="mt-6">
          <h1 className="text-2xl font-bold text-forest">{current.title}</h1>
          <p className="mx-auto mt-2 max-w-xs text-sm text-muted">{current.body}</p>
        </div>
        <div className="mt-6 w-full">
          <SegmentedProgress total={SLIDES.length} current={slide} onSelect={setSlide} />
        </div>
        <div className="mt-6 flex w-full flex-col gap-3">
          <Link to="/register" className={buttonClass('lime', true)}>
            Create your account
          </Link>
          {GOOGLE_AUTH_ENABLED && <GoogleButton onError={setError} />}
          {error && <Alert tone="error">{error}</Alert>}
        </div>
        <p className="mt-5 text-sm text-muted">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-forest underline-offset-2 hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
