/**
 * The "get ready" notice between the start tap and the first demo blink, as fractions of the lead
 * time (timing.introLeadMs). Shared by the scene (light) and the audio engine (sound).
 */
export const NOTICE = {
  /** Only demos with at least this much lead get the notice (master replays don't). */
  minLeadMs: 2000,
  /** The breath: a wide ring contracts and brightens between these fractions of the lead. */
  inhale: [0.15, 0.75] as const,
  /** Three soft pulses ripple out from the centre at these fractions; the last is the "now". */
  pulses: [0.78, 0.87, 0.96] as const,
  /** Quiet after the notice, before the first eye opens. */
  tailMs: 500,
};

/** How long the notice itself plays, out of a demo lead time (the rest is the quiet tail). */
export function noticeSpanMs(leadMs: number): number {
  return Math.max(1, leadMs - NOTICE.tailMs);
}

/**
 * Progress through the notice (0…1 over noticeSpanMs, running on past 1 through the quiet tail so the
 * last pulse can finish), or null when no notice is playing.
 */
export function noticeProgress(
  s: { mode: string; sub: string; subSince: number; demoLeadMs: number },
  now: number,
): number | null {
  if (s.mode !== 'GAME' || s.sub !== 'DEMO' || s.demoLeadMs < NOTICE.minLeadMs) return null;
  const elapsed = now - s.subSince;
  return elapsed >= 0 && elapsed < s.demoLeadMs ? elapsed / noticeSpanMs(s.demoLeadMs) : null;
}
