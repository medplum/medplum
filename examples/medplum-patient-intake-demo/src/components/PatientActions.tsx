// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Stack, Title } from '@mantine/core';
import { getReferenceString } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconEye } from '@tabler/icons-react';
import { JSX, useContext } from 'react';
import { useNavigate } from 'react-router';
import { IntakeQuestionnaireContext } from '../Questionnaire.context';

interface PatientActionsProps {
  patient: Patient;
  onChange: (patient: Patient) => void;
}

export function PatientActions(props: PatientActionsProps): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();

  const { questionnaire } = useContext(IntakeQuestionnaireContext);
  const questionnaireResponse = questionnaire
    ? medplum
        .searchOne('QuestionnaireResponse', {
          subject: getReferenceString(props.patient),
          questionnaire: questionnaire.url,
        })
        .read()
    : null;

  function handleViewIntakeForm(): void {
    navigate(`/Patient/${props.patient.id}/intake/${questionnaireResponse?.id}`)?.catch(console.error);
  }

  return (
    <Stack p="xs" m="xs">
      <Title>Patient Actions</Title>

      <Button leftSection={<IconEye size={16} />} onClick={handleViewIntakeForm} disabled={!questionnaireResponse}>
        View Intake Form
      </Button>
    </Stack>
  );
}
