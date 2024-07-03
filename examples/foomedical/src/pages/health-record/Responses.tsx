import { Box, Stack, Text, Title, useMantineTheme } from '@mantine/core';
import { formatDateTime, getReferenceString } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { useMedplum, useMedplumProfile } from '@medplum/react';
import { IconChevronRight } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { InfoButton } from '../../components/InfoButton';
import { InfoSection } from '../../components/InfoSection';

export function Responses(): JSX.Element {
  const medplum = useMedplum();
  const theme = useMantineTheme();
  const navigate = useNavigate();
  const profile = useMedplumProfile() as Patient;
  const responses = medplum
    .searchResources('QuestionnaireResponse', `source=${getReferenceString(profile)}&_sort=-authored`)
    .read();

  return (
    <Box p="xl">
      <Title mb="lg">Questionnaire Responses</Title>
      <InfoSection title="Questionnaire Responses">
        <Stack gap={0}>
          {responses.map((resp) => (
            <InfoButton key={resp.id} onClick={() => navigate(`./${resp.id}`)}>
              <div>
                <Text c={theme.primaryColor} fw={500} mb={4}>
                  {formatDateTime(resp.authored)}
                </Text>
              </div>
              <IconChevronRight color={theme.colors.gray[5]} />
            </InfoButton>
          ))}
        </Stack>
      </InfoSection>
    </Box>
  );
}
