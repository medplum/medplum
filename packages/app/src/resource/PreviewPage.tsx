// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ResourceType } from '@medplum/fhirtypes';
import { useResource } from '@medplum/react';
import type { JSX } from 'react';
import { useParams } from 'react-router';
import { QuestionnairePreview } from './QuestionnairePreview';
import { ValueSetPreview } from './ValueSetPreview';

export function PreviewPage(): JSX.Element | null {
  const { resourceType, id } = useParams() as { resourceType: ResourceType; id: string };
  const resource = useResource({ reference: resourceType + '/' + id });

  if (!resource) {
    return null;
  }

  if (resource.resourceType === 'Questionnaire') {
    return <QuestionnairePreview resourceType={resourceType} id={id} />;
  }

  if (resource.resourceType === 'ValueSet') {
    return <ValueSetPreview valueSet={resource} />;
  }

  return null;
}
