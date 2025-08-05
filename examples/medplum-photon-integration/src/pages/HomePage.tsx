// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Flex, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { getReferenceString, normalizeErrorString } from '@medplum/core';
import { Practitioner } from '@medplum/fhirtypes';
import {
  Document,
  ResourceName,
  SearchControl,
  useMedplum,
  useMedplumNavigate,
  useMedplumProfile,
} from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { JSX } from 'react';
import { Outlet } from 'react-router';
import { NEUTRON_HEALTH_BOTS } from '../bots/constants';

/**
 * Home page that greets the user and displays a list of patients.
 * @returns A React component that displays the home page.
 */
export function HomePage(): JSX.Element {
  // useMedplumProfile() returns the "profile resource" associated with the user.
  // This can be a Practitioner, Patient, or RelatedPerson depending on the user's role in the project.
  // See the "Register" tutorial for more detail
  // https://www.medplum.com/docs/tutorials/register
  const profile = useMedplumProfile() as Practitioner;
  const medplum = useMedplum();
  const [loading, { open, close }] = useDisclosure();

  const navigate = useMedplumNavigate();
  async function handleSyncPatientsFromPhoton(): Promise<void> {
    open();
    try {
      await medplum.executeBot(
        {
          system: NEUTRON_HEALTH_BOTS,
          value: 'sync-patient-from-photon',
        },
        {},
        'application/json'
      );

      notifications.show({
        icon: <IconCircleCheck />,
        title: 'Success',
        message: 'Patients synced',
      });
    } catch (err) {
      notifications.show({
        color: 'red',
        icon: <IconCircleOff />,
        title: 'Error',
        message: normalizeErrorString(err),
      });
      close();
    }
  }

  return (
    <Document>
      <Flex justify="space-between" mb="lg">
        <Title>
          Welcome <ResourceName value={profile} link />
        </Title>
        <Button onClick={handleSyncPatientsFromPhoton} loading={loading}>
          Sync Patients From Photon
        </Button>
      </Flex>
      <SearchControl
        search={{ resourceType: 'Patient', fields: ['name', 'birthdate', 'gender'] }}
        onClick={(e) => navigate(`/${getReferenceString(e.resource)}`)}
        hideToolbar
      />
      <Outlet />
    </Document>
  );
}
