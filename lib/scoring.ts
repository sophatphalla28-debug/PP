import type {
  AnswerMap,
  QuizQuestion,
  QuizResult,
  SectionScore,
} from "@/types/quiz";

/** Section label applied to questions that declare no `section`. */
export const DEFAULT_SECTION = "general";

/** Default fraction (0–1) of correct answers required to pass a quiz. */
export const DEFAULT_PASS_THRESHOLD = 0.6;

/** Options for {@link scoreQuiz}. */
export interface ScoreOptions {
  /**
   * Fraction of correct answers (0–1) required for {@link QuizResult.passed}.
   * Defaults to {@link DEFAULT_PASS_THRESHOLD}.
   */
  passThreshold?: number;
}

/** Convert a correct/total ratio into a rounded 0–100 percentage. */
export function percentage(correct: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((correct / total) * 100);
}

/**
 * Whether the given answer is correct for a question.
 *
 * `answer` is the chosen index into the question's `choices`; `null` or
 * `undefined` (unanswered) is never correct.
 */
export function isCorrect(
  question: QuizQuestion,
  answer: number | null | undefined,
): boolean {
  return answer != null && answer === question.correctIndex;
}

/**
 * Score a quiz from a set of questions and a learner's answers.
 *
 * The result includes an overall score, a per-section breakdown (used for
 * weak-area detection), and whether the learner passed. Scoring is pure and
 * order-stable: sections appear in the order they are first encountered.
 */
export function scoreQuiz(
  questions: QuizQuestion[],
  answers: AnswerMap,
  options: ScoreOptions = {},
): QuizResult {
  const passThreshold = options.passThreshold ?? DEFAULT_PASS_THRESHOLD;

  let correct = 0;
  let answered = 0;

  // Preserve first-seen section order while accumulating tallies.
  const order: string[] = [];
  const tallies = new Map<string, { correct: number; total: number }>();

  for (const question of questions) {
    const section = question.section ?? DEFAULT_SECTION;
    let tally = tallies.get(section);
    if (!tally) {
      tally = { correct: 0, total: 0 };
      tallies.set(section, tally);
      order.push(section);
    }

    tally.total += 1;

    const answer = answers[question.id];
    if (answer != null) answered += 1;

    if (isCorrect(question, answer)) {
      correct += 1;
      tally.correct += 1;
    }
  }

  const sections: SectionScore[] = order.map((section) => {
    const { correct: c, total } = tallies.get(section)!;
    return { section, correct: c, total, percent: percentage(c, total) };
  });

  const total = questions.length;

  return {
    correct,
    total,
    answered,
    percent: percentage(correct, total),
    passed: total > 0 && correct / total >= passThreshold,
    sections,
    weakestSection: findWeakestSection(sections),
  };
}

/**
 * The section with the lowest percentage. Ties are broken by first-seen
 * order; returns `null` when there are no sections.
 */
export function findWeakestSection(sections: SectionScore[]): string | null {
  let weakest: SectionScore | null = null;
  for (const section of sections) {
    if (weakest === null || section.percent < weakest.percent) {
      weakest = section;
    }
  }
  return weakest?.section ?? null;
}
