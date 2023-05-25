import { Box, NativeSelect, Stack, TextInput, Title } from '@mantine/core';
import { formatAddress, formatFamilyName, formatGivenName, formatHumanName } from '@medplum/core';
import { HumanName, Patient } from '@medplum/fhirtypes';
import { Form, ResourceAvatar, useMedplumProfile } from '@medplum/react';
import { InfoSection } from '../../components/InfoSection';

export function Profile(): JSX.Element | null {
  const profile = useMedplumProfile() as Patient;
  return (
    <Box p="xl">
      <Form
        onSubmit={(formData: Record<string, string>) => {
          console.log('formData', formData);
        }}
      >
        <Stack align="center">
          <ResourceAvatar size={200} radius={100} value={profile} />
          <Title order={2}>{formatHumanName(profile.name?.[0] as HumanName)}</Title>
          <InfoSection title="Personal Information">
            <Box p="xl" w={500}>
              <Stack>
                <TextInput
                  label="First Name"
                  name="givenName"
                  defaultValue={formatGivenName(profile.name?.[0] as HumanName)}
                />
                <TextInput
                  label="Last Name"
                  name="familyName"
                  defaultValue={formatFamilyName(profile.name?.[0] as HumanName)}
                />
                <NativeSelect
                  label="Gender"
                  name="gender"
                  defaultValue={profile.gender}
                  data={['', 'female', 'male', 'other', 'unknown']}
                />
                <TextInput label="Birth Date" name="birthDate" type="date" defaultValue={profile.birthDate} />
              </Stack>
            </Box>
          </InfoSection>
          <InfoSection title="Contact Information">
            <Box p="xl" w={500}>
              <Stack>
                <TextInput
                  label="Email"
                  name="email"
                  defaultValue={profile.telecom?.find((t) => t.system === 'email')?.value}
                />
                <TextInput label="Address" name="address" defaultValue={formatAddress(profile.address?.[0] || {})} />
              </Stack>
            </Box>
          </InfoSection>
        </Stack>
      </Form>
    </Box>
  );
}
