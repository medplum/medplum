import { createReference, normalizeErrorString } from '@medplum/core';
import { QuestionnaireResponse } from '@medplum/fhirtypes';
import { Document, QuestionnaireForm, useMedplum, useMedplumProfile } from '@medplum/react';
import { useContext, useCallback } from 'react';
import { showNotification } from '@mantine/notifications';
import { Loading } from '../components/Loading';
import { useNavigate } from 'react-router-dom';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { IntakeQuestionnaireContext } from '../Questionnaire.context';

export function IntakeFormPage(): JSX.Element {
  const navigate = useNavigate();
  const medplum = useMedplum();
  const profile = useMedplumProfile();

  const { questionnaire } = useContext(IntakeQuestionnaireContext);

  const handleOnSubmit = useCallback(
    (response: QuestionnaireResponse) => {
      if (!questionnaire || !profile) {
        return;
      }

      medplum
        .createResource<QuestionnaireResponse>({
          ...response,
          author: createReference(profile),
        })
        .then(() => {
          showNotification({
            icon: <IconCircleCheck />,
            title: 'Success',
            message: 'Answers recorded',
          });
          navigate(`/Patient`);
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
    [medplum, navigate, questionnaire, profile]
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
