// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Anchor, Button, Table, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import type { ProfileResource } from '@medplum/core';
import { formatDateTime, formatHumanName, getReferenceString, normalizeErrorString } from '@medplum/core';
import type { Reference, UserConfiguration } from '@medplum/fhirtypes';
import { DescriptionList, DescriptionListEntry, Document, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';

interface UserSession {
  readonly id: string;
  readonly lastUpdated: string;
  readonly authMethod: string;
  readonly remoteAddress: string;
  readonly browser?: string;
  readonly os?: string;
  readonly project?: Reference;
}

interface SecurityDetails {
  readonly profile: ProfileResource;
  readonly config: UserConfiguration;
  readonly security: {
    mfaEnrolled: boolean;
    sessions: UserSession[];
  };
}

export function SecurityPage(): JSX.Element | null {
  const navigate = useNavigate();
  const medplum = useMedplum();
  const [details, setDetails] = useState<SecurityDetails | undefined>();

  useEffect(() => {
    medplum
      .get('auth/me', { cache: 'no-cache' })
      .then(setDetails)
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }));
  }, [medplum]);

  function revokeLogin(loginId: string): void {
    medplum
      .post('auth/revoke', { loginId })
      .then(() => medplum.get('auth/me', { cache: 'no-cache' }))
      .then(setDetails)
      .then(() => showNotification({ color: 'green', message: 'Login revoked' }))
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }));
  }

  if (!details) {
    return null;
  }

  return (
    <>
      <Document>
        <Title>Security</Title>
        <DescriptionList>
          <DescriptionListEntry term="ID">
            <Anchor href={`/${getReferenceString(details.profile)}`}>{details.profile.id}</Anchor>
          </DescriptionListEntry>
          <DescriptionListEntry term="Resource Type">{details.profile.resourceType}</DescriptionListEntry>
          <DescriptionListEntry term="Name">{formatHumanName(details.profile.name?.[0])}</DescriptionListEntry>
        </DescriptionList>
      </Document>
      <Document>
        <Title>Sessions</Title>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Project</Table.Th>
              <Table.Th>OS</Table.Th>
              <Table.Th>Browser</Table.Th>
              <Table.Th>IP Address</Table.Th>
              <Table.Th>Auth Method</Table.Th>
              <Table.Th>Last Updated</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {details.security.sessions.map((session) => (
              <Table.Tr key={session.id}>
                <Table.Td>{session.project?.display ?? 'Unknown'}</Table.Td>
                <Table.Td>{session.os}</Table.Td>
                <Table.Td>{session.browser}</Table.Td>
                <Table.Td>{session.remoteAddress}</Table.Td>
                <Table.Td>{session.authMethod}</Table.Td>
                <Table.Td>{formatDateTime(session.lastUpdated)}</Table.Td>
                <Table.Td>
                  <Anchor href="#" onClick={() => revokeLogin(session.id)}>
                    Revoke
                  </Anchor>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Document>
      <Document>
        <Title>Password</Title>
        <Button onClick={() => navigate('/changepassword')?.catch(console.error)}>Change password</Button>
      </Document>
      <Document>
        <Title>Multi Factor Auth</Title>
        <p>Enrolled: {details.security.mfaEnrolled.toString()}</p>
        <Button onClick={() => navigate('/mfa')?.catch(console.error)}>
          {details.security.mfaEnrolled ? 'Manage MFA' : 'Enroll'}
        </Button>
      </Document>
    </>
  );
}
