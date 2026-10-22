import type { ReactNode } from 'react';
import { DISCLAIMER } from '../lib/constants';
import { Logo } from './Logo';

/** Centred white card on a warm background, matching the login reference. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-sand p-4">
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full"
        preserveAspectRatio="none"
        viewBox="0 0 800 600"
        fill="none"
        stroke="#cdcdc6"
        strokeWidth={1}
      >
        <path vectorEffect="non-scaling-stroke" d="M-20 140C160 80 260 220 420 170S700 60 840 150" />
        <path vectorEffect="non-scaling-stroke" d="M-20 420C200 360 300 520 480 470S700 400 840 500" />
        <path vectorEffect="non-scaling-stroke" d="M-20 470C220 410 320 570 500 520S720 450 840 550" />
      </svg>
      <main className="relative w-full max-w-md py-6">
        <div className="rounded-4xl bg-white px-6 py-9 shadow-card sm:px-10">
          <div className="mb-7 flex justify-center">
            <Logo />
          </div>
          {children}
        </div>
        <p className="mt-4 px-2 text-center text-xs leading-relaxed text-muted">{DISCLAIMER}</p>
      </main>
    </div>
  );
}
