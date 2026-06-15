// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { AuditEvent, Bot, Observation, ProjectMembership } from '@medplum/fhirtypes';
import { randomUUID } from 'node:crypto';
import type { MockInstance } from 'vitest';
import type { BotExecutionRequest } from '../bots/types';
import { loadTestConfig } from '../config/loader';
import { globalLogger } from '../logger';
import {
  ApplicationAgentType,
  AuditEventOutcome,
  createAuditEvent,
  createBotAuditEvent,
  CreateInteraction,
  logAuditEvent,
  ReadInteraction,
  RestfulOperationType,
} from './auditevent';

describe('AuditEvent utils', () => {
  let writeSpy: MockInstance;

  beforeEach(() => {
    writeSpy = vi.spyOn(globalLogger, 'write' as any).mockImplementation(() => undefined);
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  test('AuditEvents disabled', async () => {
    const config = await loadTestConfig();
    config.logAuditEvents = false;

    logAuditEvent({ resourceType: 'AuditEvent' } as AuditEvent);

    expect(writeSpy).not.toHaveBeenCalled();
  });

  test('AuditEvent to log', async () => {
    const config = await loadTestConfig();
    config.logAuditEvents = true;

    // Log an AuditEvent
    logAuditEvent({ resourceType: 'AuditEvent' } as AuditEvent);

    // It should have been logged
    expect(writeSpy).toHaveBeenCalledWith('{"resourceType":"AuditEvent"}');
  });

  test('Redacts display text when config flag set', async () => {
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
    expect(writeSpy).toHaveBeenCalledTimes(1);
    const auditLog = writeSpy.mock.calls[0][0] as string;
    expect(auditLog).toContain(`{"resourceType":"AuditEvent",`);
    expect(auditLog).not.toContain('HIV');
    expect(auditLog).not.toContain('Test');
    expect(auditLog).not.toContain('User');
  });

  test('Appends authenticating client as a non-requestor agent', async () => {
    await loadTestConfig();

    const auditEvent = createAuditEvent(
      RestfulOperationType,
      ReadInteraction,
      randomUUID(),
      { reference: 'Practitioner/user-123' },
      undefined,
      AuditEventOutcome.Success,
      { client: { reference: 'ClientApplication/agent-client' } }
    );

    expect(auditEvent.agent).toHaveLength(2);
    expect(auditEvent.agent?.[0]).toMatchObject({
      who: { reference: 'Practitioner/user-123' },
      requestor: true,
    });
    expect(auditEvent.agent?.[1]).toMatchObject({
      who: { reference: 'ClientApplication/agent-client' },
      requestor: false,
      type: { coding: [ApplicationAgentType] },
    });
  });

  test('Does not duplicate client agent when client is the actor', async () => {
    await loadTestConfig();

    // client_credentials: the client is itself the author/actor (agent[0]).
    const clientRef = { reference: 'ClientApplication/agent-client' };
    const auditEvent = createAuditEvent(
      RestfulOperationType,
      ReadInteraction,
      randomUUID(),
      clientRef,
      undefined,
      AuditEventOutcome.Success,
      { client: clientRef }
    );

    expect(auditEvent.agent).toHaveLength(1);
    expect(auditEvent.agent?.[0]).toMatchObject({ who: clientRef, requestor: true });
  });

  test('Omits client agent when no client is present', async () => {
    await loadTestConfig();

    const auditEvent = createAuditEvent(
      RestfulOperationType,
      ReadInteraction,
      randomUUID(),
      { reference: 'Practitioner/user-123' },
      undefined,
      AuditEventOutcome.Success
    );

    expect(auditEvent.agent).toHaveLength(1);
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
      await createBotAuditEvent(req, new Date().toISOString(), AuditEventOutcome.Success, '');
      expect(writeSpy).not.toHaveBeenCalled();
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
    const req: BotExecutionRequest = { bot, runAs, input: 'foo', contentType: 'text/plain' };

    await createBotAuditEvent(req, new Date().toISOString(), AuditEventOutcome.Success, 'foo');
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining(`,"outcomeDesc":"foo"`));
  });
});
