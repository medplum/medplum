// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Bot } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '../test-utils/render';
import { WorkflowDependenciesPanel } from './WorkflowDependenciesPanel';

const ANY_BOT: WithId<Bot> = { resourceType: 'Bot', id: 'bot' };

describe('WorkflowDependenciesPanel', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  function renderPanel(): void {
    render(
      <MedplumProvider medplum={medplum}>
        <WorkflowDependenciesPanel />
      </MedplumProvider>
    );
  }

  test('renders nothing for non-admins', async () => {
    vi.spyOn(medplum, 'isProjectAdmin').mockReturnValue(false);
    const searchOne = vi.spyOn(medplum, 'searchOne').mockResolvedValue(undefined);
    renderPanel();
    expect(screen.queryByText('Missing project dependencies')).not.toBeInTheDocument();
    // The panel short-circuits before probing for non-admins
    expect(searchOne).not.toHaveBeenCalled();
  });

  test('lists blocked workflows for admins when dependencies are missing', async () => {
    vi.spyOn(medplum, 'isProjectAdmin').mockReturnValue(true);
    vi.spyOn(medplum, 'searchOne').mockResolvedValue(undefined);
    renderPanel();
    expect(await screen.findByText('Missing project dependencies')).toBeInTheDocument();
    expect(screen.getByText('Order Labs')).toBeInTheDocument();
    expect(screen.getByText('Health Gorilla lab ordering')).toBeInTheDocument();
  });

  test('renders nothing for admins when all dependencies are present', async () => {
    vi.spyOn(medplum, 'isProjectAdmin').mockReturnValue(true);
    const searchOne = vi.spyOn(medplum, 'searchOne').mockResolvedValue(ANY_BOT);
    renderPanel();
    // One gated workflow (Order Labs), one dependency
    await waitFor(() => expect(searchOne).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Missing project dependencies')).not.toBeInTheDocument();
  });
});
