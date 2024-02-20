import { Button, Modal } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { getQuestionnaireAnswers, getReferenceString, normalizeErrorString, parseReference } from '@medplum/core';
import {
  Coding,
  Coverage,
  CoverageEligibilityRequest,
  Organization,
  Patient,
  Questionnaire,
  QuestionnaireResponse,
} from '@medplum/fhirtypes';
import { QuestionnaireForm, useMedplum } from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { useEffect, useState } from 'react';

interface InitiateEligibilityRequestProps {
  readonly coverage: Coverage;
}

export function InitiateEligibilityRequest({ coverage }: InitiateEligibilityRequestProps): JSX.Element {
  const medplum = useMedplum();
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

    fetchEligibilityDetails();
  });

  const onQuestionnaireSubmit = (formData: QuestionnaireResponse): void => {
    const answers = getQuestionnaireAnswers(formData);
    const startDate = answers.start.valueDate;
    const endDate = answers.end.valueDate;
    const serviceType = answers['service-type'].valueCoding;

    if (!startDate || !endDate || !serviceType) {
      throw new Error('Please make sure you have selected valid answers for all questions');
    }
    createEligibilityRequest(startDate, endDate, serviceType);
    close();
  };

  const createEligibilityRequest = async (start: string, end: string, serviceType: Coding) => {
    if (!patient || !insurer) {
      throw new Error('Invalid data');
    }
    const eligibilityRequest: CoverageEligibilityRequest = {
      resourceType: 'CoverageEligibilityRequest',
      status: 'active',
      purpose: ['discovery'],
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
    };

    try {
      await medplum.createResource(eligibilityRequest);
      notifications.show({
        icon: <IconCircleCheck />,
        title: 'Success',
        message: 'Coverage Eligibility Request Created',
      });
    } catch (error) {
      console.log(normalizeErrorString(error));
      notifications.show({
        color: 'red',
        icon: <IconCircleOff />,
        title: 'Error',
        message: normalizeErrorString(error),
      });
    }
  };

  return (
    <div>
      <Button fullWidth onClick={toggle}>
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
      linkId: 'start',
      text: 'When will the requested procedure or service begin?',
      type: 'date',
      required: true,
    },
    {
      linkId: 'end',
      text: 'When will the requested procedure or service end?',
      type: 'date',
      required: true,
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
