// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Anchor, Center, Code, List, Paper, Stack, Text, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { createReference, normalizeErrorString, normalizeOperationOutcome } from '@medplum/core';
import type { OperationOutcome, Patient, Resource, ResourceType } from '@medplum/fhirtypes';
import { Document, Loading, useMedplum } from '@medplum/react';
import { IconFileAlert } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ResourceFormWithRequiredProfile } from '../../components/ResourceFormWithRequiredProfile';
import { usePatient } from '../../hooks/usePatient';
import { prependPatientPath } from '../patient/PatientPage.utils';
import { RESOURCE_PROFILE_URLS } from './utils';

const PatientReferencesElements: Partial<Record<ResourceType, string[]>> = {
  Task: ['for'],
  MedicationRequest: ['subject'],
  ServiceRequest: ['subject'],
  Device: ['patient'],
  DiagnosticReport: ['subject'],
  DocumentReference: ['subject'],
  Appointment: ['participant.actor'],
  CarePlan: ['subject'],
};

function getDefaultValue(resourceType: ResourceType, patient: Patient | undefined): Partial<Resource> {
  const dv = { resourceType } as Partial<Resource>;
  const refKeys = PatientReferencesElements[resourceType];
  if (patient && refKeys) {
    for (const key of refKeys) {
      const keyParts = key.split('.');
      if (keyParts.length === 1) {
        (dv as any)[key] = createReference(patient);
      } else if (keyParts.length === 2) {
        const [first, second] = keyParts;
        (dv as any)[first] = [{ [second]: createReference(patient) }];
      } else {
        throw new Error('Can only process keys with one or two parts');
      }
    }
  }

  return dv;
}

function getResourceTypeFromPath(pathname: string): ResourceType | undefined {
  const pathParts = pathname.split('/');
  if (pathParts.length >= 3 && pathParts[2] === 'new') {
    return pathParts[1] as ResourceType;
  }

  return undefined;
}

export function ResourceCreatePage(): JSX.Element {
  const medplum = useMedplum();
  const [outcome, setOutcome] = useState<OperationOutcome | undefined>();
  const patient = usePatient({ ignoreMissingPatientId: true, setOutcome });
  const navigate = useNavigate();
  const params = useParams() as { patientId?: string; resourceType?: ResourceType };
  const resourceType = params.resourceType || getResourceTypeFromPath(location.pathname);
  const patientId = params.patientId;
  const [loadingPatient, setLoadingPatient] = useState(Boolean(patientId));
  const [defaultValue, setDefaultValue] = useState<Partial<Resource>>(() => {
    if (!resourceType) {
      return {};
    }
    return getDefaultValue(resourceType, patient);
  });
  const profileUrl = resourceType && RESOURCE_PROFILE_URLS[resourceType];

  useEffect(() => {
    if (patient && resourceType) {
      setDefaultValue(getDefaultValue(resourceType, patient));
    }
    setLoadingPatient(false);
  }, [patient, resourceType]);

  const handleSubmit = (newResource: Resource): void => {
    if (outcome) {
      setOutcome(undefined);
    }
    medplum
      .createResource(newResource)
      .then((result) => navigate(prependPatientPath(patient, '/' + result.resourceType + '/' + result.id)))
      .catch((err) => {
        if (setOutcome) {
          setOutcome(normalizeOperationOutcome(err));
        }
        showNotification({
          color: 'red',
          message: normalizeErrorString(err),
          autoClose: false,
          styles: { description: { whiteSpace: 'pre-line' } },
        });
      });
  };

  if (loadingPatient) {
    return <Loading />;
  }

  const missingProfileMessage = profileUrl && (
    <Center p="xl">
      <Paper shadow="md" p="xl" radius="md" withBorder maw={480}>
        <Stack align="center" gap="sm" ta="center">
          <IconFileAlert size={48} color="var(--mantine-color-gray-5)" />
          <Title order={3}>{resourceType} creation is unavailable</Title>
          {medplum.isProjectAdmin() ? (
            <>
              <Text size="sm" c="dimmed">
                Creating a {resourceType} requires a FHIR profile that is not installed in this project:
              </Text>
              <List spacing={4} size="sm" withPadding>
                <List.Item>
                  <Code>{profileUrl}</Code>
                </List.Item>
              </List>
              <Text size="sm" c="dimmed">
                Import the profile’s StructureDefinition (e.g. the US Core profiles) to enable it. See{' '}
                <Anchor href="https://www.medplum.com/docs/fhir-datastore/profiles" target="_blank" rel="noreferrer">
                  the profiles documentation
                </Anchor>
                .
              </Text>
            </>
          ) : (
            <Text size="sm" c="dimmed">
              {resourceType} creation is not set up yet. Contact your administrator to enable it.
            </Text>
          )}
        </Stack>
      </Paper>
    </Center>
  );

  return (
    <Document shadow="xs">
      <Stack>
        <Text fw={500}>New&nbsp;{resourceType}</Text>
        <ResourceFormWithRequiredProfile
          defaultValue={defaultValue}
          onSubmit={handleSubmit}
          outcome={outcome}
          profileUrl={profileUrl}
          missingProfileMessage={missingProfileMessage}
        />
      </Stack>
    </Document>
  );
}
