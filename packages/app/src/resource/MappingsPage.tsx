// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ResourceType } from '@medplum/fhirtypes';
import { useResource } from '@medplum/react';
import type { JSX } from 'react';
import { useParams } from 'react-router';
import { ConceptMapMappingsDisplay } from './ConceptMapMappingsDisplay';

export function MappingsPage(): JSX.Element | null {
  const { resourceType, id } = useParams() as { resourceType: ResourceType; id: string };
  const resource = useResource({ reference: resourceType + '/' + id });

  if (!resource) {
    return null;
  }

  if (resource.resourceType === 'ConceptMap') {
    return <ConceptMapMappingsDisplay conceptMap={resource} />;
  }

  return null;
}
