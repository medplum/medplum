// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { vi } from 'vitest';

/**
 * Automatic manual mock for the `hibp` package (haveibeenpwned.com client).
 *
 * This guarantees tests never make real HTTPS requests to
 * api.pwnedpasswords.com via `setPassword`/`createUser`
 * (src/auth/setpassword.ts, src/auth/newuser.ts).
 *
 * The default implementation reports the password as not breached. Tests that need
 * a breached result can configure it with `setupPwnedPasswordMock` from test.setup.
 */
export const pwnedPassword = vi.fn(async function (_password: string): Promise<number> {
  return 0;
});
