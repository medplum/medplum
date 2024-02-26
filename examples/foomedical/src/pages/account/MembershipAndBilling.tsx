import { Box, Stack, Title } from '@mantine/core';
import { getReferenceString } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { InfoButton } from '../../components/InfoButton';
import { InfoSection } from '../../components/InfoSection';

export function MembershipAndBilling(): JSX.Element {
  const medplum = useMedplum();
  const patient = medplum.getProfile() as Patient;
  const coverages = medplum.searchResources('Coverage', 'patient=' + getReferenceString(patient)).read();
  const payments = medplum.searchResources('PaymentNotice').read();

  return (
    <Box p="xl">
      <Title mb="xl">Membership & Billing</Title>
      <InfoSection title="Coverage">
        {coverages.length === 0 ? (
          <Box p="xl">No coverage</Box>
        ) : (
          <Stack gap={0}>
            {coverages.map((c) => (
              <InfoButton key={c.id}>{c.id}</InfoButton>
            ))}
          </Stack>
        )}
      </InfoSection>
      <InfoSection title="Payments">
        {payments.length === 0 ? (
          <Box p="xl">No payments</Box>
        ) : (
          <Stack gap={0}>
            {payments.map((p) => (
              <InfoButton key={p.id}>{p.id}</InfoButton>
            ))}
          </Stack>
        )}
      </InfoSection>
    </Box>
  );
}
