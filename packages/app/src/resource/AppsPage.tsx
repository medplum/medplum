import { Text, Title } from '@mantine/core';
import { createReference, getReferenceString } from '@medplum/core';
import { Encounter, Patient, Reference, ResourceType } from '@medplum/fhirtypes';
import { Document, Loading, MedplumLink, SmartAppLaunchLink, useResource, useSearchResources } from '@medplum/react';
import { useParams } from 'react-router-dom';

export function AppsPage(): JSX.Element | null {
  const { resourceType, id } = useParams() as { resourceType: ResourceType; id: string };
  const resource = useResource({ reference: resourceType + '/' + id });
  const [questionnaires, questionnairesLoading] = useSearchResources('Questionnaire', 'subject-type=' + resourceType);
  const [clientApps, clientAppsLoading] = useSearchResources('ClientApplication', { _count: 1000 });

  if (!resource || questionnairesLoading || clientAppsLoading) {
    return <Loading />;
  }

  const smartApps = clientApps?.filter((c) => isSmartLaunchType(resourceType) && !!c.launchUri);
  if ((!questionnaires || questionnaires.length === 0) && (!smartApps || smartApps.length === 0)) {
    return (
      <Document>
        <Title>Apps</Title>
        <p>
          No apps found. Contact your administrator or <a href="mailto:support@medplum.com">Medplum Support</a> to add
          automation here.
        </p>
      </Document>
    );
  }

  let patient: Reference<Patient> | undefined = undefined;
  let encounter: Reference<Encounter> | undefined = undefined;

  if (resource.resourceType === 'Patient') {
    patient = createReference(resource);
  } else if (resource.resourceType === 'Encounter') {
    patient = resource.subject as Reference<Patient>;
    encounter = createReference(resource);
  }

  return (
    <Document>
      {questionnaires?.map((questionnaire) => (
        <div key={questionnaire.id}>
          <Title order={3}>
            <MedplumLink to={`/forms/${questionnaire.id}?subject=${getReferenceString(resource)}`}>
              {questionnaire.title || questionnaire.name}
            </MedplumLink>
          </Title>
          <Text>{questionnaire.description}</Text>
        </div>
      ))}
      {smartApps?.map((clientApplication) => (
        <div key={clientApplication.id}>
          <Title order={3}>
            <SmartAppLaunchLink client={clientApplication} patient={patient} encounter={encounter}>
              {clientApplication.name}
            </SmartAppLaunchLink>
          </Title>
          <Text>{clientApplication.description}</Text>
        </div>
      ))}
    </Document>
  );
}

function isSmartLaunchType(resourceType: ResourceType): boolean {
  return resourceType === 'Patient' || resourceType === 'Encounter';
}
