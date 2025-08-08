// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Traceparent, parseTraceparent } from './traceparent';

describe('parseTraceparent', () => {
  const tp: Traceparent = {
    version: '00',
    traceId: '12345678901234567890123456789012',
    parentId: '3456789012345678',
    flags: '01',
  };

  it('parses traceparent spec', () => {
    expect(parseTraceparent(`${tp.version}-${tp.traceId}-${tp.parentId}-${tp.flags}`)).toStrictEqual(tp);
  });

  it('allows missing version', () => {
    expect(parseTraceparent(`${tp.traceId}-${tp.parentId}-${tp.flags}`)).toStrictEqual({ ...tp, version: undefined });
  });

  it('allows missing flags', () => {
    expect(parseTraceparent(`${tp.version}-${tp.traceId}-${tp.parentId}`)).toStrictEqual({ ...tp, flags: undefined });
  });

  it('allows missing version and flags', () => {
    expect(parseTraceparent(`${tp.traceId}-${tp.parentId}`)).toStrictEqual({
      ...tp,
      version: undefined,
      flags: undefined,
    });
  });

  it('allows 1 character for flags', () => {
    expect(parseTraceparent(`${tp.traceId}-${tp.parentId}-1`)).toStrictEqual({ ...tp, version: undefined, flags: '1' });
  });

  it('returns null for more than 2 characters for flags', () => {
    expect(parseTraceparent(`${tp.traceId}-${tp.parentId}-001`)).toStrictEqual(null);
  });

  it('reports invalid', () => {
    expect(parseTraceparent(`invalid-traceparent`)).toStrictEqual(null);
  });
});
