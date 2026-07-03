// Question-count milestones, shared by Chat (which increments the counter)
// and SquishyMascot (which evolves its look as the count grows).

export const QUESTION_COUNT_KEY = "squishygpt.questions.v1";

export function questionCount(): number {
  try {
    return parseInt(localStorage.getItem(QUESTION_COUNT_KEY) || "0", 10) || 0;
  } catch {
    return 0;
  }
}

/** 0 = plain brain, 1 = graduation cap (250+), 2 = + stethoscope (500+). */
export function mascotLevel(n: number): 0 | 1 | 2 {
  return n >= 500 ? 2 : n >= 250 ? 1 : 0;
}
