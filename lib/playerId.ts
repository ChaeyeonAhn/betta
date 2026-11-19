// A phone keeps the same id across reloads so it gets its own betta back.
// crypto.randomUUID only exists in secure contexts; plain http on the LAN is not one.

const KEY = "betta-player-id";

export function getPlayerId(): string {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) return saved;
  } catch {}
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  try {
    localStorage.setItem(KEY, id);
  } catch {}
  return id;
}

/** Short tag shown under a betta on both the phone and the screen, e.g. "#C87B". */
export function shortTag(id: string): string {
  return `#${id.replace(/[^a-z0-9]/gi, "").slice(0, 4).toUpperCase()}`;
}
