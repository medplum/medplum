import { Paper } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { getQuestionnaireAnswers, normalizeErrorString, PatchOperation } from '@medplum/core';
import {
  Coding,
  CoverageEligibilityRequest,
  CoverageEligibilityResponse,
  Questionnaire,
  QuestionnaireResponse,
  Resource,
} from '@medplum/fhirtypes';
import { QuestionnaireForm, useMedplum } from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';

interface UpdateCoverageEligibilityStatus {
  readonly coverageEligibility: CoverageEligibilityRequest | CoverageEligibilityResponse;
  readonly onChange: (resource: Resource) => void;
  readonly close: () => void;
}

export function UpdateCoverageEligibilityStatus(props: UpdateCoverageEligibilityStatus): JSX.Element {
  const medplum = useMedplum();

  const onQuestionnaireSubmit = (formData: QuestionnaireResponse): void => {
    const status = getQuestionnaireAnswers(formData)['new-status'].valueCoding;
    if (!status) {
      throw new Error('Please select a valid status');
    }

    handleStatusUpdate(props.coverageEligibility, status);
    props.close();
  };

  const handleStatusUpdate = async (
    coverageEligibility: CoverageEligibilityRequest | CoverageEligibilityResponse,
    status: Coding
  ) => {
    const coverageEligibilityId = coverageEligibility.id as string;

    const ops: PatchOperation[] = [
      { op: 'test', path: '/meta/versionId', value: coverageEligibility.meta?.versionId },
      { op: 'replace', path: '/status', value: status.code },
    ];

    try {
      const result = await medplum.patchResource(coverageEligibility.resourceType, coverageEligibilityId, ops);
      notifications.show({
        icon: <IconCircleCheck />,
        title: 'Success',
        message: 'Status updated',
      });
      props.onChange(result);
    } catch (error) {
      notifications.show({
        color: 'red',
        icon: <IconCircleOff />,
        title: 'Error',
        message: normalizeErrorString(error),
      });
    }
  };

  return (
    <Paper>
      <QuestionnaireForm questionnaire={updateStatusQuestionnaire} onSubmit={onQuestionnaireSubmit} />
    </Paper>
  );
}

const updateStatusQuestionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  status: 'active',
  id: 'update-status',
  title: 'Update Status',
  item: [
    {
      linkId: 'new-status',
      text: 'Update Status',
      type: 'choice',
      answerValueSet: 'http://hl7.org/fhir/ValueSet/fm-status',
      required: true,
    },
  ],
};
