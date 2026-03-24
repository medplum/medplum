// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { AuditEvent, Bot, Observation, ProjectMembership } from '@medplum/fhirtypes';
import 'aws-sdk-client-mock-jest';
import { randomUUID } from 'node:crypto';
import type { BotExecutionRequest } from '../bots/types';
import { loadTestConfig } from '../config/loader';
import {
  AuditEventOutcome,
  createAuditEvent,
  createBotAuditEvent,
  CreateInteraction,
  logAuditEvent,
  RestfulOperationType,
} from './auditevent';

describe('AuditEvent utils', () => {
  test('AuditEvents disabled', async () => {
    console.info = jest.fn();
    console.log = jest.fn();

    const config = await loadTestConfig();
    config.logAuditEvents = false;

    logAuditEvent({ resourceType: 'AuditEvent' } as AuditEvent);

    expect(console.info).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
  });

  test('AuditEvent to console.log', async () => {
    console.log = jest.fn();

    const config = await loadTestConfig();
    config.logAuditEvents = true;

    // Log an AuditEvent
    logAuditEvent({ resourceType: 'AuditEvent' } as AuditEvent);

    // It should have been logged
    expect(console.log).toHaveBeenCalledWith('{"resourceType":"AuditEvent"}');
  });

  test('Redacts display text when config flag set', async () => {
    console.log = jest.fn();

    const config = await loadTestConfig();
    config.logAuditEvents = true;
    config.redactAuditEvents = true;

    const resource: Observation = {
      resourceType: 'Observation',
      id: randomUUID(),
      status: 'final',
      code: { text: 'HIV Test' },
    };

    // Log an AuditEvent
    const auditEvent = createAuditEvent(
      RestfulOperationType,
      CreateInteraction,
      randomUUID(),
      { reference: 'Practitioner/123', display: 'Test User' },
      undefined,
      AuditEventOutcome.Success,
      { resource }
    );
    logAuditEvent(auditEvent);

    // It should have been logged
    expect(console.log).toHaveBeenCalledTimes(1);
    const auditLog = (console.log as jest.Mock).mock.calls[0][0];
    expect(auditLog).toContain(`{"resourceType":"AuditEvent",`);
    expect(auditLog).not.toContain('HIV');
    expect(auditLog).not.toContain('Test');
    expect(auditLog).not.toContain('User');
  });

  test.each<Bot['auditEventTrigger']>(['never', 'on-error', 'on-output'])(
    'Skips creating audit event with `%s` trigger',
    async (trigger) => {
      const bot: WithId<Bot> = {
        resourceType: 'Bot',
        id: randomUUID(),
        auditEventTrigger: trigger,
        auditEventDestination: ['log'],
      };
      const runAs: WithId<ProjectMembership> = {
        resourceType: 'ProjectMembership',
        id: randomUUID(),
        project: { reference: `Project/${randomUUID()}` },
        user: { reference: `User/${randomUUID()}` },
        profile: { reference: `Practitioner/${randomUUID()}` },
      };
      const req: BotExecutionRequest = { bot, runAs, input: 'foo', contentType: 'text/plain' };

      // Successful execution with no output won't trigger on-error or on-output
      console.log = jest.fn();
      await createBotAuditEvent(req, new Date().toISOString(), AuditEventOutcome.Success, '');
      expect(console.log).not.toHaveBeenCalled();
    }
  );

  test('Logs Bot output', async () => {
    const config = await loadTestConfig();
    config.logAuditEvents = true;

    const bot: WithId<Bot> = {
      resourceType: 'Bot',
      id: randomUUID(),
      auditEventTrigger: 'on-output',
      auditEventDestination: ['log'],
    };
    const runAs: WithId<ProjectMembership> = {
      resourceType: 'ProjectMembership',
      id: randomUUID(),
      project: { reference: `Project/${randomUUID()}` },
      user: { reference: `User/${randomUUID()}` },
      profile: { reference: `Practitioner/${randomUUID()}` },
    };
    const req: BotExecutionRequest = { bot, runAs, input: 'some-input', contentType: 'text/plain' };

    console.log = jest.fn();
    await createBotAuditEvent(req, new Date().toISOString(), AuditEventOutcome.Success, 'some-output');
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining(`,"outcomeDesc":"some-output"`));
  });
});
