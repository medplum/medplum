// https://www.w3.org/TR/trace-context/#traceparent-header

type hex = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'a' | 'b' | 'c' | 'd' | 'e' | 'f';
type twohex = `${hex}${hex}`;

export type Traceparent = {
  version?: twohex;
  traceId: string;
  parentId: string;
  flags?: hex | twohex;
};

const traceparentRegex = /^([0-9a-f]{2})?-?([0-9a-f]{32})-([0-9a-f]{16})-?([0-9a-f]{1,2})?$/i;

export function parseTraceparent(traceparent: string): Traceparent | null {
  const match = traceparent.match(traceparentRegex);
  if (!match) {
    return null;
  }

  return {
    version: (match[1] ?? undefined) as Traceparent['version'],
    traceId: match[2],
    parentId: match[3],
    flags: (match[4] ?? undefined) as Traceparent['flags'],
  };
}
