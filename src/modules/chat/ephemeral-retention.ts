export const DEFAULT_EPHEMERAL_TTL_MINUTES = 24 * 60;

export const EPHEMERAL_TTL_OPTIONS = [
  5,
  720,
  1_440,
  2_880,
  10_080,
] as const;

export type EphemeralTtlMinutes = (typeof EPHEMERAL_TTL_OPTIONS)[number];

export function isEphemeralTtlMinutes(value: unknown): value is EphemeralTtlMinutes {
  return EPHEMERAL_TTL_OPTIONS.includes(value as EphemeralTtlMinutes);
}

export function ephemeralExpiresAt(ttlMinutes: number, now = new Date()) {
  return new Date(now.getTime() + ttlMinutes * 60_000);
}
