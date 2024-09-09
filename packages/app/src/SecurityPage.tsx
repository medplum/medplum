import { Anchor, Button, Table, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import {
  formatDateTime,
  formatHumanName,
  getReferenceString,
  normalizeErrorString,
  ProfileResource,
} from '@medplum/core';
import { HumanName, UserConfiguration } from '@medplum/fhirtypes';
import { DescriptionList, DescriptionListEntry, Document, useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface UserSession {
  readonly id: string;
  readonly lastUpdated: string;
  readonly authMethod: string;
  readonly remoteAddress: string;
  readonly browser?: string;
  readonly os?: string;
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
      .get('auth/me')
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
          <DescriptionListEntry term="Name">
            {formatHumanName(details.profile.name?.[0] as HumanName)}
          </DescriptionListEntry>
        </DescriptionList>
      </Document>
      <Document>
        <Title>Sessions</Title>
        <Table>
          <thead>
            <tr>
              <th>OS</th>
              <th>Browser</th>
              <th>IP Address</th>
              <th>Auth Method</th>
              <th>Last Updated</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {details.security.sessions.map((session) => (
              <tr key={session.id}>
                <td>{session.os}</td>
                <td>{session.browser}</td>
                <td>{session.remoteAddress}</td>
                <td>{session.authMethod}</td>
                <td>{formatDateTime(session.lastUpdated)}</td>
                <td>
                  <Anchor href="#" onClick={() => revokeLogin(session.id)}>
                    Revoke
                  </Anchor>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Document>
      <Document>
        <Title>Password</Title>
        <Button onClick={() => navigate('/changepassword')}>Change password</Button>
      </Document>
      <Document>
        <Title>Multi Factor Auth</Title>
        <p>Enrolled: {details.security.mfaEnrolled.toString()}</p>
        {!details.security.mfaEnrolled && <Button onClick={() => navigate('/mfa')}>Enroll</Button>}
      </Document>
    </>
  );
}
