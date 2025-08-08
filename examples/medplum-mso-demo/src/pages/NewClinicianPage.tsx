// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Button, MultiSelect, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import '@mantine/notifications/styles.css';
import { normalizeErrorString } from '@medplum/core';
import { AccessPolicy, Organization } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import { IconAlertCircle } from '@tabler/icons-react';
import { JSX, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAdminStatus } from '../utils/admin';

interface NewClinicianForm {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  organizations: string[];
}

/**
 * New clinician page component for the MSO demo.
 * Allows admins to create new clinicians and assign them to organizations.
 *
 * @returns The new clinician page component
 */
export function NewClinicianPage(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const [formData, setFormData] = useState<NewClinicianForm>({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    organizations: [],
  });
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(false);
  const { isAdmin, loading: adminLoading } = useAdminStatus();

  useEffect(() => {
    const fetchOrgs = async (): Promise<void> => {
      const orgs = await medplum.search('Organization', {});
      setOrganizations(orgs.entry?.map((e) => e.resource as Organization) ?? []);
    };

    fetchOrgs().catch((error) => {
      showNotification({
        title: 'Error',
        message: normalizeErrorString(error),
        color: 'red',
      });
    });
  }, [medplum]);

  const handleCreateClinician = async (): Promise<void> => {
    if (
      !formData.email ||
      !formData.password ||
      !formData.firstName ||
      !formData.lastName ||
      formData.organizations.length === 0
    ) {
      return;
    }

    setLoading(true);
    try {
      // First get the access policy
      const policySearch = await medplum.search('AccessPolicy', {
        name: 'Managed Service Organization Access Policy',
      });
      const policy = policySearch.entry?.[0]?.resource as AccessPolicy;

      if (!policy) {
        throw new Error('Access policy not found');
      }

      // Create the access array for each selected organization
      const access = formData.organizations.map((orgId) => ({
        policy: { reference: `AccessPolicy/${policy.id}` },
        parameter: [
          {
            name: 'organization',
            valueReference: { reference: `Organization/${orgId}` },
          },
        ],
      }));

      // Base access policy in case all organizations are removed from the clinician
      const accessPolicy = {
        reference: `AccessPolicy/${policy.id}`,
        display: policy.name,
      };

      // Create the practitioner with project invitation
      const result = await medplum.post('admin/projects/:projectId/invite', {
        resourceType: 'Practitioner',
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        password: formData.password,
        sendEmail: false,
        membership: {
          access,
          accessPolicy,
        },
        scope: 'project',
      });

      showNotification({
        title: 'Success',
        message: 'Clinician created successfully',
        color: 'green',
      });

      navigate(`/${result.profile?.reference}`)?.catch(console.error);
    } catch (error) {
      console.error('Error creating clinician:', normalizeErrorString(error));
      showNotification({
        title: 'Error',
        message: normalizeErrorString(error),
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  // If still checking admin status, show loading
  if (adminLoading) {
    return (
      <Document>
        <Title>Create New Clinician</Title>
        <Text>Loading...</Text>
      </Document>
    );
  }

  // If user is not an admin, show access denied message
  if (!isAdmin) {
    return (
      <Document>
        <Title>Create New Clinician</Title>
        <Alert icon={<IconAlertCircle size={16} />} title="Access Denied" color="red">
          You need to be an Admin to view this page. Please contact your system administrator for access.
        </Alert>
      </Document>
    );
  }

  return (
    <Document>
      <Title>Create New Clinician</Title>
      <Stack gap="lg" mt="lg">
        <TextInput
          label="First Name"
          placeholder="Enter first name"
          value={formData.firstName}
          onChange={(e) => setFormData((prev) => ({ ...prev, firstName: e.target.value }))}
          required
        />

        <TextInput
          label="Last Name"
          placeholder="Enter last name"
          value={formData.lastName}
          onChange={(e) => setFormData((prev) => ({ ...prev, lastName: e.target.value }))}
          required
        />

        <TextInput
          label="Email"
          type="email"
          placeholder="Enter email"
          value={formData.email}
          onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
          required
        />

        <PasswordInput
          label="Password"
          placeholder="Enter password"
          value={formData.password}
          onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
          required
        />

        <MultiSelect
          label="Clinics"
          placeholder="Select clinics"
          data={organizations.map((org) => ({
            value: org.id as string,
            label: org.name as string,
          }))}
          value={formData.organizations}
          onChange={(values) => setFormData((prev) => ({ ...prev, organizations: values }))}
        />

        <Button
          onClick={handleCreateClinician}
          loading={loading}
          disabled={
            !formData.email ||
            !formData.password ||
            !formData.firstName ||
            !formData.lastName ||
            formData.organizations.length === 0
          }
        >
          Create Clinician
        </Button>
      </Stack>
    </Document>
  );
}
