import { getReferenceString } from '@medplum/core';
import { Resource } from '@medplum/fhirtypes';
import { Document, MedplumLink, useMedplum } from '@medplum/react';
import React from 'react';

export interface AppsPageProps {
  resource: Resource;
}

export function AppsPage(props: AppsPageProps): JSX.Element {
  const medplum = useMedplum();
  const questionnaires = medplum.searchResources('Questionnaire', 'subject-type=' + props.resource.resourceType).read();

  if (questionnaires.length === 0) {
    return (
      <Document>
        <h1>Apps</h1>
        <p>
          No apps found. Contact your administrator or <a href="mailto:support@medplum.com">Medplum Support</a> to add
          automation here.
        </p>
      </Document>
    );
  }

  return (
    <Document>
      {questionnaires.map((questionnaire) => (
        <div key={questionnaire.id}>
          <h3>
            <MedplumLink to={`/forms/${questionnaire?.id}?subject=${getReferenceString(props.resource)}`}>
              {questionnaire.name}
            </MedplumLink>
          </h3>
          <p>{questionnaire?.description}</p>
        </div>
      ))}
    </Document>
  );
}
