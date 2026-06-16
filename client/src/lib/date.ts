// Single source of truth for civil dates.
//
// A "date key" is a calendar day written as `YYYY-MM-DD` in the USER'S LOCAL
// timezone. Everything that stores or compares days (session logs, metrics,
// skipped weeks, schedule highlighting) must go through these helpers.
//
// The bug this kills: deriving a day from `new Date().toISOString().slice(0,10)`
// gives the UTC calendar day, while `Date#getDay()` gives the LOCAL weekday.
// Near midnight those disagree, so a set logged at 23:30 could be filed under
// tomorrow and the schedule could highlight the wrong day. Always use local
// civil dates; never mix UTC date keys with local weekday math.

// Local civil date key (`YYYY-MM-DD`) for a given Date, in the local timezone.
export function dateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Local civil date key for "now".
export function todayKey(): string {
  return dateKey(new Date())
}

// Parse a `YYYY-MM-DD` key into a LOCAL Date anchored at noon. Noon (rather than
// midnight) keeps the civil day stable across DST transitions and avoids the
// off-by-one that a UTC-midnight parse (`new Date('2026-06-05')`) introduces in
// timezones west of UTC.
export function keyToDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d, 12, 0, 0, 0)
}

// n days after d, as a new local Date preserving the time-of-day.
export function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}
