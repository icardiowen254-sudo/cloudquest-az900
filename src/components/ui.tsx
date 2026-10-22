import { useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'lime' | 'soft' | 'ghost';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-forest text-white hover:bg-forest-600',
  lime: 'bg-lime text-forest hover:brightness-95',
  soft: 'bg-mist text-forest hover:bg-forest-100',
  ghost: 'text-forest hover:bg-mist',
};

/** Shared pill-button styling. Also used on router <Link>s so links and buttons look identical. */
export function buttonClass(variant: ButtonVariant = 'primary', full = false): string {
  return [
    'inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-semibold transition-colors',
    'disabled:cursor-not-allowed disabled:opacity-60',
    VARIANTS[variant],
    full ? 'w-full' : '',
  ].join(' ');
}

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: ButtonVariant;
  full?: boolean;
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  full = false,
  loading = false,
  disabled,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass(variant, full)}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  label: string;
  icon?: ReactNode;
  trailing?: ReactNode;
  error?: string;
  hint?: string;
  /** Show the label above the field. Auth fields use placeholders, so their labels stay screen-reader only. */
  visibleLabel?: boolean;
}

export function TextField({ label, icon, trailing, error, hint, visibleLabel = false, id, ...rest }: TextFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const messageId = `${inputId}-message`;
  const message = error ?? hint;

  return (
    <div>
      <label
        htmlFor={inputId}
        className={visibleLabel ? 'mb-1.5 block px-1 text-sm font-semibold text-forest' : 'sr-only'}
      >
        {label}
      </label>
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted">{icon}</span>
        )}
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={message ? messageId : undefined}
          className={`h-12 w-full rounded-full border bg-white text-[15px] text-ink placeholder:text-muted focus:border-forest focus:outline-none focus:ring-2 focus:ring-forest/40 ${
            icon ? 'pl-11' : 'pl-5'
          } ${trailing ? 'pr-12' : 'pr-5'} ${error ? 'border-danger' : 'border-forest/15'}`}
          {...rest}
        />
        {trailing && <span className="absolute right-1.5 top-1/2 -translate-y-1/2">{trailing}</span>}
      </div>
      {message && (
        <p id={messageId} className={`mt-1.5 px-4 text-sm ${error ? 'text-danger' : 'text-muted'}`}>
          {message}
        </p>
      )}
    </div>
  );
}

export function Alert({ tone, children }: { tone: 'error' | 'success' | 'info'; children: ReactNode }) {
  const styles = {
    error: 'border-red-200 bg-red-50 text-danger',
    success: 'border-lime bg-lime-soft text-forest',
    info: 'border-forest/10 bg-mist text-forest',
  }[tone];
  const Icon = tone === 'error' ? AlertTriangle : tone === 'success' ? CheckCircle2 : Info;
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-2.5 rounded-2xl border px-4 py-3 text-sm ${styles}`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 text-sm text-muted">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      <span>{label}…</span>
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-3xl bg-white p-5 shadow-card sm:p-6 ${className}`}>{children}</section>;
}

interface SegmentedProgressProps {
  total: number;
  current: number;
  /** When provided, each segment becomes a button (used by the welcome slides). */
  onSelect?: (index: number) => void;
}

export function SegmentedProgress({ total, current, onSelect }: SegmentedProgressProps) {
  return (
    <div className="flex gap-2" role="group" aria-label={`Step ${current + 1} of ${total}`}>
      {Array.from({ length: total }, (_, i) => {
        const bar = (
          <span className={`block h-1 rounded-full transition-colors ${i <= current ? 'bg-lime' : 'bg-forest/10'}`} />
        );
        return onSelect ? (
          <button
            key={i}
            type="button"
            aria-label={`Go to step ${i + 1}`}
            aria-current={i === current ? 'step' : undefined}
            onClick={() => onSelect(i)}
            className="flex-1 py-2"
          >
            {bar}
          </button>
        ) : (
          <span key={i} className="flex-1">
            {bar}
          </span>
        );
      })}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description?: string;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p id={`${id}-label`} className="text-sm font-semibold text-forest">
          {label}
        </p>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? 'bg-forest' : 'bg-muted'}`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${checked ? 'left-6' : 'left-1'}`}
        />
      </button>
    </div>
  );
}

export function ToggleChip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`h-10 min-w-[3rem] rounded-full border px-4 text-sm font-semibold transition-colors ${
        pressed ? 'border-forest bg-forest text-white' : 'border-forest/15 bg-white text-forest hover:bg-mist'
      }`}
    >
      {children}
    </button>
  );
}
