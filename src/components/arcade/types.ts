export interface GameProps {
  /** Current best score for this game. */
  best: number;
  /** Called with the final score when a run ends. */
  onGameOver: (score: number) => void;
  /** Return to the arcade menu. */
  onExit: () => void;
}
