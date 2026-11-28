// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { MedplumClient } from '@medplum/core';
import type { Resource } from '@medplum/fhirtypes';

export async function currentProjectId(medplum: MedplumClient): Promise<string> {
  await medplum.getProfileAsync();
  const id = medplum.getProject()?.id;
  if (!id) {
    throw new Error('Missing authenticated customer project');
  }
  return id;
}

export async function projectQuery(medplum: MedplumClient, query: string | Record<string, string>): Promise<string> {
  const params = new URLSearchParams(query);
  params.set('_project', await currentProjectId(medplum));
  return params.toString();
}

export async function assertCurrentProject(medplum: MedplumClient, resource: Resource): Promise<void> {
  if (resource.meta?.project !== (await currentProjectId(medplum))) {
    throw new Error('Calendar resource belongs to a different project');
  }
}
