// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { isResource } from '@medplum/core';
import type { Task } from '@medplum/fhirtypes';
import { useCallback } from 'react';
import { useMedplum } from '@medplum/react-hooks';
import { SCRIPTSURE_MESSAGE_TASK_BOT } from './common';

export type ScriptSureMessageTaskAction = 'launch' | 'reconcile' | 'acknowledge';

/** Request accepted by the ScriptSure message-task bot. */
export interface ScriptSureMessageTaskRequest {
  taskId: string;
  action: ScriptSureMessageTaskAction;
  organizationId?: string;
}

/** Validated response returned by the ScriptSure message-task bot. */
export interface ScriptSureMessageTaskResponse {
  task: Task;
  launchUrl?: string;
  vendorStatus?: string;
}

export interface ScriptSureMessageTaskParams {
  taskId: string;
  organizationId?: string;
}

export interface UseScriptSureMessageTaskReturn {
  launch: (params: ScriptSureMessageTaskParams) => Promise<ScriptSureMessageTaskResponse>;
  reconcile: (params: ScriptSureMessageTaskParams) => Promise<ScriptSureMessageTaskResponse>;
  acknowledge: (params: ScriptSureMessageTaskParams) => Promise<ScriptSureMessageTaskResponse>;
}

const INVALID_MESSAGE_TASK_RESPONSE = 'Invalid ScriptSure message-task response';

function parseMessageTaskResponse(value: unknown): ScriptSureMessageTaskResponse {
  if (!value || typeof value !== 'object') {
    throw new Error(INVALID_MESSAGE_TASK_RESPONSE);
  }
  const response = value as Record<string, unknown>;
  if (
    !isResource<Task>(response.task, 'Task') ||
    (response.launchUrl !== undefined && typeof response.launchUrl !== 'string') ||
    (response.vendorStatus !== undefined && typeof response.vendorStatus !== 'string')
  ) {
    throw new Error(INVALID_MESSAGE_TASK_RESPONSE);
  }
  return response as unknown as ScriptSureMessageTaskResponse;
}

/**
 * Executes the ScriptSure pharmacy-message Task lifecycle bot.
 *
 * The hook intentionally exposes only the three supported actions and validates
 * the untyped Bot response before returning it to the application.
 *
 * @returns Typed launch, reconcile, and acknowledge callbacks.
 */
export function useScriptSureMessageTask(): UseScriptSureMessageTaskReturn {
  const medplum = useMedplum();

  const execute = useCallback(
    async (
      action: ScriptSureMessageTaskAction,
      params: ScriptSureMessageTaskParams
    ): Promise<ScriptSureMessageTaskResponse> => {
      const request: ScriptSureMessageTaskRequest = { ...params, action };
      return parseMessageTaskResponse(await medplum.executeBot(SCRIPTSURE_MESSAGE_TASK_BOT, request));
    },
    [medplum]
  );

  const launch = useCallback(
    (params: ScriptSureMessageTaskParams) => execute('launch', params),
    [execute]
  );
  const reconcile = useCallback(
    (params: ScriptSureMessageTaskParams) => execute('reconcile', params),
    [execute]
  );
  const acknowledge = useCallback(
    (params: ScriptSureMessageTaskParams) => execute('acknowledge', params),
    [execute]
  );

  return { launch, reconcile, acknowledge };
}
