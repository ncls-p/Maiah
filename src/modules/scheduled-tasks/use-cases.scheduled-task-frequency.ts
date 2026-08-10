export type ScheduledTaskFrequency = "daily" | "interval";

export type ScheduledTaskInput = {
  workspaceId: string;
  userId: string;
  agentId: string;
  conversationId?: string | null;
  title: string;
  prompt: string;
  frequency: ScheduledTaskFrequency;
  timezone?: string;
  timeOfDay?: string | null;
  intervalMinutes?: number | null;
  enabled?: boolean;
};

export type UpdateScheduledTaskInput = Partial<
  Pick<
    ScheduledTaskInput,
    | "agentId"
    | "conversationId"
    | "title"
    | "prompt"
    | "frequency"
    | "timezone"
    | "timeOfDay"
    | "intervalMinutes"
    | "enabled"
  >
>;

export const MAX_DUE_TASKS_PER_TICK = 10;

function assertValidTimeOfDay(value: string | null | undefined) {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) {
    throw new Error("timeOfDay must use HH:mm format");
  }
  const [hour = 0, minute = 0] = value.split(":").map(Number);
  if (hour > 23 || minute > 59) throw new Error("timeOfDay is invalid");
}

export function normalizeTaskInput(input: ScheduledTaskInput) {
  const title = input.title.trim();
  const prompt = input.prompt.trim();
  if (!title) throw new Error("Title is required");
  if (!prompt) throw new Error("Prompt is required");

  if (input.frequency === "daily") {
    assertValidTimeOfDay(input.timeOfDay);
    return {
      ...input,
      title,
      prompt,
      timezone: input.timezone || "UTC",
      intervalMinutes: null,
    };
  }

  const intervalMinutes = input.intervalMinutes ?? 0;
  if (!Number.isInteger(intervalMinutes) || intervalMinutes < 5) {
    throw new Error("intervalMinutes must be at least 5");
  }

  return {
    ...input,
    title,
    prompt,
    timezone: input.timezone || "UTC",
    timeOfDay: null,
    intervalMinutes,
  };
}

function getZonedParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = getZonedParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - date.getTime();
}

function zonedTimeToUtc(input: {
  timeZone: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}) {
  const guessedUtc = new Date(
    Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute),
  );
  const firstPass = new Date(
    guessedUtc.getTime() - getTimeZoneOffsetMs(guessedUtc, input.timeZone),
  );
  return new Date(
    guessedUtc.getTime() - getTimeZoneOffsetMs(firstPass, input.timeZone),
  );
}

export function computeNextRunAt(input: {
  frequency: ScheduledTaskFrequency;
  timezone?: string;
  timeOfDay?: string | null;
  intervalMinutes?: number | null;
  from?: Date;
}) {
  const from = input.from ?? new Date();
  if (input.frequency === "interval") {
    const intervalMinutes = input.intervalMinutes ?? 0;
    return new Date(from.getTime() + intervalMinutes * 60_000);
  }

  assertValidTimeOfDay(input.timeOfDay);
  const timezone = input.timezone || "UTC";
  const [hour = 0, minute = 0] = input.timeOfDay!.split(":").map(Number);
  const localNow = getZonedParts(from, timezone);
  let candidate = zonedTimeToUtc({
    timeZone: timezone,
    year: localNow.year,
    month: localNow.month,
    day: localNow.day,
    hour,
    minute,
  });

  if (candidate <= from) {
    const tomorrowNoonUtc = new Date(
      Date.UTC(localNow.year, localNow.month - 1, localNow.day + 1, 12),
    );
    const tomorrow = getZonedParts(tomorrowNoonUtc, timezone);
    candidate = zonedTimeToUtc({
      timeZone: timezone,
      year: tomorrow.year,
      month: tomorrow.month,
      day: tomorrow.day,
      hour,
      minute,
    });
  }

  return candidate;
}
