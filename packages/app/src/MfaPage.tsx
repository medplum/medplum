import { Button, Center, Group, TextInput, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import { Document, Form, useMedplum } from '@medplum/react';
import React, { useCallback, useEffect, useState } from 'react';

export function MfaPage(): JSX.Element | null {
  const medplum = useMedplum();
  const [qrCodeUrl, setQrCodeUrl] = useState<string | undefined>(undefined);
  const [enrolled, setEnrolled] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    medplum
      .get('auth/mfa/status')
      .then((response) => {
        const url = new URL('https://chart.googleapis.com/chart');
        url.searchParams.set('chs', '300x300');
        url.searchParams.set('cht', 'qr');
        url.searchParams.set('chl', response.enrollUri);
        url.searchParams.set('choe', 'UTF-8');
        setQrCodeUrl(url.toString());
        setEnrolled(response.enrolled);
      })
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
  }, [medplum]);

  const enableMfa = useCallback(
    (formData: Record<string, string>) => {
      medplum
        .post('auth/mfa/enroll', formData)
        .then(() => {
          setEnrolled(true);
          showNotification({ color: 'green', message: 'Success' });
        })
        .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
    },
    [medplum]
  );

  const disableMfa = useCallback(() => {
    medplum.post('auth/mfa/disable', {}).catch(console.log);
  }, [medplum]);

  if (enrolled === undefined) {
    return null;
  }

  if (enrolled) {
    return (
      <Document>
        <Group>
          <Title>MFA is enabled</Title>
          <Button onClick={disableMfa}>Disable MFA</Button>
        </Group>
      </Document>
    );
  }

  return (
    <Document width={400}>
      <Form onSubmit={enableMfa}>
        <Title>Multi Factor Auth Setup</Title>
        <Center>
          <img src={qrCodeUrl as string} />
        </Center>
        <TextInput name="token" label="Code" />
        <Group position="right" mt="xl">
          <Button type="submit">Enroll</Button>
        </Group>
      </Form>
    </Document>
  );
}
