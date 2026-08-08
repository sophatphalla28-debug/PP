// Shared types for quizzes and their scoring.
//
// These are intentionally UI-agnostic so the same shapes can back placement
// tests, per-lesson quizzes, grammar mini-quizzes, and mixed practice sessions.

/** A single multiple-choice question. */
export interface QuizQuestion {
  /** Stable, unique id used to key answers. */
  id: string;
  /** The question text shown to the learner. */
  prompt: string;
  /** Answer choices, in display order. */
  choices: string[];
  /** Index into `choices` of the correct answer. */
  correctIndex: number;
  /**
   * Optional grouping used for section scores and weak-area detection
   * (e.g. "vocabulary", "grammar", "listening"). Ungrouped questions are
   * collected under {@link DEFAULT_SECTION}.
   */
  section?: string;
  /** Optional explanation shown after answering. */
  explanation?: string;
}

/**
 * A learner's answers, keyed by question id. The value is the chosen index
 * into that question's `choices`, or `null`/`undefined` when unanswered.
 */
export type AnswerMap = Record<string, number | null | undefined>;

/** Score for a single section within a quiz. */
export interface SectionScore {
  section: string;
  correct: number;
  total: number;
  /** Percentage 0–100, rounded to the nearest integer. */
  percent: number;
}

/** The result of scoring a whole quiz. */
export interface QuizResult {
  /** Number of questions answered correctly. */
  correct: number;
  /** Total number of questions. */
  total: number;
  /** Number of questions the learner actually answered. */
  answered: number;
  /** Overall percentage 0–100, rounded to the nearest integer. */
  percent: number;
  /** Whether {@link percent} meets the pass threshold. */
  passed: boolean;
  /** Per-section breakdown, in first-seen order. */
  sections: SectionScore[];
  /**
   * The section with the lowest percentage (ties broken by first-seen order),
   * or `null` when the quiz has no questions.
   */
  weakestSection: string | null;
}
