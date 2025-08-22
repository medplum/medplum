// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Group, Modal, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import { Document, MfaForm, MfaFormFields, useMedplum } from '@medplum/react';
import { IconCircleCheck } from '@tabler/icons-react';
import { JSX, useCallback, useEffect, useState } from 'react';

export function MfaPage(): JSX.Element | null {
  const medplum = useMedplum();
  const [qrCodeUrl, setQrCodeUrl] = useState<string>();
  const [enrolled, setEnrolled] = useState<boolean | undefined>(undefined);
  const [disabling, setDisabling] = useState<boolean>(false);

  const fetchStatus = useCallback(() => {
    medplum
      .get('auth/mfa/status', { cache: 'no-cache' })
      .then((response) => {
        setQrCodeUrl(response.enrollQrCode);
        setEnrolled(response.enrolled);
      })
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }));
  }, [medplum]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const enableMfa = useCallback(
    (formData: Record<MfaFormFields, string>) => {
      medplum
        .post('auth/mfa/enroll', formData)
        .then(() => {
          setEnrolled(true);
          showNotification({ color: 'green', message: 'Success' });
        })
        .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }));
    },
    [medplum]
  );

  const disableMfa = useCallback(
    async (formData: Record<MfaFormFields, string>): Promise<OperationOutcome> => {
      return medplum.post('auth/mfa/disable', { token: formData.token });
    },
    [medplum]
  );

  if (enrolled === undefined) {
    return null;
  }

  if (enrolled) {
    return (
      <Document>
        <Modal title="Disable MFA" opened={disabling} onClose={() => setDisabling(false)}>
          <MfaForm
            title="Disable MFA"
            buttonText="Submit code"
            onSubmit={async (formData) => {
              // This will throw if MFA failed to disable
              await disableMfa(formData);
              setDisabling(false);
              setEnrolled(false);
              showNotification({
                id: 'mfa-disabled',
                color: 'green',
                title: 'Success',
                message: 'MFA disabled',
                icon: <IconCircleCheck />,
              });
              // We fetch the status so that the MFA QR code is refreshed
              fetchStatus();
            }}
          />
        </Modal>
        <Group>
          <Title>MFA is enabled</Title>
          <Button onClick={() => setDisabling(true)}>Disable MFA</Button>
        </Group>
      </Document>
    );
  }

  return (
    <Document width={400}>
      <MfaForm
        title="Multi Factor Auth Setup"
        buttonText="Enroll"
        qrCodeUrl={qrCodeUrl as string}
        onSubmit={enableMfa}
      />
    </Document>
  );
}
