// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { Organization } from '@medplum/fhirtypes';
import type * as ScriptSureReactModule from '@medplum/scriptsure-react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ScriptSurePracticeSwitcher } from './ScriptSurePractice';

const SELECT_INPUT = 'input[aria-label="ScriptSure practice location"]';

const setSelectedOrganizationId = vi.fn();
let mockContext: ScriptSureReactModule.ScriptSurePracticeContextValue;

vi.mock('@medplum/scriptsure-react', async (importOriginal) => {
  const actual = await importOriginal<typeof ScriptSureReactModule>();
  return {
    ...actual,
    useScriptSurePractice: () => mockContext,
  };
});

function org(id: string, name: string): Organization {
  return { resourceType: 'Organization', id, name };
}

function setup(): ReturnType<typeof render> {
  return render(
    <MantineProvider>
      <ScriptSurePracticeSwitcher />
    </MantineProvider>
  );
}

describe('ScriptSurePracticeSwitcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockContext = {
      practices: [],
      selectedOrganizationId: undefined,
      setSelectedOrganizationId,
      loading: false,
    };
  });

  test('renders nothing when the prescriber has fewer than two practices', () => {
    mockContext = { ...mockContext, practices: [org('org-1', 'Practice A')], selectedOrganizationId: 'org-1' };
    const { container } = setup();
    expect(container.querySelector(SELECT_INPUT)).toBeNull();
  });

  test('renders the selector with the affiliated practices when there are two or more', () => {
    mockContext = {
      ...mockContext,
      practices: [org('org-1', 'Practice A'), org('org-2', 'Practice B')],
      selectedOrganizationId: 'org-2',
    };
    const { container } = setup();
    const select = container.querySelector<HTMLInputElement>(SELECT_INPUT);
    expect(select).toBeInTheDocument();
    expect(select).toHaveValue('Practice B');
  });

  test('calls setSelectedOrganizationId when a different practice is chosen', async () => {
    mockContext = {
      ...mockContext,
      practices: [org('org-1', 'Practice A'), org('org-2', 'Practice B')],
      selectedOrganizationId: 'org-1',
    };
    const { container } = setup();
    const select = container.querySelector<HTMLInputElement>(SELECT_INPUT) as HTMLInputElement;
    fireEvent.click(select);
    const listbox = await screen.findByRole('listbox');
    fireEvent.click(within(listbox).getByText('Practice B'));
    expect(setSelectedOrganizationId).toHaveBeenCalledWith('org-2');
  });
});
