import { Check, CheckCircle2, ExternalLink, X, XCircle } from 'lucide-react';
import type { QuestionKind, QuestionReview, ReviewOption, RunOption } from '../lib/quizTypes';

interface OptionListProps {
  groupName: string;
  kind: QuestionKind;
  options: RunOption[];
  selected: string[];
  disabled?: boolean;
  onToggle?: (optionId: string) => void;
  /** When present, options show whether they were right, with the explanation for each. */
  review?: QuestionReview | null;
}

/** Native radio or checkbox inputs, so keyboard and screen-reader behaviour comes for free. */
export function OptionList({ groupName, kind, options, selected, disabled = false, onToggle, review }: OptionListProps) {
  const sorted = [...options].sort((a, b) => a.position - b.position);
  const byId = new Map<string, ReviewOption>((review?.options ?? []).map((o) => [o.id, o] as [string, ReviewOption]));

  return (
    <ul className="space-y-3">
      {sorted.map((opt, index) => {
        const checked = selected.includes(opt.id);
        const info = byId.get(opt.id);
        const isRight = info?.is_correct === true;
        const wrongPick = Boolean(info) && checked && !isRight;

        const tone = info
          ? isRight
            ? 'border-lime bg-lime-soft'
            : wrongPick
              ? 'border-danger bg-red-50'
              : 'border-forest/10 bg-white'
          : checked
            ? 'border-forest bg-white ring-2 ring-forest/30'
            : 'border-forest/15 bg-white hover:bg-mist';

        const marker = info ? (
          isRight ? <Check className="h-4 w-4" aria-hidden /> : wrongPick ? <X className="h-4 w-4" aria-hidden /> : String.fromCharCode(65 + index)
        ) : checked ? (
          <Check className="h-4 w-4" aria-hidden />
        ) : (
          String.fromCharCode(65 + index)
        );

        return (
          <li key={opt.id}>
            <label
              className={`flex items-start gap-3 rounded-2xl border p-4 transition-colors focus-within:ring-2 focus-within:ring-forest ${tone} ${
                disabled ? 'cursor-default' : 'cursor-pointer'
              }`}
            >
              <input
                type={kind === 'single' ? 'radio' : 'checkbox'}
                name={groupName}
                className="sr-only"
                checked={checked}
                disabled={disabled}
                onChange={() => onToggle?.(opt.id)}
              />
              <span
                aria-hidden
                className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center border-2 text-xs font-bold ${
                  kind === 'single' ? 'rounded-full' : 'rounded-md'
                } ${
                  isRight && info
                    ? 'border-forest bg-forest text-white'
                    : wrongPick
                      ? 'border-danger bg-danger text-white'
                      : checked
                        ? 'border-forest bg-forest text-white'
                        : 'border-forest/30 bg-white text-muted'
                }`}
              >
                {marker}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] leading-snug text-ink">{opt.body}</span>
                {info && isRight && (
                  <span className="mt-1.5 block text-xs font-bold uppercase tracking-wide text-forest">Correct answer</span>
                )}
                {wrongPick && <span className="mt-1.5 block text-xs font-bold uppercase tracking-wide text-danger">Your answer</span>}
                {info?.note && <span className="mt-1 block text-sm leading-snug text-muted">{info.note}</span>}
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

/** Verdict, explanation, the skill being tested and a link to the official documentation. */
export function ExplanationPanel({ review }: { review: QuestionReview }) {
  return (
    <div
      role="status"
      className={`rounded-2xl border p-4 ${review.is_correct ? 'border-lime bg-lime-soft' : 'border-gold bg-gold-soft'}`}
    >
      <p className="flex items-center gap-2 font-bold text-forest">
        {review.is_correct ? <CheckCircle2 className="h-5 w-5" aria-hidden /> : <XCircle className="h-5 w-5" aria-hidden />}
        {review.is_correct ? 'Correct' : 'Not quite'}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-ink">{review.explanation}</p>
      <p className="mt-2 text-xs text-muted">Skill: {review.learning_objective}</p>
      {review.reference_url && (
        <a
          href={review.reference_url}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-forest underline underline-offset-2"
        >
          Read more in the official docs <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      )}
    </div>
  );
}
