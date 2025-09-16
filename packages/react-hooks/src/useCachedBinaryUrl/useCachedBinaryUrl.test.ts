// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { renderHook } from '@testing-library/react';
import { useCachedBinaryUrl } from './useCachedBinaryUrl';

describe('useDoubleNumber', () => {
  test('Undefined', () => {
    const { result } = renderHook(() => useCachedBinaryUrl(undefined));
    expect(result.current).toBe(undefined);
  });

  test('Empty string', () => {
    const { result } = renderHook(() => useCachedBinaryUrl(''));
    expect(result.current).toBe(undefined);
  });

  test('Query string only', () => {
    const url = createUrl('', '123', '456', 1234567890);
    const { result } = renderHook(() => useCachedBinaryUrl(url));
    expect(result.current).toBe(url);
  });

  test('No query string', () => {
    const url = createUrl('https://example.com/image.jpg', undefined, undefined, undefined);
    const { result } = renderHook(() => useCachedBinaryUrl(url));
    expect(result.current).toBe(url);
  });

  test('Invalid query string', () => {
    const url = 'not a valid url';
    const { result } = renderHook(() => useCachedBinaryUrl(url));
    expect(result.current).toBe(url);
  });

  test('Missing key pair', () => {
    const url = createUrl('https://example.com/image.jpg', undefined, '456', nowInSeconds() + 3600);
    const { result } = renderHook(() => useCachedBinaryUrl(url));
    expect(result.current).toBe(url);
  });

  test('Missing signature', () => {
    const url = createUrl('https://example.com/image.jpg', '123', undefined, nowInSeconds() + 3600);
    const { result } = renderHook(() => useCachedBinaryUrl(url));
    expect(result.current).toBe(url);
  });

  test('Missing expires', () => {
    const url = createUrl('https://example.com/image.jpg', '123', '456', undefined);
    const { result } = renderHook(() => useCachedBinaryUrl(url));
    expect(result.current).toBe(url);
  });

  test('Expires in milliseconds', () => {
    const url = createUrl('https://example.com/image.jpg', '123', undefined, Date.now() + 3600 * 1000);
    const { result } = renderHook(() => useCachedBinaryUrl(url));
    expect(result.current).toBe(url);
  });

  test('Reuse cached URL', () => {
    const url1 = createUrl('https://example.com/reused.jpg', '123', '456', nowInSeconds() + 100);
    const { result, rerender } = renderHook(({ binaryUrl }) => useCachedBinaryUrl(binaryUrl), {
      initialProps: {
        binaryUrl: url1,
      },
    });
    expect(result.current).toBe(url1);

    // Next URL is 100 seconds in the future
    // Should reuse the cached URL
    const url2 = createUrl('https://example.com/reused.jpg', '123', '456', nowInSeconds() + 200);
    rerender({ binaryUrl: url2 });
    expect(result.current).toBe(url1);
  });

  test('Expired url', () => {
    const url1 = createUrl('https://example.com/expired.jpg', '123', '456', nowInSeconds() - 100);
    const { result, rerender } = renderHook(({ binaryUrl }) => useCachedBinaryUrl(binaryUrl), {
      initialProps: {
        binaryUrl: url1,
      },
    });
    expect(result.current).toBe(url1);

    // First URL is expired
    // Should use the new URL
    const url2 = createUrl('https://example.com/expired.jpg', '123', '456', nowInSeconds() + 200);
    rerender({ binaryUrl: url2 });
    expect(result.current).toBe(url2);
  });
});

function createUrl(
  base: string,
  keyPairId: string | undefined,
  signature: string | undefined,
  expires: number | undefined
): string {
  const params = new URLSearchParams();
  if (keyPairId) {
    params.set('Key-Pair-Id', keyPairId);
  }
  if (signature) {
    params.set('Signature', signature);
  }
  if (expires) {
    params.set('Expires', expires.toString());
  }
  return params.size === 0 ? base : `${base}?${params.toString()}`;
}

function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
