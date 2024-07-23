import { Title, Button, Group } from '@mantine/core';
import { formatHumanName } from '@medplum/core';
import { Practitioner } from '@medplum/fhirtypes';
import { Document, useMedplum, useMedplumProfile } from '@medplum/react';
import { useState } from 'react';

/**
 * Home page that greets the user and displays a list of patients.
 * @returns A React component that displays the home page.
 */
export function HomePage(): JSX.Element {
  // useMedplumProfile() returns the "profile resource" associated with the user.
  // This can be a Practitioner, Patient, or RelatedPerson depending on the user's role in the project.
  // See the "Register" tutorial for more detail
  // https://www.medplum.com/docs/tutorials/register
  const medplum = useMedplum();
  const profile = useMedplumProfile() as Practitioner;
  const name = profile?.name?.[0] ?? {};
  const [output, setOutput] = useState('');

  return (
    <Document p={'1rem'} m={'1rem'}>
      <Title>
        Logged in as: {formatHumanName(name)} ({profile.resourceType})
      </Title>
      <Group gap={'sm'}>
        {
          // The userinfo button handler
          // Use the access token to call the "/userinfo" to get current user details
          // Display the output in the window
        }
        <Button
          id="userinfo"
          onClick={() =>
            medplum
              .get('oauth2/userinfo')
              .then((obj) => setOutput(JSON.stringify(obj, null, 2)))
              .catch(alert)
          }
        >
          User Info
        </Button>
        {
          // The practitioners button handler
          // Use the access token to call the "/userinfo" to get current user details
          // Display the output in the window
        }
        <Button
          id="practitioners"
          onClick={() =>
            medplum
              .search('Practitioner')
              .then((obj) => setOutput(JSON.stringify(obj, null, 2)))
              .catch(alert)
          }
        >
          Practitioners
        </Button>
      </Group>

      <pre
        id="output"
        style={{ width: '800px', height: '500px', border: '1px solid #888', overflow: 'auto' }}
      >
        {output}
      </pre>
    </Document>
  );
}
