import { Button, Center, Paper } from '@mantine/core';

export function PatientPrescription(): JSX.Element {
  async function fetchPatients(): Promise<void> {
    try {
      const response = await fetch('https://api.neutron.health/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer + ${process.env.PHOTON_AUTH_TOKEN}`,
          Accept: 'application/json',
        },
        body: JSON.stringify({
          query: `
            query patients{
              patients{
                id
                name {
                  first
                  last
                }
                dateOfBirth
                sex
                gender
                email
              }
            }
          `,
        }),
      });

      const result = await response.json();
      console.log(result);
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <Paper>
      <Center pt="lg" pb="lg">
        <Button onClick={fetchPatients}>Sync Patient to Photon Health</Button>
      </Center>
    </Paper>
  );
}
