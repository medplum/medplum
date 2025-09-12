// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Tabs, Text, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import '@mantine/notifications/styles.css';
import { normalizeErrorString } from '@medplum/core';
import { HealthcareService } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import { IconAlertCircle } from '@tabler/icons-react';
import { JSX, useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { ClinicianList } from '../components/ClinicianList';
import { PatientList } from '../components/PatientList';
import { useAdminStatus } from '../utils/admin';

/**
 * A page component for managing a specific healthcare service and its members.
 * Provides interfaces for enrolling and managing patients and practitioners
 * associated with the healthcare service.
 *
 * @returns The healthcare service management page
 */
export function ManageClinicPage(): JSX.Element {
  const medplum = useMedplum();
  const { id } = useParams();
  const [healthcareService, setHealthcareService] = useState<HealthcareService>();
  const [activeTab, setActiveTab] = useState<string | null>('practitioners');
  const { isAdmin, loading: adminLoading } = useAdminStatus();

  useEffect(() => {
    const loadHealthcareService = async (): Promise<void> => {
      const service = await medplum.readResource('HealthcareService', id as string);
      setHealthcareService(service);
    };

    loadHealthcareService().catch((error) => {
      showNotification({
        title: 'Error',
        message: normalizeErrorString(error),
        color: 'red',
      });
    });
  }, [medplum, id]);

  // If still checking admin status, show loading
  if (adminLoading) {
    return (
      <Document>
        <Title>Manage Healthcare Service</Title>
        <Text>Loading...</Text>
      </Document>
    );
  }

  // If user is not an admin, show access denied message
  if (!isAdmin) {
    return (
      <Document>
        <Title>Manage Healthcare Service</Title>
        <Alert icon={<IconAlertCircle size={16} />} title="Access Denied" color="red">
          You need to be an Admin to view this page. Please contact your system administrator for access.
        </Alert>
      </Document>
    );
  }

  if (!healthcareService) {
    return (
      <Document>
        <Title>Loading...</Title>
      </Document>
    );
  }

  return (
    <Document>
      {healthcareService && (
        <>
          <Title>{healthcareService.name}</Title>

          <Tabs value={activeTab} onChange={setActiveTab}>
            <Tabs.List mb="md">
              <Tabs.Tab value="practitioners">Clinicians</Tabs.Tab>
              <Tabs.Tab value="patients">Patients</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="practitioners">
              <ClinicianList healthcareService={healthcareService} />
            </Tabs.Panel>

            <Tabs.Panel value="patients">
              <PatientList healthcareService={healthcareService} />
            </Tabs.Panel>
          </Tabs>
        </>
      )}
    </Document>
  );
}
