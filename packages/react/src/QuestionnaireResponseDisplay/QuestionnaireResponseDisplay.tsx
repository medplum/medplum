import { Stack } from '@mantine/core';
import { QuestionnaireResponse, Reference } from '@medplum/fhirtypes';
import { useResource } from '@medplum/react-hooks';
import { JSX } from 'react';
import { QuestionnaireResponseItemDisplay } from './QuestionnaireResponseItemDisplay';

export interface QuestionnaireResponseDisplayProps {
  questionnaireResponse: QuestionnaireResponse | Reference<QuestionnaireResponse>;
}

export function QuestionnaireResponseDisplay(props: QuestionnaireResponseDisplayProps): JSX.Element {
  const questionnaireResponse = useResource(props.questionnaireResponse);

  return (
    <Stack>
    {questionnaireResponse?.item?.map((item) => (
      <QuestionnaireResponseItemDisplay key={item.id} item={item} order={4} />
    ))}
    </Stack>
  );
}
