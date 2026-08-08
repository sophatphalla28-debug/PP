import { describe, expect, it } from "vitest";
import {
  DEFAULT_SECTION,
  findWeakestSection,
  isCorrect,
  percentage,
  scoreQuiz,
} from "@/lib/scoring";
import type { QuizQuestion } from "@/types/quiz";

function q(
  id: string,
  correctIndex: number,
  section?: string,
): QuizQuestion {
  return {
    id,
    prompt: `Question ${id}`,
    choices: ["A", "B", "C", "D"],
    correctIndex,
    section,
  };
}

describe("percentage", () => {
  it("rounds to the nearest integer", () => {
    expect(percentage(1, 3)).toBe(33);
    expect(percentage(2, 3)).toBe(67);
    expect(percentage(3, 4)).toBe(75);
  });

  it("returns 0 for a zero or negative total", () => {
    expect(percentage(0, 0)).toBe(0);
    expect(percentage(5, 0)).toBe(0);
    expect(percentage(1, -2)).toBe(0);
  });
});

describe("isCorrect", () => {
  const question = q("1", 2);

  it("is true only for the correct index", () => {
    expect(isCorrect(question, 2)).toBe(true);
    expect(isCorrect(question, 0)).toBe(false);
  });

  it("treats unanswered (null/undefined) as incorrect", () => {
    expect(isCorrect(question, null)).toBe(false);
    expect(isCorrect(question, undefined)).toBe(false);
  });

  it("does not treat index 0 as falsy/unanswered", () => {
    expect(isCorrect(q("2", 0), 0)).toBe(true);
  });
});

describe("scoreQuiz", () => {
  const questions: QuizQuestion[] = [
    q("v1", 0, "vocabulary"),
    q("v2", 1, "vocabulary"),
    q("g1", 2, "grammar"),
    q("g2", 3, "grammar"),
  ];

  it("scores a perfect quiz", () => {
    const result = scoreQuiz(questions, { v1: 0, v2: 1, g1: 2, g2: 3 });
    expect(result.correct).toBe(4);
    expect(result.total).toBe(4);
    expect(result.answered).toBe(4);
    expect(result.percent).toBe(100);
    expect(result.passed).toBe(true);
  });

  it("counts answered separately from correct", () => {
    // v1 correct, v2 wrong (answered), g1 unanswered, g2 correct.
    const result = scoreQuiz(questions, { v1: 0, v2: 3, g2: 3 });
    expect(result.correct).toBe(2);
    expect(result.answered).toBe(3);
    expect(result.total).toBe(4);
    expect(result.percent).toBe(50);
  });

  it("produces per-section scores in first-seen order", () => {
    const result = scoreQuiz(questions, { v1: 0, v2: 3, g1: 2, g2: 2 });
    expect(result.sections).toEqual([
      { section: "vocabulary", correct: 1, total: 2, percent: 50 },
      { section: "grammar", correct: 1, total: 2, percent: 50 },
    ]);
  });

  it("identifies the weakest section", () => {
    // vocabulary 2/2 = 100%, grammar 0/2 = 0%.
    const result = scoreQuiz(questions, { v1: 0, v2: 1, g1: 0, g2: 0 });
    expect(result.weakestSection).toBe("grammar");
  });

  it("groups questions with no section under the default section", () => {
    const result = scoreQuiz([q("a", 0), q("b", 1)], { a: 0, b: 0 });
    expect(result.sections).toEqual([
      { section: DEFAULT_SECTION, correct: 1, total: 2, percent: 50 },
    ]);
  });

  it("respects a custom pass threshold", () => {
    const answers = { v1: 0, v2: 1, g1: 2, g2: 0 }; // 3/4 = 75%
    expect(scoreQuiz(questions, answers, { passThreshold: 0.8 }).passed).toBe(
      false,
    );
    expect(scoreQuiz(questions, answers, { passThreshold: 0.7 }).passed).toBe(
      true,
    );
  });

  it("handles an empty quiz without dividing by zero", () => {
    const result = scoreQuiz([], {});
    expect(result).toMatchObject({
      correct: 0,
      total: 0,
      answered: 0,
      percent: 0,
      passed: false,
      sections: [],
      weakestSection: null,
    });
  });
});

describe("findWeakestSection", () => {
  it("returns null when there are no sections", () => {
    expect(findWeakestSection([])).toBeNull();
  });

  it("breaks ties by first-seen order", () => {
    const weakest = findWeakestSection([
      { section: "a", correct: 1, total: 2, percent: 50 },
      { section: "b", correct: 1, total: 2, percent: 50 },
    ]);
    expect(weakest).toBe("a");
  });
});
