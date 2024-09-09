import { Box, Stack, Table, Title } from '@mantine/core';
import { formatCoding, getReferenceString } from '@medplum/core';
import { Coverage, Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { InfoButton } from '../../components/InfoButton';
import { InfoSection } from '../../components/InfoSection';

function CoverageTable({ coverages }: { coverages: Coverage[] }): JSX.Element {
  return (
    <Table>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Payor Name</Table.Th>
          <Table.Th>Subscriber ID</Table.Th>
          <Table.Th>Relationship to Subscriber</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {coverages.map((c) => (
          <Table.Tr key={c.id}>
            <Table.Td>{c.payor?.[0].display}</Table.Td>
            <Table.Td>{c.subscriberId || '-'}</Table.Td>
            <Table.Td>{formatCoding(c.relationship?.coding?.[0]) || '-'}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

export function MembershipAndBilling(): JSX.Element {
  const medplum = useMedplum();
  const patient = medplum.getProfile() as Patient;
  const coverages = medplum
    .searchResources('Coverage', {
      beneficiary: getReferenceString(patient),
    })
    .read();
  const payments = medplum.searchResources('PaymentNotice').read();

  return (
    <Box p="xl">
      <Title mb="xl">Membership & Billing</Title>
      <InfoSection title="Coverage">
        {coverages.length === 0 ? (
          <Box p="xl">No coverage</Box>
        ) : (
          <Stack gap={0}>
            <CoverageTable coverages={coverages} />
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
