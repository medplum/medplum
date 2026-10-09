// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { resolveId } from '@medplum/core';
import type { RequestGroup, ResourceType } from '@medplum/fhirtypes';
import { Document, RequestGroupDisplay, useResource } from '@medplum/react';
import type { JSX } from 'react';
import { useParams } from 'react-router';
import { useAppNavigate } from '../useAppNavigate';

export function ChecklistPage(): JSX.Element | null {
  const { resourceType, id } = useParams() as { resourceType: ResourceType; id: string };
  const resource = useResource({ reference: resourceType + '/' + id });
  const navigate = useAppNavigate();

  if (!resource) {
    return null;
  }

  return (
    <Document>
      <RequestGroupDisplay
        value={resource as RequestGroup}
        onStart={(_task, taskInput) => navigate(`/forms/${resolveId(taskInput)}`)}
        onEdit={(_task, _taskInput, taskOutput) => navigate(`/${taskOutput.reference}`)}
      />
    </Document>
  );
}
