import { createReference, normalizeErrorString } from '@medplum/core';
import { Patient, QuestionnaireResponse } from '@medplum/fhirtypes';
import { Document, QuestionnaireForm, useMedplum, useMedplumProfile, useResource } from '@medplum/react';
import { useContext, useCallback } from 'react';
import { showNotification } from '@mantine/notifications';
import { Loading } from '../components/Loading';
import { useParams, useNavigate } from 'react-router-dom';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { IntakeQuestionnaireContext } from '../Questionnaire.context';

export function IntakeFormPage(): JSX.Element {
  const navigate = useNavigate();
  const medplum = useMedplum();
  const profile = useMedplumProfile();

  const { patientId } = useParams();
  const patient = useResource<Patient>({ reference: `Patient/${patientId}` });
  const { questionnaire } = useContext(IntakeQuestionnaireContext);

  const handleOnSubmit = useCallback(
    (response: QuestionnaireResponse) => {
      if (!questionnaire || !patient || !profile) {
        return;
      }

      medplum
        .createResource<QuestionnaireResponse>({
          ...response,
          subject: createReference(patient),
          author: createReference(profile),
        })
        .then(() => {
          showNotification({
            icon: <IconCircleCheck />,
            title: 'Success',
            message: 'Answers recorded',
          });
          navigate(`/Patient/${patient.id}`);
          window.scrollTo(0, 0);
        })
        .catch((err) => {
          showNotification({
            color: 'red',
            icon: <IconCircleOff />,
            title: 'Error',
            message: normalizeErrorString(err),
          });
        });
    },
    [medplum, navigate, questionnaire, profile, patient]
  );

  if (!questionnaire) {
    return <Loading />;
  }

  return (
    <Document width={800}>
      <QuestionnaireForm questionnaire={questionnaire} onSubmit={handleOnSubmit} />
    </Document>
  );
}
