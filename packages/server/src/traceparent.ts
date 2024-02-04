// https://www.w3.org/TR/trace-context/#traceparent-header

type hex = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'a' | 'b' | 'c' | 'd' | 'e' | 'f';
type twohex = `${hex}${hex}`;

export type Traceparent = {
  version: twohex | null;
  traceId: string;
  parentId: string;
  flags: hex | twohex | null;
};

export function parseTraceparent(traceparent: string): Traceparent | undefined {
  const traceparentRegex = /^([0-9a-f]{2})?-?([0-9a-f]{32})-([0-9a-f]{16})-?([0-9a-f]{1,2})?$/i;

  const match = traceparent.match(traceparentRegex);
  if (!match) {
    return undefined;
  }

  const version = match[1] ?? null;
  const traceId = match[2];
  const parentId = match[3];
  const flags = match[4] ?? null;

  return { version: version as twohex, traceId, parentId, flags: flags as hex | twohex };
}
