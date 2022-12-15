import { Anchor, Text, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { createReference, getReferenceString, normalizeErrorString } from '@medplum/core';
import { ClientApplication, Patient, Reference, Resource, SmartAppLaunch } from '@medplum/fhirtypes';
import { Document, MedplumLink, useMedplum } from '@medplum/react';
import React from 'react';

export interface AppsPageProps {
  resource: Resource;
}

export function AppsPage(props: AppsPageProps): JSX.Element {
  const medplum = useMedplum();
  const questionnaires = medplum.searchResources('Questionnaire', 'subject-type=' + props.resource.resourceType).read();
  const clientApplications =
    isSmartLaunchType(props.resource) &&
    medplum
      .searchResources('ClientApplication')
      .read()
      .filter((c) => c?.launchUri);

  if (questionnaires.length === 0 && (!clientApplications || clientApplications.length === 0)) {
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

  function launchApp(clientApplication: ClientApplication): void {
    const smartAppLaunch: SmartAppLaunch = {
      resourceType: 'SmartAppLaunch',
    };

    switch (props.resource.resourceType) {
      case 'Patient':
        smartAppLaunch.patient = createReference(props.resource);
        break;
      case 'Encounter':
        smartAppLaunch.patient = props.resource.subject as Reference<Patient>;
        smartAppLaunch.encounter = createReference(props.resource);
        break;
    }

    medplum
      .createResource(smartAppLaunch)
      .then((result) => {
        const url = new URL(clientApplication.launchUri as string);
        url.searchParams.set('iss', medplum.getBaseUrl() + 'fhir/R4');
        url.searchParams.set('launch', result.id as string);
        window.location.assign(url.toString());
      })
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
  }

  return (
    <Document>
      {questionnaires.map((questionnaire) => (
        <div key={questionnaire.id}>
          <Title order={3}>
            <MedplumLink to={`/forms/${questionnaire?.id}?subject=${getReferenceString(props.resource)}`}>
              {questionnaire.title || questionnaire.name}
            </MedplumLink>
          </Title>
          <Text>{questionnaire?.description}</Text>
        </div>
      ))}
      {clientApplications &&
        clientApplications.map((clientApplication) => (
          <div key={clientApplication.id}>
            <Title order={3}>
              <Anchor onClick={() => launchApp(clientApplication)}>{clientApplication.name}</Anchor>
            </Title>
            <Text>{clientApplication.description}</Text>
          </div>
        ))}
    </Document>
  );
}

function isSmartLaunchType(resource: Resource): boolean {
  return resource.resourceType === 'Patient' || resource.resourceType === 'Encounter';
}
