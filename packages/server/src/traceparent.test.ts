import { Traceparent, parseTraceparent } from './traceparent';

describe('parseTraceparent', () => {
  const tp: Traceparent = {
    version: '00',
    traceId: '12345678901234567890123456789012',
    parentId: '3456789012345678',
    flags: '01',
  };

  it('parses traceparent spec', () => {
    expect(parseTraceparent(`${tp.version}-${tp.traceId}-${tp.parentId}-${tp.flags}`)).toEqual(tp);
  });

  it('allows missing version', () => {
    expect(parseTraceparent(`${tp.traceId}-${tp.parentId}-${tp.flags}`)).toEqual({ ...tp, version: undefined });
  });

  it('allows missing flags', () => {
    expect(parseTraceparent(`${tp.version}-${tp.traceId}-${tp.parentId}`)).toEqual({ ...tp, flags: undefined });
  });

  it('allows missing version and flags', () => {
    expect(parseTraceparent(`${tp.traceId}-${tp.parentId}`)).toEqual({ ...tp, version: undefined, flags: undefined });
  });

  it('allows 1 character for flags', () => {
    expect(parseTraceparent(`${tp.traceId}-${tp.parentId}-1`)).toEqual({ ...tp, version: undefined, flags: '1' });
  });

  it('returns null for more than 2 characters for flags', () => {
    expect(parseTraceparent(`${tp.traceId}-${tp.parentId}-001`)).toEqual(null);
  });

  it('reports invalid', () => {
    expect(parseTraceparent(`invalid-traceparent`)).toEqual(null);
  });
});
