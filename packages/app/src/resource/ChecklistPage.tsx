// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { resolveId } from '@medplum/core';
import { RequestGroup, ResourceType } from '@medplum/fhirtypes';
import { Document, RequestGroupDisplay, useResource } from '@medplum/react';
import { JSX } from 'react';
import { useNavigate, useParams } from 'react-router';

export function ChecklistPage(): JSX.Element | null {
  const { resourceType, id } = useParams() as { resourceType: ResourceType; id: string };
  const resource = useResource({ reference: resourceType + '/' + id });
  const navigate = useNavigate();

  if (!resource) {
    return null;
  }

  return (
    <Document>
      <RequestGroupDisplay
        value={resource as RequestGroup}
        onStart={(_task, taskInput) => navigate(`/forms/${resolveId(taskInput)}`)?.catch(console.error)}
        onEdit={(_task, _taskInput, taskOutput) => navigate(`/${taskOutput.reference}}`)?.catch(console.error)}
      />
    </Document>
  );
}
