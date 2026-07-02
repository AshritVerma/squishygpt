// Client-side helpers for syncing small bits of state (conversation history,
// arcade high scores) to the server, so they follow Serena across devices and
// domains instead of living only in one browser's localStorage.

export async function fetchClientState<T>(key: string): Promise<T | null> {
  try {
    const res = await fetch(`/api/state?key=${encodeURIComponent(key)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { value: T | null };
    return data.value ?? null;
  } catch {
    return null;
  }
}

export function pushClientState(key: string, value: unknown): void {
  // Fire-and-forget; localStorage remains the source if this fails.
  fetch("/api/state", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value }),
  }).catch(() => {});
}
