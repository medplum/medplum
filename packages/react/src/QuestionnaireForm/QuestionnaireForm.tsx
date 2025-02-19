import { Title } from '@mantine/core';
import { createReference, getReferenceString } from '@medplum/core';
import {
  Encounter,
  Questionnaire,
  QuestionnaireItem,
  QuestionnaireResponse,
  QuestionnaireResponseItem,
  Reference,
} from '@medplum/fhirtypes';
import { useMedplum, usePrevious, useResource } from '@medplum/react-hooks';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Form } from '../Form/Form';
import {
  buildInitialResponse,
  getNumberOfPages,
  isQuestionEnabled,
  evaluateCalculatedExpressionsInQuestionnaire,
  mergeUpdatedItems,
} from '../utils/questionnaire';
import { QuestionnaireFormContext } from './QuestionnaireForm.context';
import { QuestionnairePageSequence } from './QuestionnaireFormComponents/QuestionnaireFormPageSequence';

export interface QuestionnaireFormProps {
  readonly questionnaire: Questionnaire | Reference<Questionnaire>;
  readonly subject?: Reference;
  readonly encounter?: Reference<Encounter>;
  readonly source?: QuestionnaireResponse['source'];
  readonly disablePagination?: boolean;
  readonly excludeButtons?: boolean;
  readonly submitButtonText?: string;
  readonly onChange?: (response: QuestionnaireResponse) => void;
  readonly onSubmit?: (response: QuestionnaireResponse) => void;
}

export function QuestionnaireForm(props: QuestionnaireFormProps): JSX.Element | null {
  const medplum = useMedplum();
  const { subject, source: sourceFromProps } = props;
  const questionnaire = useResource(props.questionnaire);
  const prevQuestionnaire = usePrevious(questionnaire);
  const [response, setResponse] = useState<QuestionnaireResponse | undefined>();
  const [activePage, setActivePage] = useState(0);

  const onChangeRef = useRef(props.onChange);
  onChangeRef.current = props.onChange;

  const onSubmitRef = useRef(props.onSubmit);
  onSubmitRef.current = props.onSubmit;

  useEffect(() => {
    // If the Questionnaire remains "the same", keep the existing response
    if (questionnaire && getQuestionnaireIdentity(prevQuestionnaire) === getQuestionnaireIdentity(questionnaire)) {
      return;
    }

    // throw out the existing response and start over
    setResponse(questionnaire ? buildInitialResponse(questionnaire) : undefined);
  }, [questionnaire, prevQuestionnaire]);

  useEffect(() => {
    if (response && onChangeRef.current) {
      try {
        onChangeRef.current(response);
      } catch (e) {
        console.error('Error invoking QuestionnaireForm.onChange callback', e);
      }
    }
  }, [response]);

  const setItems = useCallback(
    (newResponseItems: QuestionnaireResponseItem | QuestionnaireResponseItem[]): void => {
      setResponse((prevResponse) => {
        const currentItems = prevResponse?.item ?? [];
        const mergedItems = mergeItems(
          currentItems,
          Array.isArray(newResponseItems) ? newResponseItems : [newResponseItems]
        );

        const tempResponse: QuestionnaireResponse = {
          resourceType: 'QuestionnaireResponse',
          status: 'in-progress',
          item: mergedItems,
        };

        const updatedItems = evaluateCalculatedExpressionsInQuestionnaire(questionnaire?.item ?? [], tempResponse);
        const mergedItemsWithUpdates = mergeUpdatedItems(mergedItems, updatedItems);

        const newResponse: QuestionnaireResponse = {
          resourceType: 'QuestionnaireResponse',
          status: 'in-progress',
          item: mergedItemsWithUpdates,
        };

        return newResponse;
      });
    },
    [questionnaire]
  );

  const handleSubmit = useCallback(() => {
    const onSubmit = onSubmitRef.current;
    if (onSubmit && response) {
      let source = sourceFromProps;
      if (!source) {
        const profile = medplum.getProfile();
        if (profile) {
          source = createReference(profile);
        }
      }
      onSubmit({
        ...response,
        questionnaire: getReferenceString(questionnaire as Questionnaire),
        subject,
        source,
        authored: new Date().toISOString(),
        status: 'completed',
      });
    }
  }, [medplum, questionnaire, response, subject, sourceFromProps]);

  function checkForQuestionEnabled(item: QuestionnaireItem): boolean {
    return isQuestionEnabled(item, response);
  }

  if (!questionnaire || !response) {
    return null;
  }

  const numberOfPages = getNumberOfPages(questionnaire);
  const nextStep = (): void => setActivePage((current) => current + 1);
  const prevStep = (): void => setActivePage((current) => current - 1);

  return (
    <QuestionnaireFormContext.Provider value={{ subject: props.subject, encounter: props.encounter }}>
      <Form testid="questionnaire-form" onSubmit={handleSubmit}>
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

function getQuestionnaireIdentity(questionnaire: Questionnaire | undefined): Questionnaire | string | undefined {
  return questionnaire?.id || questionnaire;
}
