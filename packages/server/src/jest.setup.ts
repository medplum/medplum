// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type supertest from 'supertest';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface Matchers<R> {
      toHaveStatus(expected: number): R;
    }
  }
}

expect.extend({
  toHaveStatus(received: supertest.Response, expected: number) {
    const pass = received.status === expected;
    if (pass) {
      return {
        pass: true,
        message: () => `Expected status not to be ${expected}`,
      };
    }
    let bodyStr: string;
    try {
      bodyStr = JSON.stringify(received.body, null, 2);
    } catch {
      bodyStr = received.text ?? '(empty)';
    }
    return {
      pass: false,
      message: () =>
        `Expected status ${expected}, received ${received.status}\n\nResponse body:\n${bodyStr}`,
    };
  },
});
