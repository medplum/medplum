import { Container, Title, Text, Button, Stack } from '@mantine/core';
import {
  MEDPLUM_FHIR_URL,
  MEDPLUM_CLIENT_ID,
  SMART_HEALTH_IT_AUTH_URL,
  SMART_HEALTH_IT_CLIENT_ID,
  EHR_LAUNCH_URL,
} from '../config';

interface SmartLaunchProps {
  clientId: string;
  iss: string;
  children: React.ReactNode;
}

function SmartLaunch({ clientId, iss, children }: SmartLaunchProps): JSX.Element {
  const handleClick = (): void => {
    const patientId = document.getElementById('patientIdBox').value;
    const patientIdNullString = '*** Must set patient ID for SMART launch ***';

    if (!patientId) {
      document.getElementsByName('patientIdBox')[0].placeholder = patientIdNullString;
      return;
    }

    sessionStorage.setItem('smart_patient', patientId);

    const params = new URLSearchParams({
      iss: iss,
      launch: crypto.randomUUID(),
    });

    window.location.href = `${EHR_LAUNCH_URL}?${params.toString()}`;
  };

  return <div onClick={handleClick}>{children}</div>;
}

export function HomePage(): JSX.Element {
  return (
    <Container size="md" mt="xl">
      <Stack>
        <Title order={1}>Medplum SMART on FHIR Demo</Title>
        <Text>
          This is a demonstration of SMART on FHIR capabilities using Medplum. You can launch this app from any
          SMART-enabled EHR system.
        </Text>
        <Text>To test the app, you can use one of these launch options:</Text>

        <SmartLaunch clientId={MEDPLUM_CLIENT_ID} iss={MEDPLUM_FHIR_URL}>
          <Button>Launch with Medplum</Button>
        </SmartLaunch>

        <SmartLaunch clientId={SMART_HEALTH_IT_CLIENT_ID} iss={SMART_HEALTH_IT_AUTH_URL}>
          <Button>Launch with SMART Health IT Sandbox</Button>
        </SmartLaunch>

        <input
          type="text"
          id="patientIdBox"
          name="patientIdBox"
          placeholder="Please set patient ID here"
          required
        ></input>
      </Stack>
    </Container>
  );
}
