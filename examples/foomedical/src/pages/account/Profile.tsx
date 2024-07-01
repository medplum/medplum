import { Box, Button, NativeSelect, Stack, TextInput, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { Form, ResourceAvatar, useMedplum } from '@medplum/react';
import { formatAddress, formatFamilyName, formatGivenName, formatHumanName, normalizeErrorString } from '@medplum/core';
import { HumanName, Patient } from '@medplum/fhirtypes';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { useState } from 'react';
import { InfoSection } from '../../components/InfoSection';

export function Profile(): JSX.Element | null {
  const medplum = useMedplum();

  const [profile, setProfile] = useState<Patient>(medplum.getProfile() as Patient);
  const [loading, setLoading] = useState(false);

  async function updateProfile(formData: Record<string, string>): Promise<void> {
    setLoading(true);

    const newProfile: Patient = {
      ...profile,
      name: [
        {
          use: 'official',
          given: [formData.givenName],
          family: formData.familyName,
        },
      ],
      birthDate: formData.birthDate,
      gender: formData.gender as Patient['gender'],
      address: [{ text: formData.address }],
    };

    const updatedProfile = await medplum
      .updateResource(newProfile)
      .then((profile) => {
        showNotification({
          icon: <IconCircleCheck />,
          title: 'Success',
          message: 'Profile edited',
        });
        medplum.getProfile();
        window.scrollTo(0, 0);
        return profile;
      })
      .catch((err) => {
        showNotification({
          color: 'red',
          icon: <IconCircleOff />,
          title: 'Error',
          message: normalizeErrorString(err),
        });
      });

    if (updatedProfile) {
      setProfile(updatedProfile);
    }

    setLoading(false);
  }

  return (
    <Box p="xl">
      <Form onSubmit={updateProfile}>
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
                  disabled
                />
                <TextInput
                  label="Address"
                  name="address"
                  defaultValue={formatAddress(profile.address?.[0] || {}) || profile.address?.[0]?.text}
                />
              </Stack>
            </Box>
          </InfoSection>
          <Box ml="auto">
            <Button type="submit" loading={loading}>
              Save
            </Button>
          </Box>
        </Stack>
      </Form>
    </Box>
  );
}
