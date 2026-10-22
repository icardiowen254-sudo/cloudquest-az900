import type { ReactElement, ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DISCLAIMER } from './lib/constants';
import type { Profile } from './types';

const profile: Profile = {
  id: 'u1',
  display_name: 'Ada',
  exam_date: '2030-01-15',
  weekly_study_hours: 6,
  study_days: [1, 3, 5],
  explanation_style: 'simple',
  local_examples: true,
  onboarded_at: null,
};

vi.mock('./auth/AuthProvider', () => ({
  useAuth: () => ({
    session: null,
    user: { email: 'ada@example.test' },
    profile,
    loading: false,
    profileError: null,
    refreshProfile: async () => {},
    signOut: async () => {},
  }),
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}));

// React's server renderer separates adjacent text nodes with <!-- -->. Strip it so assertions read like the screen.
const render = (ui: ReactElement) =>
  renderToString(<StaticRouter location="/">{ui}</StaticRouter>).replace(/<!-- -->/g, '');

// These render every screen once to catch crashes, missing context and broken copy.
// They do not replace testing against a live Supabase project.
describe('screens render', () => {
  it('welcome shows the call to action and the unofficial disclaimer', async () => {
    const { default: Welcome } = await import('./pages/Welcome');
    const html = render(<Welcome />);
    expect(html).toContain('Create your account');
    expect(html).toContain('Already have an account?');
    expect(html).toContain(DISCLAIMER);
  });

  it('login offers password recovery and sign up', async () => {
    const { default: Login } = await import('./pages/Login');
    const html = render(<Login />);
    expect(html).toContain('Forgot password?');
    expect(html).toContain('Need an account?');
    expect(html).toContain(DISCLAIMER);
  });

  it('register and forgot-password forms render', async () => {
    const { default: Register } = await import('./pages/Register');
    const { default: ForgotPassword } = await import('./pages/ForgotPassword');
    expect(render(<Register />)).toContain('Create account');
    expect(render(<ForgotPassword />)).toContain('Send reset link');
  });

  it('onboarding starts at the name step, prefilled from the profile', async () => {
    const { default: Onboarding } = await import('./pages/Onboarding');
    const html = render(<Onboarding />);
    expect(html).toContain('What should we call you?');
    expect(html).toContain('value="Ada"');
    expect(html).toContain('Step 1 of 4');
  });

  it('settings lists every goal field', async () => {
    const { default: SettingsPage } = await import('./pages/Settings');
    const html = render(<SettingsPage />);
    for (const text of ['Exam date', 'Study hours per week', 'Study days', 'Use African examples', 'Save changes']) {
      expect(html).toContain(text);
    }
  });

  it('dashboard greets the learner and shows real profile values', async () => {
    const { default: Dashboard } = await import('./pages/Dashboard');
    const html = render(<Dashboard />);
    expect(html).toContain('Hello, Ada');
    expect(html).toContain('Days to exam');
    expect(html).toContain('6 h');
    // Practice figures come from the database after load, so the first render only shows the loading state.
    expect(html).toContain('Loading your progress');
  });

  it('quiz setup page renders its heading and loading state', async () => {
    const { default: QuizHome } = await import('./pages/QuizHome');
    const html = render(<QuizHome />);
    expect(html).toContain('Practice quizzes');
    expect(html).toContain('not real exam questions');
    expect(html).toContain('Loading quiz options');
  });

  it('quiz and results pages start in a loading state', async () => {
    const { default: QuizRun } = await import('./pages/QuizRun');
    const { default: QuizResults } = await import('./pages/QuizResults');
    expect(render(<QuizRun />)).toContain('Loading your quiz');
    expect(render(<QuizResults />)).toContain('Loading your results');
  });

  it('app shell shows navigation and the disclaimer', async () => {
    const { AppShell } = await import('./components/AppShell');
    const html = render(<AppShell />);
    expect(html).toContain('Dashboard');
    expect(html).toContain('Quizzes');
    expect(html).toContain('Settings');
    expect(html).toContain('Log out');
    expect(html).toContain(DISCLAIMER);
  });
});
