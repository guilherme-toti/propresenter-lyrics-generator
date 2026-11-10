/** How the Drive browser words a file's age and size. Nothing imported, so `node --test` can load
 * it. */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
/** Past this, "há 9 semanas" reads worse than the date itself. */
const RELATIVE_DAYS_LIMIT = 30;

const relative = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
const date = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

/** "agora", "há 5 minutos", "ontem", "há 3 dias", then the date: how recent matters more than
 * when, since the newest files are the week's. */
export function formatModified(isoTime: string, now: Date): string {
  const elapsed = now.getTime() - Date.parse(isoTime);
  if (Number.isNaN(elapsed)) return "";
  if (elapsed < MINUTE_MS) return "agora";
  if (elapsed < HOUR_MS) return relative.format(-Math.floor(elapsed / MINUTE_MS), "minute");
  if (elapsed < DAY_MS) return relative.format(-Math.floor(elapsed / HOUR_MS), "hour");
  const days = Math.floor(elapsed / DAY_MS);
  if (days <= RELATIVE_DAYS_LIMIT) return relative.format(-days, "day");
  return date.format(new Date(isoTime));
}

const UNITS = ["KB", "MB", "GB"] as const;

/** "850 KB", "12,4 MB", "1,2 GB", in the units a file manager shows. */
export function formatSize(bytes: number): string {
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${number.format(Math.max(value, 0.1))} ${UNITS[unit]}`;
}
