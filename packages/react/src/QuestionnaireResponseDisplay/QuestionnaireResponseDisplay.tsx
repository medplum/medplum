// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack } from '@mantine/core';
import { QuestionnaireResponse, Reference } from '@medplum/fhirtypes';
import { useResource } from '@medplum/react-hooks';
import { JSX } from 'react';
import { QuestionnaireResponseItemDisplay } from './QuestionnaireResponseItemDisplay';

export interface QuestionnaireResponseDisplayProps {
  readonly questionnaireResponse: QuestionnaireResponse | Reference<QuestionnaireResponse>;
}

export function QuestionnaireResponseDisplay(props: QuestionnaireResponseDisplayProps): JSX.Element {
  const questionnaireResponse = useResource(props.questionnaireResponse);

  return (
    <Stack gap={0}>
      {questionnaireResponse?.item?.map((item, index) => (
        <QuestionnaireResponseItemDisplay key={`item-${item.id ?? index}`} item={item} />
      ))}
    </Stack>
  );
}
