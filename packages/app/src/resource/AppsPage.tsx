import { Anchor, Text, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { createReference, getReferenceString, normalizeErrorString } from '@medplum/core';
import { ClientApplication, Patient, Reference, ResourceType, SmartAppLaunch } from '@medplum/fhirtypes';
import { Document, Loading, MedplumLink, useMedplum, useResource, useSearchResources } from '@medplum/react';
import { useParams } from 'react-router-dom';

export function AppsPage(): JSX.Element | null {
  const medplum = useMedplum();
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
      default:
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
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }));
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
