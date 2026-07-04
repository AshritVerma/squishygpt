// SquishyGPT's event catalog. This is the app-specific layer on top of the
// portable analytics core (src/lib/analytics). Keeping the names here (rather
// than in the core) is what lets the core lift out into a shared SDK later:
// each consumer app defines its own event map like this one.

export const APP_ID = "squishygpt";

// Base events every app gets for free, plus SquishyGPT's own feature events.
// The ingest route validates incoming event names against this set so the
// endpoint can't be used to write arbitrary rows.
export const ALLOWED_EVENTS = [
  // lifecycle (base)
  "session_start",
  "page_view",
  // chat
  "chat_question_asked",
  "voice_transcript_used",
  "suggestion_clicked",
  "suggestions_shuffled",
  "new_chat",
  "conversation_loaded",
  "conversation_deleted",
  // arcade
  "arcade_opened",
  "arcade_game_started",
  "arcade_game_over",
  // delight
  "easter_egg",
  // study sets
  "study_set_added",
  "study_set_deleted",
  "study_set_viewed",
] as const;

export type AppEvent = (typeof ALLOWED_EVENTS)[number];

const ALLOWED = new Set<string>(ALLOWED_EVENTS);

export function isAllowedEvent(name: unknown): name is AppEvent {
  return typeof name === "string" && ALLOWED.has(name);
}

// Maps the existing squishy:* window events to a single easter_egg event so
// most delight coverage comes for free (see UsageTracker).
export const EASTER_EGG_EVENTS: Record<string, string> = {
  "squishy:2020": "2020",
  "squishy:bashful": "bashful",
  "squishy:nap": "nap",
  "squishy:glasses": "glasses",
  "squishy:milestone": "milestone",
  "squishy:feral": "feral",
  "squishy:confetti": "confetti",
  "squishy:arcade-request": "arcade_triple_tap",
};
