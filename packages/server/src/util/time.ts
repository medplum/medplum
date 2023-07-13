export type TimeUnit = 'ns' | 'µs' | 'ms' | 's';

const PREFIXES: TimeUnit[] = ['ns', 'µs', 'ms', 's'];
export function formatDuration(ns: number | undefined, from: TimeUnit = 'ns'): string {
  if (!ns) {
    return '-';
  }
  const magnitude = Math.floor(Math.log10(ns) / 3);
  let time = 0;
  if (magnitude < 0) {
    time = ns * 10 ** (3 * magnitude);
  } else if (magnitude > 1) {
    time = ns / 10 ** (3 * magnitude);
  } else {
    time = ns;
  }
  return `${time.toPrecision(3)} ${PREFIXES[magnitude + PREFIXES.indexOf(from)]}`;
}
