import { Box, Stack, Text, Title, useMantineTheme } from '@mantine/core';
import { getReferenceString } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconChevronRight } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { InfoButton } from '../../components/InfoButton';
import { InfoSection } from '../../components/InfoSection';

export function Medications(): JSX.Element {
  const theme = useMantineTheme();
  const navigate = useNavigate();
  const medplum = useMedplum();
  const patient = medplum.getProfile() as Patient;
  const medications = medplum.searchResources('MedicationRequest', 'patient=' + getReferenceString(patient)).read();

  return (
    <Box p="xl">
      <Title mb="lg">Medications</Title>
      <InfoSection title="Medications">
        <Stack gap={0}>
          {medications.map((med) => (
            <InfoButton key={med.id} onClick={() => navigate(`./${med.id}`)}>
              <div>
                <Text c={theme.primaryColor} fw={500} mb={4}>
                  {med?.medicationCodeableConcept?.text}
                </Text>
                <Text c="gray.6">{med.requester?.display}</Text>
              </div>
              <IconChevronRight color={theme.colors.gray[5]} />
            </InfoButton>
          ))}
        </Stack>
      </InfoSection>
    </Box>
  );
}
