import { Box, Stack, Text, Title, useMantineTheme } from '@mantine/core';
import { formatDate, getReferenceString } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { StatusBadge, useMedplum } from '@medplum/react';
import { IconCalendar } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { InfoButton } from '../../components/InfoButton';
import { InfoSection } from '../../components/InfoSection';

export function ActionItems(): JSX.Element {
  const theme = useMantineTheme();
  const navigate = useNavigate();
  const medplum = useMedplum();
  const patient = medplum.getProfile() as Patient;
  const carePlans = medplum.searchResources('CarePlan', 'subject=' + getReferenceString(patient)).read();

  return (
    <Box p="xl">
      <Title mb="lg">Action Items</Title>
      <InfoSection title="Action Items">
        <Stack gap={0}>
          {carePlans.map((resource) => (
            <InfoButton key={resource.id} onClick={() => navigate(`./${resource.id}`)}>
              <div>
                <Text c={theme.primaryColor} fw={500}>
                  {resource.title}
                </Text>
                <Text mt="sm" c="gray.5" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <IconCalendar size={16} />
                  <time>{formatDate(resource.period?.start)} </time>
                  {resource.period?.end && <time>&nbsp;-&nbsp;{formatDate(resource.period.end)}</time>}
                </Text>
              </div>
              <StatusBadge status={resource.status as string} />
            </InfoButton>
          ))}
        </Stack>
      </InfoSection>
    </Box>
  );
}
