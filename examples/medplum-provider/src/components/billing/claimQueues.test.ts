// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Operator } from '@medplum/core';
import { describe, expect, test } from 'vitest';
import { getClaimQueue } from './claimQueues';

describe('claimQueues', () => {
  const noRemit = {
    code: '_filter',
    operator: Operator.EQUALS,
    value: 'not (_has:ClaimResponse:request:payment-date pr true)',
  };

  test('Paid & Closed needs a posted payment, not just a complete outcome', () => {
    const filters = getClaimQueue('paid').filters?.(new Date());
    expect(filters).toContainEqual({ code: 'status', operator: Operator.EQUALS, value: 'active' });
    expect(filters).toContainEqual({
      code: '_has:ClaimResponse:request:payment-date',
      operator: Operator.MISSING,
      value: 'false',
    });
  });

  test('Awaiting Payer has submitted claims without a payment or rejection', () => {
    const filters = getClaimQueue('awaiting-payer').filters?.(new Date());
    expect(filters).toContainEqual(noRemit);
    expect(filters).toContainEqual({
      code: '_filter',
      operator: Operator.EQUALS,
      value: 'not (_has:ClaimResponse:request:outcome eq error)',
    });
  });

  test('Rejected has rejected claims that are not being fixed or paid', () => {
    const rejected = getClaimQueue('rejected').filters?.(new Date());
    expect(rejected).toContainEqual(noRemit);
    expect(rejected).toContainEqual({
      code: '_has:ClaimResponse:request:outcome',
      operator: Operator.EQUALS,
      value: 'error',
    });
    expect(rejected).toContainEqual({ code: 'status', operator: Operator.NOT, value: 'draft,cancelled' });
  });
});
