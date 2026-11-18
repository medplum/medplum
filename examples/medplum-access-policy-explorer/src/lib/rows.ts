// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getReferenceString } from '@medplum/core';
import type { AccessPolicy, ProjectMembershipAccessParameter } from '@medplum/fhirtypes';
import type { AccessRow, MergeOptions } from './merge';

export interface PolicyRowState extends AccessRow {
  readonly id: string;
  /** Reference to the stored policy; undefined for pasted policies. */
  readonly reference?: string;
  /** The policy as loaded, kept once its JSON has been edited here so the edit can be reverted. */
  readonly original?: AccessPolicy;
}

export type ExplorerOptions = Required<MergeOptions>;

let nextId = 0;

export function makeRow(policy: AccessPolicy, parameters: ProjectMembershipAccessParameter[] = []): PolicyRowState {
  return {
    id: `row-${nextId++}`,
    label: policy.name ?? (policy.id ? `AccessPolicy/${policy.id}` : 'Pasted policy'),
    policy,
    parameters,
    reference: policy.id ? getReferenceString(policy) : undefined,
  };
}
