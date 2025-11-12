// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AuditEvent, Observation } from '@medplum/fhirtypes';
import 'aws-sdk-client-mock-jest';
import { randomUUID } from 'node:crypto';
import { loadTestConfig } from '../config/loader';
import {
  AuditEventOutcome,
  createAuditEvent,
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
});
