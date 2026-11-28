// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ValidationChain } from 'express-validator';
import { emailField, passwordField, stringField } from './validator';

async function errors(chain: ValidationChain, body: Record<string, unknown>): Promise<string[]> {
  const result = await chain.run({ body });
  return result.array().map((e) => e.msg);
}

describe('Validator helpers', () => {
  test('stringField rejects arrays that would pass element-wise validators', async () => {
    const id = '00000000-0000-0000-0000-000000000000';
    expect(await errors(stringField('id', 'Invalid id').isUUID(), { id })).toEqual([]);
    expect(await errors(stringField('id', 'Invalid id').isUUID(), { id: [id] })).toEqual(['Invalid id']);
    expect(await errors(stringField('id', 'Invalid id').notEmpty(), { id: { x: 1 } })).toEqual(['Invalid id']);
  });

  test('emailField', async () => {
    expect(await errors(emailField(), { email: 'a@example.com' })).toEqual([]);
    expect(await errors(emailField(), { email: ['a@example.com'] })).toEqual(['Valid email address is required']);
    expect(await errors(emailField(), { email: 'xyz' })).toEqual(['Valid email address is required']);
  });

  test('passwordField', async () => {
    expect(await errors(passwordField(), { password: 'correct horse' })).toEqual([]);
    expect(await errors(passwordField(), { password: ['correct horse'] })).toEqual(['Invalid password']);
    expect(await errors(passwordField(), { password: 'short' })).toEqual(['Password must be at least 8 characters']);
    expect(await errors(passwordField().optional(), {})).toEqual([]);
  });
});
