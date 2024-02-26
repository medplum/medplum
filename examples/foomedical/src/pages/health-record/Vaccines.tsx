import { Anchor, Box, Stack, Text, Title, useMantineTheme } from '@mantine/core';
import { formatDate, getReferenceString } from '@medplum/core';
import { Immunization, Patient } from '@medplum/fhirtypes';
import { StatusBadge, useMedplum } from '@medplum/react';
import { IconCalendar, IconMapPin } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { InfoButton } from '../../components/InfoButton';
import { InfoSection } from '../../components/InfoSection';
import PillsImage from '../../img/pills.svg';

export function Vaccines(): JSX.Element {
  const medplum = useMedplum();
  const patient = medplum.getProfile() as Patient;
  const vaccines = medplum.searchResources('Immunization', 'patient=' + getReferenceString(patient)).read();
  const today = new Date().toISOString();
  const activeVaccines = vaccines.filter((v) => v.occurrenceDateTime && v.occurrenceDateTime > today);
  const pastVaccines = vaccines.filter((v) => !v.occurrenceDateTime || v.occurrenceDateTime <= today);

  return (
    <Box p="xl">
      <Title mb="lg">Vaccines</Title>
      <InfoSection title="Active upcoming vaccines">
        {activeVaccines.length === 0 ? (
          <Box p="xl" style={{ textAlign: 'center' }}>
            <Stack align="center" w={500} m="auto">
              <img src={PillsImage} width={160} height={160} />
              <Title order={2} fw={900}>
                No upcoming vaccines available
              </Title>
              <Text c="gray">
                If you think you&apos;re missing upcoming vaccines that should be here, please{' '}
                <Anchor href="#">contact our medical team</Anchor>.
              </Text>
            </Stack>
          </Box>
        ) : (
          <VaccineList vaccines={activeVaccines} />
        )}
      </InfoSection>
      {pastVaccines.length > 0 && (
        <InfoSection title="Past vaccines">
          <VaccineList vaccines={pastVaccines} />
        </InfoSection>
      )}
    </Box>
  );
}

function VaccineList({ vaccines }: { vaccines: Immunization[] }): JSX.Element {
  return (
    <Stack gap={0}>
      {vaccines.map((vaccine) => (
        <Vaccine key={vaccine.id} vaccine={vaccine} />
      ))}
    </Stack>
  );
}

function Vaccine({ vaccine }: { vaccine: Immunization }): JSX.Element {
  const theme = useMantineTheme();
  const navigate = useNavigate();
  return (
    <InfoButton onClick={() => navigate(`./${vaccine.id}`)}>
      <div>
        <Text c={theme.primaryColor} fw={500} mb={8}>
          {vaccine.vaccineCode?.text}
        </Text>
        <Text c="gray.6">
          <IconMapPin size={16} style={{ marginRight: 4 }} />
          {vaccine.location?.display}
        </Text>
      </div>
      <div>
        <StatusBadge status={vaccine.status as string} />
        {vaccine.occurrenceDateTime && (
          <Text c="gray.6">
            <IconCalendar size={16} style={{ marginRight: 4 }} />
            <time dateTime={vaccine.occurrenceDateTime}>{formatDate(vaccine.occurrenceDateTime as string)}</time>
          </Text>
        )}
      </div>
    </InfoButton>
  );
}
