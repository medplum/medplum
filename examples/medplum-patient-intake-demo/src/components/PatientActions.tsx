import { Button, Stack, Title } from '@mantine/core';
import { getReferenceString } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { IntakeQuestionnaireContext } from '../Questionnaire.context';
import { IconEye } from '@tabler/icons-react';

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
          questionnaire: getReferenceString(questionnaire),
        })
        .read()
    : null;

  function handleViewIntakeForm(): void {
    navigate(`/Patient/${props.patient.id}/intake/${questionnaireResponse?.id}`);
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
