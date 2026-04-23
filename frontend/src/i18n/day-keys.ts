const DAY_KEYS = ["0", "1", "2", "3", "4"] as const;
type DayKey = (typeof DAY_KEYS)[number];

function assertDayKey(day: number): DayKey {
  if (!Number.isInteger(day) || day < 0 || day > 4) {
    throw new RangeError(`day must be an integer in [0, 4], got ${day}`);
  }
  return String(day) as DayKey;
}

export function dayShortKey(day: number): `common.daysShort.${DayKey}` {
  return `common.daysShort.${assertDayKey(day)}`;
}

export function dayLongKey(day: number): `common.daysLong.${DayKey}` {
  return `common.daysLong.${assertDayKey(day)}`;
}
