// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
// Forked from rfc6902, Copyright 2014-2021 Christopher Brown, MIT Licensed

import { applyPatch } from '../index';

test('broken add', () => {
  const user = { id: 'chbrown' };
  const results = applyPatch(user, [{ op: 'add', path: '/a/b', value: 1 }]);
  expect(user).toStrictEqual({ id: 'chbrown' });
  expect(results.map((r) => (r === null ? 'null' : r.name))).toStrictEqual(['MissingError']);
});

test('broken remove', () => {
  const user = { id: 'chbrown' };
  const results = applyPatch(user, [{ op: 'remove', path: '/name' }]);
  expect(user).toStrictEqual({ id: 'chbrown' });
  expect(results.map((r) => (r === null ? 'null' : r.name))).toStrictEqual(['MissingError']);
});

test('broken replace', () => {
  const user = { id: 'chbrown' };
  const results = applyPatch(user, [{ op: 'replace', path: '/name', value: 1 }]);
  expect(user).toStrictEqual({ id: 'chbrown' });
  expect(results.map((r) => (r === null ? 'null' : r.name))).toStrictEqual(['MissingError']);
});

test('broken replace (array)', () => {
  const users = [{ id: 'chbrown' }];
  const results = applyPatch(users, [{ op: 'replace', path: '/1', value: { id: 'chbrown2' } }]);
  // cf. issues/36
  expect(users).toStrictEqual([{ id: 'chbrown' }]);
  expect(results.map((r) => (r === null ? 'null' : r.name))).toStrictEqual(['MissingError']);
});

test('broken move (from)', () => {
  const user = { id: 'chbrown' };
  const results = applyPatch(user, [{ op: 'move', from: '/name', path: '/id' }]);
  expect(user).toStrictEqual({ id: 'chbrown' });
  expect(results.map((r) => (r === null ? 'null' : r.name))).toStrictEqual(['MissingError']);
});

test('broken move (path)', () => {
  const user = { id: 'chbrown' };
  const results = applyPatch(user, [{ op: 'move', from: '/id', path: '/a/b' }]);
  expect(user).toStrictEqual({ id: 'chbrown' });
  expect(results.map((r) => (r === null ? 'null' : r.name))).toStrictEqual(['MissingError']);
});

test('broken copy (from)', () => {
  const user = { id: 'chbrown' };
  const results = applyPatch(user, [{ op: 'copy', from: '/name', path: '/id' }]);
  expect(user).toStrictEqual({ id: 'chbrown' });
  expect(results.map((r) => (r === null ? 'null' : r.name))).toStrictEqual(['MissingError']);
});

test('broken copy (path)', () => {
  const user = { id: 'chbrown' };
  const results = applyPatch(user, [{ op: 'copy', from: '/id', path: '/a/b' }]);
  expect(user).toStrictEqual({ id: 'chbrown' });
  expect(results.map((r) => (r === null ? 'null' : r.name))).toStrictEqual(['MissingError']);
});
