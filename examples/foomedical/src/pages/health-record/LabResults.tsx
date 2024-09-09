import { Box, Stack, Text, Title, useMantineTheme } from '@mantine/core';
import { formatDate, getReferenceString } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconChevronRight } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { InfoButton } from '../../components/InfoButton';
import { InfoSection } from '../../components/InfoSection';

export function LabResults(): JSX.Element {
  const theme = useMantineTheme();
  const navigate = useNavigate();
  const medplum = useMedplum();
  const patient = medplum.getProfile() as Patient;
  const reports = medplum.searchResources('DiagnosticReport', 'subject=' + getReferenceString(patient)).read();

  return (
    <Box p="xl">
      <Title mb="lg">Lab Results</Title>
      <InfoSection title="Lab Results">
        <Stack gap={0}>
          {reports.map((report) => (
            <InfoButton key={report.id} onClick={() => navigate(`./${report.id}`)}>
              <div>
                <Text fw={500} mb={4}>
                  {formatDate(report.meta?.lastUpdated as string)}
                </Text>
                <Text>{report.code?.text}</Text>
              </div>
              <IconChevronRight color={theme.colors.gray[5]} />
            </InfoButton>
          ))}
        </Stack>
      </InfoSection>
    </Box>
  );
}
