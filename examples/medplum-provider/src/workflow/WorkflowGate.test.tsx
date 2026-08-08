// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Bot } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen } from '../test-utils/render';
import { WorkflowGate } from './WorkflowGate';

const HG_BOT: WithId<Bot> = { resourceType: 'Bot', id: 'hg-bot' };

describe('WorkflowGate', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  function renderGate(): void {
    render(
      <MedplumProvider medplum={medplum}>
        <WorkflowGate workflow="order-labs">
          <div>Lab ordering form</div>
        </WorkflowGate>
      </MedplumProvider>
    );
  }

  test('renders children when the dependency is present', async () => {
    vi.spyOn(medplum, 'searchOne').mockResolvedValue(HG_BOT);
    vi.spyOn(medplum, 'isProjectAdmin').mockReturnValue(true);
    renderGate();
    expect(await screen.findByText('Lab ordering form')).toBeInTheDocument();
  });

  test('blocks with admin guidance when the dependency is missing', async () => {
    vi.spyOn(medplum, 'searchOne').mockResolvedValue(undefined);
    vi.spyOn(medplum, 'isProjectAdmin').mockReturnValue(true);
    renderGate();
    expect(await screen.findByText('Order Labs is unavailable')).toBeInTheDocument();
    // Admins see the specific missing integration
    expect(screen.getByText('Health Gorilla lab ordering')).toBeInTheDocument();
    expect(screen.queryByText('Lab ordering form')).not.toBeInTheDocument();
  });

  test('never blocks non-admins, whose empty Bot search may just be an AccessPolicy', async () => {
    // A non-admin under an AccessPolicy that hides Bot sees exactly what a missing integration
    // looks like, so blocking would lock a clinician out of a working workflow.
    const searchOne = vi.spyOn(medplum, 'searchOne').mockResolvedValue(undefined);
    vi.spyOn(medplum, 'isProjectAdmin').mockReturnValue(false);
    renderGate();
    expect(await screen.findByText('Lab ordering form')).toBeInTheDocument();
    expect(screen.queryByText('Order Labs is unavailable')).not.toBeInTheDocument();
    // ...and they never pay for the probe
    expect(searchOne).not.toHaveBeenCalled();
  });
});
