// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { PlanDefinition, ResourceType } from '@medplum/fhirtypes';
import { Document, useResource } from '@medplum/react';
import { JSX } from 'react';
import { useParams } from 'react-router';
import { PlanDefinitionApplyForm } from './PlanDefinitionApplyForm';

export function ApplyPage(): JSX.Element | null {
  const { resourceType, id } = useParams() as { resourceType: ResourceType; id: string };
  const resource = useResource({ reference: resourceType + '/' + id });

  if (!resource) {
    return null;
  }

  return (
    <Document>
      <PlanDefinitionApplyForm planDefinition={resource as PlanDefinition} />
    </Document>
  );
}
