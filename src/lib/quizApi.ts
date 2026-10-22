import { friendlyDbError, friendlyQuizError } from './errors';
import type {
  AttemptMeta,
  AttemptResult,
  CatalogQuestion,
  Difficulty,
  QuestionKind,
  QuestionReview,
  QuizSettings,
  RecentAttempt,
  RunQuestion,
  SubtopicPerformance,
  TopicSummary,
} from './quizTypes';
import { supabase } from './supabase';

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(friendlyQuizError(error.message));
  return data as T;
}

export async function fetchTopics(): Promise<TopicSummary[]> {
  const { data, error } = await supabase
    .from('topics')
    .select('id, slug, title, weight_min, weight_max, outline_version')
    .order('sort_order');
  if (error) throw new Error(friendlyDbError(error.message));
  return data as TopicSummary[];
}

/** Lightweight list of published questions (no answers) used to show how many match a quiz setup. */
export async function fetchQuestionCatalog(): Promise<CatalogQuestion[]> {
  const { data, error } = await supabase.from('questions').select('id, difficulty, subtopics(topic_id)');
  if (error) throw new Error(friendlyDbError(error.message));
  const rows = data as unknown as { id: string; difficulty: Difficulty; subtopics: { topic_id: string } | null }[];
  return rows.flatMap((r) => (r.subtopics ? [{ id: r.id, difficulty: r.difficulty, topicId: r.subtopics.topic_id }] : []));
}

export async function startQuiz(settings: QuizSettings): Promise<string> {
  return rpc<string>('start_quiz_attempt', {
    p_mode: settings.mode,
    p_topic_id: settings.mode === 'topic' ? settings.topicId : null,
    p_difficulty: settings.difficulty,
    p_question_count: settings.count,
    p_feedback: settings.feedback,
  });
}

interface AttemptAnswerRow {
  position: number;
  question_id: string;
  selected_option_ids: string[] | null;
  questions: {
    id: string;
    stem: string;
    kind: QuestionKind;
    difficulty: Difficulty;
    answer_options: { id: string; position: number; body: string }[];
    subtopics: { title: string; topics: { title: string; slug: string } } | null;
  } | null;
}

/** Loads an attempt and its questions. The answer key is never part of this response. */
export async function loadAttempt(attemptId: string): Promise<{ attempt: AttemptMeta; questions: RunQuestion[] }> {
  const [attemptResult, answersResult] = await Promise.all([
    supabase
      .from('quiz_attempts')
      .select('id, mode, topic_id, difficulty, feedback, question_count, status, correct_count')
      .eq('id', attemptId)
      .maybeSingle(),
    supabase
      .from('attempt_answers')
      .select(
        'position, question_id, selected_option_ids, questions(id, stem, kind, difficulty, answer_options(id, position, body), subtopics(title, topics(title, slug)))',
      )
      .eq('attempt_id', attemptId)
      .order('position'),
  ]);
  if (attemptResult.error) throw new Error(friendlyDbError(attemptResult.error.message));
  if (answersResult.error) throw new Error(friendlyDbError(answersResult.error.message));
  if (!attemptResult.data) throw new Error(friendlyQuizError('attempt_not_found'));

  const rows = answersResult.data as unknown as AttemptAnswerRow[];
  const questions: RunQuestion[] = rows.flatMap((row) => {
    const q = row.questions;
    if (!q) return [];
    return [
      {
        questionId: q.id,
        position: row.position,
        stem: q.stem,
        kind: q.kind,
        difficulty: q.difficulty,
        topicTitle: q.subtopics?.topics.title ?? '',
        subtopicTitle: q.subtopics?.title ?? '',
        options: [...q.answer_options].sort((a, b) => a.position - b.position),
        selected: row.selected_option_ids ?? [],
        locked: false,
      },
    ];
  });
  if (questions.length === 0) throw new Error(friendlyQuizError('attempt_not_found'));
  return { attempt: attemptResult.data as AttemptMeta, questions };
}

/** Practice mode: the questions already checked, with their feedback, so a refresh can pick up where the learner left off. */
export async function loadProgress(attemptId: string): Promise<QuestionReview[]> {
  const data = await rpc<{ answered: QuestionReview[] }>('get_attempt_progress', { p_attempt_id: attemptId });
  return data.answered;
}

export async function checkAnswer(attemptId: string, questionId: string, optionIds: string[]): Promise<QuestionReview> {
  return rpc<QuestionReview>('check_quiz_answer', {
    p_attempt_id: attemptId,
    p_question_id: questionId,
    p_option_ids: optionIds,
  });
}

export async function submitQuiz(
  attemptId: string,
  answers: { question_id: string; option_ids: string[] }[],
): Promise<AttemptResult> {
  return rpc<AttemptResult>('submit_quiz_attempt', { p_attempt_id: attemptId, p_answers: answers });
}

export async function loadResult(attemptId: string): Promise<AttemptResult> {
  return rpc<AttemptResult>('get_attempt_result', { p_attempt_id: attemptId });
}

export async function fetchRecentAttempts(limit = 5): Promise<RecentAttempt[]> {
  const { data, error } = await supabase
    .from('quiz_attempts')
    .select('id, mode, topic_id, difficulty, feedback, question_count, correct_count, completed_at')
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(friendlyDbError(error.message));
  return data as RecentAttempt[];
}

export async function fetchPerformance(): Promise<SubtopicPerformance[]> {
  const { data, error } = await supabase
    .from('user_subtopic_performance')
    .select('topic_id, topic_slug, topic_title, subtopic_id, subtopic_slug, subtopic_title, attempted, correct, last_practised_at');
  if (error) throw new Error(friendlyDbError(error.message));
  return data as SubtopicPerformance[];
}
