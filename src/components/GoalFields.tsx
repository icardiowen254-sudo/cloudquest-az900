import { CalendarDays, Clock, User } from 'lucide-react';
import { WEEKDAYS, todayISO, type GoalsErrors, type GoalsForm } from '../lib/goals';
import { Switch, TextField, ToggleChip } from './ui';

interface FieldProps {
  form: GoalsForm;
  errors: GoalsErrors;
  onChange: (patch: Partial<GoalsForm>) => void;
}

export function NameField({ form, errors, onChange }: FieldProps) {
  return (
    <TextField
      visibleLabel
      label="Your name"
      value={form.displayName}
      onChange={(e) => onChange({ displayName: e.target.value })}
      error={errors.displayName}
      autoComplete="given-name"
      maxLength={60}
      icon={<User className="h-4 w-4" aria-hidden />}
    />
  );
}

export function ExamDateField({ form, errors, onChange }: FieldProps) {
  return (
    <TextField
      visibleLabel
      label="Exam date"
      type="date"
      min={todayISO()}
      value={form.examDate}
      onChange={(e) => onChange({ examDate: e.target.value })}
      error={errors.examDate}
      hint="Leave this blank if you have not booked an exam yet."
      icon={<CalendarDays className="h-4 w-4" aria-hidden />}
    />
  );
}

export function HoursField({ form, errors, onChange }: FieldProps) {
  return (
    <fieldset>
      <legend className="mb-1.5 px-1 text-sm font-semibold text-forest">Study hours per week</legend>
      <div className="mb-3 flex flex-wrap gap-2">
        {[3, 5, 8, 12].map((h) => (
          <ToggleChip key={h} pressed={form.weeklyHours === h} onClick={() => onChange({ weeklyHours: h })}>
            {h} h
          </ToggleChip>
        ))}
      </div>
      <TextField
        label="Hours per week"
        type="number"
        inputMode="decimal"
        min={1}
        max={80}
        step={0.5}
        value={Number.isFinite(form.weeklyHours) ? form.weeklyHours : ''}
        onChange={(e) => onChange({ weeklyHours: e.target.value === '' ? NaN : Number(e.target.value) })}
        error={errors.weeklyHours}
        icon={<Clock className="h-4 w-4" aria-hidden />}
      />
    </fieldset>
  );
}

export function DaysField({ form, errors, onChange }: FieldProps) {
  function toggle(day: number) {
    const next = form.studyDays.includes(day)
      ? form.studyDays.filter((d) => d !== day)
      : [...form.studyDays, day].sort((a, b) => a - b);
    onChange({ studyDays: next });
  }

  return (
    <fieldset>
      <legend className="mb-1.5 px-1 text-sm font-semibold text-forest">Study days</legend>
      <div className="flex flex-wrap gap-2">
        {WEEKDAYS.map((label, day) => (
          <ToggleChip key={label} pressed={form.studyDays.includes(day)} onClick={() => toggle(day)}>
            {label}
          </ToggleChip>
        ))}
      </div>
      {errors.studyDays && (
        <p role="alert" className="mt-1.5 px-1 text-sm text-danger">
          {errors.studyDays}
        </p>
      )}
    </fieldset>
  );
}

const STYLES = [
  { value: 'simple', label: 'Short and simple' },
  { value: 'detailed', label: 'More detail' },
] as const;

export function PreferenceFields({ form, onChange }: Pick<FieldProps, 'form' | 'onChange'>) {
  return (
    <div className="space-y-6">
      <Switch
        checked={form.localExamples}
        onChange={(localExamples) => onChange({ localExamples })}
        label="Use African examples"
        description="When an example helps, the study buddy draws on everyday life in Africa."
      />
      <div>
        <p id="explanation-style-label" className="mb-1.5 px-1 text-sm font-semibold text-forest">
          Explanation style
        </p>
        <div role="radiogroup" aria-labelledby="explanation-style-label" className="grid grid-cols-2 gap-2">
          {STYLES.map((s) => (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={form.explanationStyle === s.value}
              onClick={() => onChange({ explanationStyle: s.value })}
              className={`h-11 rounded-full border text-sm font-semibold transition-colors ${
                form.explanationStyle === s.value
                  ? 'border-forest bg-forest text-white'
                  : 'border-forest/15 bg-white text-forest hover:bg-mist'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
