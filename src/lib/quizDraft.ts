// Exam-style quizzes keep selections in the browser until submit, so a refresh does not lose them.
// Nothing sensitive is stored: only the learner's own choices for this attempt. Storage can be unavailable, so every call is guarded.
interface Draft {
  selected: Record<string, string[]>;
  index: number;
}

const key = (attemptId: string) => `cloudquest-draft-${attemptId}`;

export function loadDraft(attemptId: string): Draft | null {
  try {
    const raw = window.sessionStorage.getItem(key(attemptId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Draft>;
    if (!parsed || typeof parsed.selected !== 'object' || parsed.selected === null) return null;
    return { selected: parsed.selected, index: Number.isInteger(parsed.index) ? Number(parsed.index) : 0 };
  } catch {
    return null;
  }
}

export function saveDraft(attemptId: string, draft: Draft): void {
  try {
    window.sessionStorage.setItem(key(attemptId), JSON.stringify(draft));
  } catch {
    /* storage unavailable: selections simply will not survive a refresh */
  }
}

export function clearDraft(attemptId: string): void {
  try {
    window.sessionStorage.removeItem(key(attemptId));
  } catch {
    /* ignore */
  }
}
