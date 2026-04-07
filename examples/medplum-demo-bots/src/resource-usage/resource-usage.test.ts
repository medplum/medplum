// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference } from '@medplum/core';
import type { BotEvent, MedplumClient } from '@medplum/core';
import type { Bot } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handler } from './resource-usage';

interface TestContext {
  medplum: MedplumClient;
  bot: Bot;
  event: BotEvent;
}

describe('resource-usage bot', () => {
  beforeEach(async (ctx: TestContext) => {
    ctx.medplum = new MockClient();
    ctx.bot = await ctx.medplum.createResource<Bot>({
      resourceType: 'Bot',
      name: 'Resource Usage Bot',
      description: 'A bot that generates a resource usage report',
    });
    // Mock event
    ctx.event = {
      bot: createReference(ctx.bot),
    } as BotEvent;
  });

  it<TestContext>('should generate and email a resource usage report', async ({ medplum, event }) => {
    vi.spyOn(medplum, 'sendEmail');
    const result = await handler(medplum, event);
    expect(result).toEqual({ success: true });

    // Check that sendEmail was called with correct parameters
    expect(medplum.sendEmail).toHaveBeenCalled();
    const emailArgs = (medplum.sendEmail as any).mock.calls[0][0];
    expect(emailArgs.to).toEqual(['admin@example.com', 'admin2@example.com']);
    expect(emailArgs.subject).toContain('Resource Usage Report');
    expect(emailArgs.attachments[0].filename).toContain('resource-usage-');
    expect(emailArgs.attachments[0].content).toContain('Resource Type,Count');
    expect(emailArgs.attachments[0].content).toContain('Observation,8');
  });

  it<TestContext>('should sort resource types by count in descending order', async ({ medplum, event }) => {
    // Mock sendEmail to capture the CSV content
    const sendEmailSpy = vi.spyOn(medplum, 'sendEmail');

    await handler(medplum, event);

    // Get the CSV content from the email attachment
    const emailArgs = sendEmailSpy.mock.calls[0][0];
    expect(emailArgs.attachments).toBeDefined();
    const csvContent = emailArgs.attachments?.[0]?.content as string;
    expect(csvContent).toBeDefined();

    // Split CSV into lines and find the data rows (skip header rows)
    const lines = csvContent.split('\n');
    const dataStartIndex = lines.findIndex((line) => line.startsWith('Resource Type,Count')) + 1;
    const dataLines = lines.slice(dataStartIndex).filter((line) => line.trim() !== '');

    // Extract counts from each line and verify descending order
    const counts: number[] = [];
    for (const line of dataLines) {
      const parts = line.split(',');
      if (parts.length === 2) {
        const count = Number.parseInt(parts[1], 10);
        if (!Number.isNaN(count)) {
          counts.push(count);
        }
      }
    }

    // Verify counts are in descending order
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
    }

    // Verify we actually have some counts to test
    expect(counts.length).toBeGreaterThan(0);
  });
});
