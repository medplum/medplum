// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getRedisDbsToFlush } from './jest.global-setup';

describe('Jest global setup', () => {
  test('Uses default Redis DBs when unspecified', () => {
    expect(getRedisDbsToFlush(undefined)).toStrictEqual([6, 7, 8, 9, 10]);
  });

  test('Parses Redis DB list', () => {
    expect(getRedisDbsToFlush('7, 8,9 ,10')).toStrictEqual([7, 8, 9, 10]);
  });

  test('Parses empty Redis DB list', () => {
    expect(getRedisDbsToFlush('')).toStrictEqual([]);
  });

  test('Rejects invalid Redis DB list', () => {
    expect(() => getRedisDbsToFlush('7,nope')).toThrow('Invalid Redis database number "nope"');
  });
});
