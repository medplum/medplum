import { Title } from '@mantine/core';
import { Questionnaire } from '@medplum/fhirtypes';
import { Document, Loading, MedplumLink, useMedplum } from '@medplum/react';
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

export function BulkAppPage(): JSX.Element {
  const { resourceType } = useParams() as {
    resourceType: string;
    id: string;
  };
  const queryParams = Object.fromEntries(new URLSearchParams(location.search).entries()) as Record<string, string>;
  const ids = (queryParams.ids || '').split(',').filter((e) => !!e);
  const medplum = useMedplum();
  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>();

  useEffect(() => {
    medplum.searchResources('Questionnaire', `subject-type=${resourceType}`).then(setQuestionnaires).catch(console.log);
  }, [medplum, resourceType]);

  if (!questionnaires) {
    return <Loading />;
  }

  if (questionnaires.length === 0) {
    return (
      <Document>
        <Title>No apps for {resourceType}</Title>
        <MedplumLink to={`/${resourceType}`}>Return to search page</MedplumLink>
      </Document>
    );
  }

  return (
    <Document>
      <div>
        {questionnaires.map((questionnaire) => (
          <div key={questionnaire.id}>
            <h3>
              <MedplumLink
                to={`/forms/${questionnaire?.id}?subject=` + ids.map((id) => `${resourceType}/${id}`).join(',')}
              >
                {questionnaire.name}
              </MedplumLink>
            </h3>
            <p>{questionnaire?.description}</p>
          </div>
        ))}
      </div>
    </Document>
  );
}
