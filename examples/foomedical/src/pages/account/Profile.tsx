import { Box, Button, InputLabel, LoadingOverlay, NativeSelect, Stack, TextInput, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { AddressInput, Form, ResourceAvatar, useMedplum } from '@medplum/react';
import { formatFamilyName, formatGivenName, formatHumanName, normalizeErrorString } from '@medplum/core';
import { Address, HumanName, Patient } from '@medplum/fhirtypes';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { useState } from 'react';
import { InfoSection } from '../../components/InfoSection';

export function Profile(): JSX.Element | null {
  const medplum = useMedplum();
  const [profile, setProfile] = useState<Patient>(medplum.getProfile() as Patient);
  const [loading, setLoading] = useState(false);
  const [address, setAddress] = useState<Address>(profile.address?.[0] || {});

  async function handleProfileEdit(formData: Record<string, string>): Promise<void> {
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
      address: [address],
    };
    const updatedProfile = await medplum
      .updateResource(newProfile)
      .then((profile) => {
        showNotification({
          icon: <IconCircleCheck />,
          title: 'Success',
          message: 'Profile edited',
        });
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
      setProfile(updatedProfile as Patient);
    }
    setLoading(false);
  }

  return (
    <Box p="xl" pos="relative">
      <LoadingOverlay visible={loading} />
      <Form onSubmit={handleProfileEdit}>
        <Stack align="center">
          <ResourceAvatar size={200} radius={100} value={profile} />
          <Title order={2}>{formatHumanName(profile.name?.[0] as HumanName)}</Title>
          <InfoSection title="Personal Information">
            <Box p="xl">
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
                <Button type="submit" mr="auto">
                  Save
                </Button>
              </Stack>
            </Box>
          </InfoSection>
          <InfoSection title="Contact Information">
            <Box p="xl">
              <Stack>
                <TextInput
                  label="Email"
                  name="email"
                  defaultValue={profile.telecom?.find((t) => t.system === 'email')?.value}
                  disabled
                />
                <Stack gap={0}>
                  <InputLabel htmlFor="address">Address</InputLabel>
                  <AddressInput
                    name="address"
                    path="Patient.address"
                    defaultValue={address}
                    onChange={(address) => setAddress(address)}
                  />
                </Stack>
                <Button type="submit" mr="auto">
                  Save
                </Button>
              </Stack>
            </Box>
          </InfoSection>
        </Stack>
      </Form>
    </Box>
  );
}
