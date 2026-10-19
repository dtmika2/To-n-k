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
};

/** Progress 0…1 through the notice, or null when no notice is playing. */
export function noticeProgress(
  s: { mode: string; sub: string; subSince: number; demoLeadMs: number },
  now: number,
): number | null {
  if (s.mode !== 'GAME' || s.sub !== 'DEMO' || s.demoLeadMs < NOTICE.minLeadMs) return null;
  const p = (now - s.subSince) / s.demoLeadMs;
  return p >= 0 && p < 1 ? p : null;
}
