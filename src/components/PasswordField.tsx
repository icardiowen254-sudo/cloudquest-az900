import { useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { TextField } from './ui';

interface PasswordFieldProps {
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password';
  label?: string;
  placeholder?: string;
  error?: string;
  hint?: string;
}

export function PasswordField({
  value,
  onChange,
  autoComplete,
  label = 'Password',
  placeholder = 'Password',
  error,
  hint,
}: PasswordFieldProps) {
  const [show, setShow] = useState(false);
  return (
    <TextField
      label={label}
      placeholder={placeholder}
      type={show ? 'text' : 'password'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      autoComplete={autoComplete}
      error={error}
      hint={hint}
      icon={<Lock className="h-4 w-4" aria-hidden />}
      trailing={
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? 'Hide password' : 'Show password'}
          aria-pressed={show}
          className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-mist"
        >
          {show ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
        </button>
      }
    />
  );
}
