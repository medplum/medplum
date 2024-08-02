import { Title } from '@mantine/core';
import { ProfileResource, createReference, getReferenceString } from '@medplum/core';
import {
  Encounter,
  Questionnaire,
  QuestionnaireItem,
  QuestionnaireResponse,
  QuestionnaireResponseItem,
  Reference,
} from '@medplum/fhirtypes';
import { useMedplum, useResource } from '@medplum/react-hooks';
import { useCallback, useEffect, useState } from 'react';
import { Form } from '../Form/Form';
import { buildInitialResponse, getNumberOfPages, isQuestionEnabled } from '../utils/questionnaire';
import { QuestionnaireFormContext } from './QuestionnaireForm.context';
import { QuestionnairePageSequence } from './QuestionnaireFormComponents/QuestionnaireFormPageSequence';

export interface QuestionnaireFormProps {
  readonly questionnaire: Questionnaire | Reference<Questionnaire>;
  readonly subject?: Reference;
  readonly encounter?: Reference<Encounter>;
  readonly disablePagination?: boolean;
  readonly excludeButtons?: boolean;
  readonly submitButtonText?: string;
  readonly onChange?: (response: QuestionnaireResponse) => void;
  readonly onSubmit?: (response: QuestionnaireResponse) => void;
}

export function QuestionnaireForm(props: QuestionnaireFormProps): JSX.Element | null {
  const medplum = useMedplum();
  const source = medplum.getProfile();
  const [schemaLoaded, setSchemaLoaded] = useState(false);
  const questionnaire = useResource(props.questionnaire);
  const [response, setResponse] = useState<QuestionnaireResponse | undefined>();
  const [activePage, setActivePage] = useState(0);
  const { onChange } = props;

  useEffect(() => {
    medplum
      .requestSchema('Questionnaire')
      .then(() => medplum.requestSchema('QuestionnaireResponse'))
      .then(() => setSchemaLoaded(true))
      .catch(console.log);
  }, [medplum]);

  useEffect(() => {
    setResponse(questionnaire ? buildInitialResponse(questionnaire) : undefined);
  }, [questionnaire]);

  const setItems = useCallback(
    (newResponseItems: QuestionnaireResponseItem | QuestionnaireResponseItem[]): void => {
      setResponse((prevResponse) => {
        const currentItems = prevResponse?.item ?? [];
        const mergedItems = mergeItems(
          currentItems,
          Array.isArray(newResponseItems) ? newResponseItems : [newResponseItems]
        );

        const newResponse: QuestionnaireResponse = {
          resourceType: 'QuestionnaireResponse',
          status: 'in-progress',
          item: mergedItems,
        };

        if (onChange) {
          try {
            onChange(newResponse);
          } catch (e) {
            console.error('Error invoking QuestionnaireForm.onChange callback', e);
          }
        }

        return newResponse;
      });
    },
    [onChange]
  );

  function checkForQuestionEnabled(item: QuestionnaireItem): boolean {
    return isQuestionEnabled(item, response?.item ?? []);
  }

  if (!schemaLoaded || !questionnaire || !response) {
    return null;
  }

  const numberOfPages = getNumberOfPages(questionnaire);
  const nextStep = (): void => setActivePage((current) => current + 1);
  const prevStep = (): void => setActivePage((current) => current - 1);

  return (
    <QuestionnaireFormContext.Provider value={{ subject: props.subject, encounter: props.encounter }}>
      <Form
        testid="questionnaire-form"
        onSubmit={() => {
          if (props.onSubmit && response) {
            props.onSubmit({
              ...response,
              questionnaire: getReferenceString(questionnaire),
              subject: props.subject,
              source: createReference(source as ProfileResource),
              authored: new Date().toISOString(),
              status: 'completed',
            });
          }
        }}
      >
        {questionnaire.title && <Title>{questionnaire.title}</Title>}
        <QuestionnairePageSequence
          items={questionnaire.item ?? []}
          response={response}
          onChange={setItems}
          renderPages={!props.disablePagination && numberOfPages > 1}
          activePage={activePage}
          numberOfPages={numberOfPages}
          excludeButtons={props.excludeButtons}
          submitButtonText={props.submitButtonText}
          checkForQuestionEnabled={checkForQuestionEnabled}
          nextStep={nextStep}
          prevStep={prevStep}
        />
      </Form>
    </QuestionnaireFormContext.Provider>
  );
}

function mergeIndividualItems(
  prevItem: QuestionnaireResponseItem,
  newItem: QuestionnaireResponseItem
): QuestionnaireResponseItem {
  // Recursively merge the nested items based on their ids.
  const mergedNestedItems = mergeItems(prevItem.item ?? [], newItem.item ?? []);

  return {
    ...newItem,
    item: mergedNestedItems.length > 0 ? mergedNestedItems : undefined,
    answer: newItem.answer && newItem.answer.length > 0 ? newItem.answer : prevItem.answer,
  };
}

function mergeItems(
  prevItems: QuestionnaireResponseItem[],
  newItems: QuestionnaireResponseItem[]
): QuestionnaireResponseItem[] {
  const result: QuestionnaireResponseItem[] = [];
  const usedIds = new Set<string>();

  for (const prevItem of prevItems) {
    const itemId = prevItem.id;
    const newItem = newItems.find((item) => item.id === itemId);

    if (newItem) {
      result.push(mergeIndividualItems(prevItem, newItem));
      usedIds.add(newItem.id as string);
    } else {
      result.push(prevItem);
    }
  }

  // Add items from newItems that were not in prevItems.
  for (const newItem of newItems) {
    if (!usedIds.has(newItem.id as string)) {
      result.push(newItem);
    }
  }

  return result;
}
