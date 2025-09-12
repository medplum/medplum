// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Anchor, Badge, List, Stack, Text, Title } from '@mantine/core';
import { Practitioner } from '@medplum/fhirtypes';
import { Document, useMedplumProfile } from '@medplum/react';
import { JSX } from 'react';
import { Link } from 'react-router';
import { useAdminStatus } from '../utils/admin';

/**
 * Landing page component for the MSO demo.
 * Displays a welcome message and instructions for the user based on their role.
 *
 * @returns The landing page component
 */
export function LandingPage(): JSX.Element {
  const profile = useMedplumProfile() as Practitioner;
  const { isAdmin, loading } = useAdminStatus();

  return (
    <Document>
      <Stack align="center">
        <Title order={2}>
          Welcome {profile?.name?.[0]?.given?.[0]} {profile?.name?.[0]?.family}!
        </Title>

        {!loading && profile && (
          <Badge color={isAdmin ? 'purple' : 'blue'} size="lg">
            {isAdmin ? 'Admin User' : 'Clinician User'}
          </Badge>
        )}

        <Text>
          This Managed Service Organization (MSO) example demonstrates how to manage tenants with shared resources
          across multiple HealthcareService resources. It is recommended to create a new medplum project to use with this
          demo app.
        </Text>

        {isAdmin && (
          <Stack>
            <Text>
              As an admin user, you can create new healthcare services, create new clinicians, and manage the enrolled patients and
              clinicians across different healthcare services.
            </Text>
            <List type="ordered">
              <List.Item>
                <Anchor component={Link} to="/admin/access-policy">
                  Upload the default AccessPolicy list
                </Anchor>
              </List.Item>
              <List.Item>
                <Anchor component={Link} to="/admin/upload-bundle">
                  Upload example resources
                </Anchor>
              </List.Item>
              <List.Item>
                <Anchor component={Link} to="/HealthcareService/new">
                  Create Healthcare Services
                </Anchor>
              </List.Item>
              <List.Item>
                <Anchor component={Link} to="/Practitioner/new">
                  Create Clinicians and assign them to one or more Healthcare Services (note: keep track of email and password)
                </Anchor>
              </List.Item>
              <List.Item>
                <Anchor component={Link} to="/HealthcareService">
                  Manage Healthcare Services by enrolling or unenrolling Patients and Clinicians
                </Anchor>
              </List.Item>
              <List.Item>
                Test the setup:
                <List withPadding listStyleType="disc">
                  <List.Item>Log out from admin account</List.Item>
                  <List.Item>Login as one of the Clinicians</List.Item>
                  <List.Item>Verify you only see resources affiliated with Patients in your healthcare services</List.Item>
                </List>
              </List.Item>
            </List>
          </Stack>
        )}

        {!isAdmin && (
          <Stack>
            <Text>
              When logged in as a clinician user, your access will permit you to view all resources affiliated with any
              of your assigned healthcare services. Here are some examples:
            </Text>
            <List type="ordered">
              <List.Item>
                <Anchor component={Link} to="/Patient">
                  Patients
                </Anchor>
              </List.Item>
              <List.Item>
                <Anchor component={Link} to="/Observation">
                  Observations
                </Anchor>
              </List.Item>
              <List.Item>
                <Anchor component={Link} to="/DiagnosticReport">
                  Diagnostic Reports
                </Anchor>
              </List.Item>
              <List.Item>
                <Anchor component={Link} to="/Encounter">
                  Encounters
                </Anchor>
              </List.Item>
              <List.Item>
                <Anchor component={Link} to="/Communication">
                  Communications
                </Anchor>
              </List.Item>
            </List>
          </Stack>
        )}
      </Stack>
    </Document>
  );
}
