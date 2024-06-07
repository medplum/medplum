import { Button, Modal } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { getQuestionnaireAnswers, getReferenceString, normalizeErrorString } from '@medplum/core';
import { Coding, CoverageEligibilityRequest, Questionnaire, QuestionnaireResponse, Resource } from '@medplum/fhirtypes';
import { QuestionnaireForm, useMedplum } from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';

interface UpdateCoverageEligibilityStatus {
  readonly coverageEligibility: CoverageEligibilityRequest;
  readonly onChange: (resource: Resource) => void;
}

export function UpdateCoverageEligibilityStatus(props: UpdateCoverageEligibilityStatus): JSX.Element {
  const medplum = useMedplum();
  const [opened, handlers] = useDisclosure(false);
  const eligibilityCheckDate = props.coverageEligibility.created;
  const patient = props.coverageEligibility.patient;

  const onQuestionnaireSubmit = (formData: QuestionnaireResponse): void => {
    // Get the status selected from the questionnaire
    const status = getQuestionnaireAnswers(formData)['new-status'].valueCoding;
    if (!status) {
      throw new Error('Please select a valid status');
    }

    handleStatusUpdate(props.coverageEligibility, status).catch((error) => console.error(error));
    handlers.close();
  };

  const handleStatusUpdate = async (coverageEligibility: CoverageEligibilityRequest, status: Coding): Promise<void> => {
    const statusCode = status.code as CoverageEligibilityRequest['status'];

    // We use an upsert operation here to ensure that the eligibility request gets updated, or if it does not exist, it will be created.
    const updatedCoverageEligibility: CoverageEligibilityRequest = {
      ...coverageEligibility,
      status: statusCode,
    };

    // Update the resource on the server using a patch request. See https://www.medplum.com/docs/sdk/core.medplumclient.patchresource
    try {
      const result = await medplum.upsertResource(
        updatedCoverageEligibility,
        `CoverageEligibilityRequest?created=${eligibilityCheckDate}&patient=${getReferenceString(patient)}`
      );
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
