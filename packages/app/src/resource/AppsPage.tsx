import { Anchor, Text, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { createReference, getReferenceString, normalizeErrorString } from '@medplum/core';
import { ClientApplication, Patient, Questionnaire, Reference, ResourceType, SmartAppLaunch } from '@medplum/fhirtypes';
import { Document, MedplumLink, useMedplum, useResource } from '@medplum/react';
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

export function AppsPage(): JSX.Element | null {
  const medplum = useMedplum();
  const { resourceType, id } = useParams() as { resourceType: ResourceType; id: string };
  const resource = useResource({ reference: resourceType + '/' + id });
  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>();
  const [clientApplications, setClientApplications] = useState<ClientApplication[]>();

  useEffect(() => {
    medplum
      .searchResources('Questionnaire', 'subject-type=' + resourceType)
      .then(setQuestionnaires)
      .catch(console.error);
    if (isSmartLaunchType(resourceType)) {
      medplum.searchResources('ClientApplication').then(setClientApplications).catch(console.error);
    }
  }, [medplum, resourceType]);

  if (!resource || !questionnaires) {
    return null;
  }

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
    if (!resource) {
      return;
    }

    const smartAppLaunch: SmartAppLaunch = {
      resourceType: 'SmartAppLaunch',
    };

    switch (resource.resourceType) {
      case 'Patient':
        smartAppLaunch.patient = createReference(resource);
        break;
      case 'Encounter':
        smartAppLaunch.patient = resource.subject as Reference<Patient>;
        smartAppLaunch.encounter = createReference(resource);
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
            <MedplumLink to={`/forms/${questionnaire?.id}?subject=${getReferenceString(resource)}`}>
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

function isSmartLaunchType(resourceType: ResourceType): boolean {
  return resourceType === 'Patient' || resourceType === 'Encounter';
}
