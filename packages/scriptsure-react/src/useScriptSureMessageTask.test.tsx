// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Task } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { act, renderHook } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { vi } from 'vitest';
import { SCRIPTSURE_MESSAGE_TASK_BOT } from './common';
import { useScriptSureMessageTask } from './useScriptSureMessageTask';

const task: Task = {
  resourceType: 'Task',
  id: 'task-1',
  status: 'requested',
  intent: 'order',
};

function wrapper(medplum: MockClient) {
  return function Wrapper(props: { children: ReactNode }): JSX.Element {
    return <MedplumProvider medplum={medplum}>{props.children}</MedplumProvider>;
  };
}

describe('useScriptSureMessageTask', () => {
  test.each(['launch', 'reconcile', 'acknowledge'] as const)('executes the %s action', async (action) => {
    const medplum = new MockClient();
    const executeBot = vi.spyOn(medplum, 'executeBot').mockResolvedValue({
      task,
      launchUrl: action === 'launch' ? 'https://example.com/messages' : undefined,
      vendorStatus: 'Error',
    });
    const { result } = renderHook(() => useScriptSureMessageTask(), { wrapper: wrapper(medplum) });

    await act(async () => {
      await result.current[action]({ taskId: 'task-1', organizationId: 'org-1' });
    });

    expect(executeBot).toHaveBeenCalledWith(SCRIPTSURE_MESSAGE_TASK_BOT, {
      taskId: 'task-1',
      organizationId: 'org-1',
      action,
    });
  });

  test.each([
    undefined,
    {},
    { task: { resourceType: 'Patient' } },
    { task, launchUrl: 42 },
    { task, vendorStatus: false },
  ])('rejects malformed bot response %#', async (response) => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'executeBot').mockResolvedValue(response);
    const { result } = renderHook(() => useScriptSureMessageTask(), { wrapper: wrapper(medplum) });

    await expect(result.current.reconcile({ taskId: 'task-1' })).rejects.toThrow(
      'Invalid ScriptSure message-task response'
    );
  });
});
