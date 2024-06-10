import { Button, Modal } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
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
  readonly coverageEligibility: CoverageEligibilityRequest;
  readonly onChange: (resource: Resource) => void;
}

export function UpdateCoverageEligibilityStatus(props: UpdateCoverageEligibilityStatus): JSX.Element {
  const medplum = useMedplum();
  const [opened, handlers] = useDisclosure(false);

  const onQuestionnaireSubmit = (formData: QuestionnaireResponse): void => {
    // Get the status selected from the questionnaire
    const status = getQuestionnaireAnswers(formData)['new-status'].valueCoding;
    if (!status) {
      throw new Error('Please select a valid status');
    }

    handleStatusUpdate(props.coverageEligibility, status).catch((error) => console.error(error));
    handlers.close();
  };

  const handleStatusUpdate = async (
    coverageEligibility: CoverageEligibilityRequest | CoverageEligibilityResponse,
    status: Coding
  ): Promise<void> => {
    const coverageEligibilityId = coverageEligibility.id as string;

    // We use a patch operation here to avoid race conditions. This ensures that if multiple users try to add a note simultaneously, only one will be successful.
    const ops: PatchOperation[] = [
      { op: 'test', path: '/meta/versionId', value: coverageEligibility.meta?.versionId },
      { op: 'replace', path: '/status', value: status.code },
    ];

    // Update the resource on the server using a patch request. See https://www.medplum.com/docs/sdk/core.medplumclient.patchresource
    try {
      const result = await medplum.patchResource(coverageEligibility.resourceType, coverageEligibilityId, ops);
      showNotification({
        icon: <IconCircleCheck />,
        title: 'Success',
        message: 'Status updated',
      });
      props.onChange(result);
    } catch (error) {
      showNotification({
        color: 'red',
        icon: <IconCircleOff />,
        title: 'Error',
        message: normalizeErrorString(error),
      });
    }
  };

  return (
    <div>
      <Button onClick={handlers.open}>Update Status</Button>
      <Modal opened={opened} onClose={handlers.close}>
        <QuestionnaireForm questionnaire={updateStatusQuestionnaire} onSubmit={onQuestionnaireSubmit} />
      </Modal>
    </div>
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
      // The choices are pulled from a FHIR ValueSet containing all allowed statuses.
      answerValueSet: 'http://hl7.org/fhir/ValueSet/fm-status',
      required: true,
    },
  ],
};
