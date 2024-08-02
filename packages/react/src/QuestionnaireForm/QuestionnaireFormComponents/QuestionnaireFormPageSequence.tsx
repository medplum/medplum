import { Button, Group, Stack, Stepper } from '@mantine/core';
import { QuestionnaireItem, QuestionnaireResponse, QuestionnaireResponseItem } from '@medplum/fhirtypes';
import { QuestionnaireItemType } from '../../utils/questionnaire';
import { QuestionnaireRepeatableItem } from '../QuestionnaireFormItem/QuestionnaireRepeatableItem';
import { QuestionnaireRepeatedGroup } from './QuestionnaireFormGroup';

interface QuestionnairePageSequenceProps {
  readonly items: QuestionnaireItem[];
  readonly response?: QuestionnaireResponse;
  readonly renderPages: boolean;
  readonly activePage?: number;
  readonly numberOfPages: number;
  readonly excludeButtons?: boolean;
  readonly submitButtonText?: string;
  readonly checkForQuestionEnabled: (item: QuestionnaireItem) => boolean;
  readonly onChange: (items: QuestionnaireResponseItem | QuestionnaireResponseItem[]) => void;
  readonly nextStep: () => void;
  readonly prevStep: () => void;
}

export function QuestionnairePageSequence(props: QuestionnairePageSequenceProps): JSX.Element {
  const {
    items,
    response,
    activePage,
    onChange,
    nextStep,
    prevStep,
    numberOfPages,
    renderPages,
    submitButtonText,
    excludeButtons,
    checkForQuestionEnabled,
  } = props;

  const form = items.map((item) => {
    const itemResponse = response?.item?.filter((i) => i.linkId === item.linkId) ?? [];

    const repeatedItem =
      item.type === QuestionnaireItemType.group ? (
        <QuestionnaireRepeatedGroup
          key={item.linkId}
          item={item}
          response={itemResponse}
          onChange={onChange}
          checkForQuestionEnabled={checkForQuestionEnabled}
        />
      ) : (
        <QuestionnaireRepeatableItem
          key={item.linkId}
          item={item}
          response={itemResponse?.[0]}
          onChange={onChange}
          checkForQuestionEnabled={checkForQuestionEnabled}
        />
      );

    if (renderPages) {
      return (
        <Stepper.Step key={item.linkId} label={item.text}>
          {repeatedItem}
        </Stepper.Step>
      );
    }
    return repeatedItem;
  });

  return (
    <>
      {renderPages && (
        <Stepper active={activePage ?? 0} allowNextStepsSelect={false} p={6}>
          {form}
        </Stepper>
      )}
      {!renderPages && <Stack>{form}</Stack>}
      {!excludeButtons && (
        <ButtonGroup
          activePage={activePage ?? 0}
          numberOfPages={numberOfPages}
          nextStep={renderPages ? nextStep : undefined}
          prevStep={renderPages ? prevStep : undefined}
          renderPages={renderPages}
          submitButtonText={submitButtonText}
        />
      )}
    </>
  );
}

interface ButtonGroupProps {
  readonly activePage: number;
  readonly numberOfPages: number;
  readonly renderPages: boolean;
  readonly submitButtonText?: string;
  readonly nextStep?: () => void;
  readonly prevStep?: () => void;
}

function ButtonGroup(props: ButtonGroupProps): JSX.Element {
  const showBackButton = props.renderPages && props.activePage > 0;
  const showNextButton = props.renderPages && props.activePage < props.numberOfPages - 1;
  const showSubmitButton = !props.renderPages || props.activePage === props.numberOfPages - 1;

  return (
    <Group justify="flex-end" mt="xl" gap="xs">
      {showBackButton && <Button onClick={props.prevStep}>Back</Button>}
      {showNextButton && (
        <Button
          onClick={(e) => {
            const form = e.currentTarget.closest('form') as HTMLFormElement;
            if (props.nextStep && form.reportValidity()) {
              props.nextStep();
            }
          }}
        >
          Next
        </Button>
      )}
      {showSubmitButton && <Button type="submit">{props.submitButtonText ?? 'Submit'}</Button>}
    </Group>
  );
}
