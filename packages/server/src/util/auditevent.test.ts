// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AuditEvent } from '@medplum/fhirtypes';
import 'aws-sdk-client-mock-jest';
import { loadTestConfig } from '../config/loader';
import { logAuditEvent } from './auditevent';

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
});
