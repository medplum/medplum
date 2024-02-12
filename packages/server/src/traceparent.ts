import type { Span } from '@opentelemetry/api';

// https://www.w3.org/TR/trace-context/#traceparent-header

type hex = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'a' | 'b' | 'c' | 'd' | 'e' | 'f';
type twohex = `${hex}${hex}`;

type TraceparentOpts = {
  version?: twohex;
  traceId: string;
  parentId: string;
  flags?: hex | twohex;
};

export class Traceparent {
  version?: twohex;
  traceId: string;
  parentId: string;
  flags?: hex | twohex;

  constructor({ version, traceId, parentId, flags }: TraceparentOpts) {
    this.traceId = traceId;
    this.parentId = parentId;
    this.version = version;
    this.flags = flags;
  }

  toString(): string {
    return [this.version, this.traceId, this.parentId, this.flags].filter(Boolean).join('-');
  }
}

const traceparentRegex = /^([0-9a-f]{2})?-?([0-9a-f]{32})-([0-9a-f]{16})-?([0-9a-f]{1,2})?$/i;

export function parseTraceparent(value: string): Traceparent | null {
  const match = value.match(traceparentRegex);
  if (!match) {
    return null;
  }

  return new Traceparent({
    version: (match[1] ?? undefined) as Traceparent['version'],
    traceId: match[2],
    parentId: match[3],
    flags: (match[4] ?? undefined) as Traceparent['flags'],
  });
}

export function traceparentFromSpan(span?: Span): Traceparent | undefined {
  const spanCtx = span?.spanContext();
  if (!spanCtx?.traceId || !spanCtx?.spanId) {
    return undefined;
  }

  let flags = spanCtx.traceFlags.toString().slice(0, 2) || '00';
  if (flags.length === 1) {
    flags = `0${flags}`;
  }

  return new Traceparent({
    version: '00',
    traceId: spanCtx.traceId,
    parentId: spanCtx.spanId,
    flags: flags as twohex,
  });
}
