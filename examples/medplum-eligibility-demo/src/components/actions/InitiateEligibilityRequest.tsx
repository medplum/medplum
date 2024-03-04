import { Button, Modal } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { getQuestionnaireAnswers, getReferenceString, normalizeErrorString, parseReference } from '@medplum/core';
import {
  Coding,
  Coverage,
  CoverageEligibilityRequest,
  Organization,
  Patient,
  Practitioner,
  Questionnaire,
  QuestionnaireResponse,
} from '@medplum/fhirtypes';
import { QuestionnaireForm, useMedplum, useMedplumProfile } from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { useEffect, useState } from 'react';

interface InitiateEligibilityRequestProps {
  readonly coverage: Coverage;
}

export function InitiateEligibilityRequest({ coverage }: InitiateEligibilityRequestProps): JSX.Element {
  const medplum = useMedplum();
  const profile = useMedplumProfile() as Practitioner;
  const [opened, { toggle, close }] = useDisclosure(false);
  const [patient, setPatient] = useState<Patient | undefined>();
  const [insurer, setInsurer] = useState<Organization | undefined>();

  useEffect(() => {
    const fetchEligibilityDetails = async (): Promise<void> => {
      const parsedPatientReference = parseReference(coverage.beneficiary);
      const parsedInsurerReference = parseReference(coverage.payor[0]);

      const patientData = (await medplum.readResource(parsedPatientReference[0], parsedPatientReference[1])) as Patient;
      const insurerData = (await medplum.readResource(
        parsedInsurerReference[0],
        parsedInsurerReference[1]
      )) as Organization;

      setPatient(patientData);
      setInsurer(insurerData);
    };

    fetchEligibilityDetails().catch((error) => console.error(error));
  });

  const onQuestionnaireSubmit = (formData: QuestionnaireResponse): void => {
    const answers = getQuestionnaireAnswers(formData);
    const startDate = answers.start.valueDate;
    const endDate = answers.end.valueDate;
    const serviceType = answers['service-type'].valueCoding;

    if (!startDate || !endDate || !serviceType) {
      throw new Error('Please make sure you have selected valid answers for all questions');
    }
    createEligibilityRequest(startDate, endDate, serviceType).catch((error) => console.error(error));
    close();
  };

  const createEligibilityRequest = async (start: string, end: string, serviceType: Coding): Promise<void> => {
    if (!patient || !insurer) {
      throw new Error('Invalid data');
    }

    // Create a `CoverageEligibilityRequest`. For more details on eligibility checks see https://www.medplum.com/docs/billing/insurance-eligibility-checks
    const eligibilityRequest: CoverageEligibilityRequest = {
      resourceType: 'CoverageEligibilityRequest',
      status: 'active',
      purpose: ['benefits'],
      patient: {
        reference: getReferenceString(patient),
      },
      created: new Date().toISOString(),
      insurer: {
        reference: getReferenceString(insurer),
      },
      insurance: [
        {
          coverage: {
            reference: getReferenceString(coverage),
          },
        },
      ],
      item: [
        {
          category: {
            coding: [serviceType],
          },
        },
      ],
      servicedPeriod: {
        start,
        end,
      },
      enterer: {
        reference: getReferenceString(profile),
      },
    };

    try {
      await medplum.createResource(eligibilityRequest);
      showNotification({
        icon: <IconCircleCheck />,
        title: 'Success',
        message: 'Coverage Eligibility Request Created',
      });
    } catch (error) {
      console.log(normalizeErrorString(error));
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
      <Button p="0" fullWidth onClick={toggle}>
        Initiate Eligibility Request
      </Button>
      <Modal opened={opened} onClose={close}>
        <QuestionnaireForm questionnaire={initiateEligibilityRequestQuestionnaire} onSubmit={onQuestionnaireSubmit} />
      </Modal>
    </div>
  );
}

const initiateEligibilityRequestQuestionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  status: 'active',
  id: 'initiate-eligibility-request',
  title: 'Eligibility Request',
  item: [
    {
      linkId: 'date',
      type: 'group',
      item: [
        {
          linkId: 'start',
          text: 'Starting date of service',
          type: 'date',
          required: true,
        },
        {
          linkId: 'end',
          text: 'Ending date of service',
          type: 'date',
          required: true,
        },
      ],
    },
    {
      linkId: 'service-type',
      text: 'What type of service is being provided?',
      type: 'choice',
      answerValueSet: 'https://example.org/x12-service-type-codes',
      required: true,
    },
  ],
};
