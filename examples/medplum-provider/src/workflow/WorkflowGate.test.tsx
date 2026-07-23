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

  test('shows contact-administrator guidance for non-admins', async () => {
    vi.spyOn(medplum, 'searchOne').mockResolvedValue(undefined);
    vi.spyOn(medplum, 'isProjectAdmin').mockReturnValue(false);
    renderGate();
    expect(await screen.findByText('Order Labs is unavailable')).toBeInTheDocument();
    expect(screen.getByText(/contact your administrator/i)).toBeInTheDocument();
    // Non-admins are not shown the internal integration name
    expect(screen.queryByText('Health Gorilla lab ordering')).not.toBeInTheDocument();
    expect(screen.queryByText('Lab ordering form')).not.toBeInTheDocument();
  });
});
