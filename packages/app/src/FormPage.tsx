import { Questionnaire } from '@medplum/fhirtypes';
import { addQuestionnaireInitialValues, Document, Loading, QuestionnaireForm, useMedplum } from '@medplum/ui';
import React, { useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';

export function FormPage() {
  const { id } = useParams() as { id: string };
  const location = useLocation();
  const queryParams = Object.fromEntries(new URLSearchParams(location.search).entries()) as Record<string, string>;
  const medplum = useMedplum();
  const [loading, setLoading] = useState<boolean>(true);
  const [questionnaire, setQuestionnaire] = useState<Questionnaire | undefined>();
  const [error, setError] = useState();

  useEffect(() => {
    medplum
      .read('Questionnaire', id)
      .then((result) => setQuestionnaire(addQuestionnaireInitialValues(result as Questionnaire, queryParams)))
      .then(() => setLoading(false))
      .catch((reason) => {
        setError(reason);
        setLoading(false);
      });
  }, [id, location]);

  if (error) {
    return (
      <Document>
        <pre data-testid="error">{JSON.stringify(error, undefined, 2)}</pre>
      </Document>
    );
  }

  if (loading || !questionnaire) {
    return <Loading />;
  }

  return (
    <Document>
      <h1>{questionnaire.name}</h1>
      <QuestionnaireForm
        questionnaire={questionnaire}
        onSubmit={(formData) => {
          console.log('formData', formData);
        }}
      />
    </Document>
  );
}
