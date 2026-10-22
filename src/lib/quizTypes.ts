export type Difficulty = 'easy' | 'medium' | 'hard';
export type QuizMode = 'topic' | 'mixed';
export type FeedbackMode = 'instant' | 'end';
export type QuestionKind = 'single' | 'multiple';

export interface TopicSummary {
  id: string;
  slug: string;
  title: string;
  weight_min: number;
  weight_max: number;
  outline_version: string;
}

export interface CatalogQuestion {
  id: string;
  difficulty: Difficulty;
  topicId: string;
}

export interface QuizSettings {
  mode: QuizMode;
  topicId: string | null;
  difficulty: Difficulty | null;
  count: number;
  feedback: FeedbackMode;
}

export interface AttemptMeta {
  id: string;
  mode: QuizMode;
  topic_id: string | null;
  difficulty: Difficulty | null;
  feedback: FeedbackMode;
  question_count: number;
  status: 'in_progress' | 'completed';
  correct_count: number | null;
}

export interface RunOption {
  id: string;
  position: number;
  body: string;
}

/** A question as shown during a quiz. It never contains the answer key. */
export interface RunQuestion {
  questionId: string;
  position: number;
  stem: string;
  kind: QuestionKind;
  difficulty: Difficulty;
  topicTitle: string;
  subtopicTitle: string;
  options: RunOption[];
  selected: string[];
  /** True once the server has locked this answer (practice mode). */
  locked: boolean;
}

export interface ReviewOption {
  id: string;
  position: number;
  body: string;
  is_correct: boolean;
  note: string | null;
}

/** A question after the answer key may be shown. */
export interface QuestionReview {
  position: number;
  question_id: string;
  stem: string;
  kind: QuestionKind;
  difficulty: Difficulty;
  learning_objective: string;
  topic_slug: string;
  topic_title: string;
  subtopic_title: string;
  explanation: string;
  reference_url: string | null;
  is_correct: boolean;
  selected_option_ids: string[];
  options: ReviewOption[];
}

export interface AttemptResult {
  attempt: {
    id: string;
    mode: QuizMode;
    topic_id: string | null;
    difficulty: Difficulty | null;
    feedback: FeedbackMode;
    question_count: number;
    correct_count: number;
    started_at: string;
    completed_at: string;
  };
  answers: QuestionReview[];
}

export interface SubtopicPerformance {
  topic_id: string;
  topic_slug: string;
  topic_title: string;
  subtopic_id: string;
  subtopic_slug: string;
  subtopic_title: string;
  attempted: number;
  correct: number;
  last_practised_at: string | null;
}

export interface RecentAttempt {
  id: string;
  mode: QuizMode;
  topic_id: string | null;
  difficulty: Difficulty | null;
  feedback: FeedbackMode;
  question_count: number;
  correct_count: number | null;
  completed_at: string | null;
}
