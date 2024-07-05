import { createReference, normalizeErrorString } from '@medplum/core';
import { Patient, Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import {
  Document,
  QuestionnaireBuilder,
  QuestionnaireForm,
  useMedplum,
  useMedplumProfile,
  useResource,
} from '@medplum/react';
import { useCallback } from 'react';
import { showNotification } from '@mantine/notifications';
import { Loading } from '../components/Loading';
import { useParams, useNavigate } from 'react-router-dom';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';

export function QuestionnaireCustomizationPage(): JSX.Element {
  const navigate = useNavigate();
  const medplum = useMedplum();
  const profile = useMedplumProfile();

  const questionnaireId = 'd613c8ed-222e-4f74-a220-e170a37d34d8';
  const questionnaire = useResource<Questionnaire>({ reference: `Questionnaire/${questionnaireId}` });

  const handleOnSubmit = useCallback(
    (response: Questionnaire) => {
      if (!questionnaire || !profile) {
        return;
      }

      medplum
        .updateResource<Questionnaire>({
          ...response,
          version: new Date().toISOString(),
        })
        .then(() => {
          showNotification({
            icon: <IconCircleCheck />,
            title: 'Success',
            message: 'Answers recorded',
          });
          navigate(`/`);
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
      <QuestionnaireBuilder questionnaire={questionnaire} onSubmit={handleOnSubmit} />
    </Document>
  );
}
