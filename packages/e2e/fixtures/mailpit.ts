// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { expect } from '@playwright/test';

const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://localhost:8025/';

export interface Email {
  subject: string;
  text: string;
}

/**
 * Waits for Mailpit to receive an email for the recipient and returns the newest one.
 * @param to - The recipient address. Tests use unique addresses, so no other test's mail matches.
 * @returns The email subject and plain-text body.
 */
export async function waitForEmail(to: string): Promise<Email> {
  const query = encodeURIComponent(`to:"${to}"`);
  let id: string | undefined;
  await expect
    .poll(
      async () => {
        const res = await fetch(`${MAILPIT_URL}api/v1/search?query=${query}`);
        const body = (await res.json()) as { messages: { ID: string }[] };
        id = body.messages[0]?.ID;
        return id;
      },
      { message: `Email to ${to}` }
    )
    .toBeDefined();

  const res = await fetch(`${MAILPIT_URL}api/v1/message/${id}`);
  const message = (await res.json()) as { Subject: string; Text: string };
  return { subject: message.Subject, text: message.Text };
}
