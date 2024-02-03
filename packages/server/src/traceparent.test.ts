import { Traceparent, parseTraceparent } from './traceparent';

describe('parseTraceparent', () => {
  const tp: Traceparent = {
    valid: true,
    version: '00',
    traceId: '12345678901234567890123456789012',
    parentId: '3456789012345678',
    flags: '01',
  };

  it('parses traceparent spec', () => {
    expect(parseTraceparent(`${tp.version}-${tp.traceId}-${tp.parentId}-${tp.flags}`)).toEqual(tp);
  });

  it('allow missing version', () => {
    expect(parseTraceparent(`${tp.traceId}-${tp.parentId}-${tp.flags}`)).toEqual({ ...tp, version: null });
  });

  it('allow missing flags', () => {
    expect(parseTraceparent(`${tp.version}-${tp.traceId}-${tp.parentId}`)).toEqual({ ...tp, flags: null });
  });

  it('allow missing version and flags', () => {
    expect(parseTraceparent(`${tp.traceId}-${tp.parentId}`)).toEqual({ ...tp, version: null, flags: null });
  });

  it('reports invalid', () => {
    expect(parseTraceparent(`invalid-traceparent`)).toEqual({ valid: false });
  });
});
