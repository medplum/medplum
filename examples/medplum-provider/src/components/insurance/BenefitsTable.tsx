// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Stack, Table, Text } from '@mantine/core';
import { formatMoney } from '@medplum/core';
import type { CoverageEligibilityResponse, CoverageEligibilityResponseInsuranceItemBenefit } from '@medplum/fhirtypes';
import type { JSX } from 'react';

export type BenefitTableItem = NonNullable<NonNullable<CoverageEligibilityResponse['insurance']>[number]['item']>;

export function BenefitsTable({ items }: { items: BenefitTableItem }): JSX.Element {
  return (
    <Stack gap="xs">
      <Text fw={600} size="sm">
        Benefits
      </Text>
      <Box style={{ overflowX: 'auto' }}>
        <Table striped withTableBorder withColumnBorders fz="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Category</Table.Th>
              <Table.Th>Network</Table.Th>
              <Table.Th>Unit</Table.Th>
              <Table.Th>Term</Table.Th>
              <Table.Th>Type</Table.Th>
              <Table.Th>Allowed</Table.Th>
              <Table.Th>Used</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {items.flatMap((item, itemIndex) => {
              const category = item.category?.text ?? item.category?.coding?.[0]?.display ?? '—';
              const network = item.network?.text ?? item.network?.coding?.[0]?.display ?? '—';
              const unit = item.unit?.text ?? item.unit?.coding?.[0]?.display ?? '—';
              const term = item.term?.text ?? item.term?.coding?.[0]?.display ?? '—';

              if (!item.benefit || item.benefit.length === 0) {
                return [
                  <Table.Tr key={itemIndex}>
                    <Table.Td>{category}</Table.Td>
                    <Table.Td>{network}</Table.Td>
                    <Table.Td>{unit}</Table.Td>
                    <Table.Td>{term}</Table.Td>
                    <Table.Td>—</Table.Td>
                    <Table.Td>—</Table.Td>
                    <Table.Td>—</Table.Td>
                  </Table.Tr>,
                ];
              }

              return item.benefit.map((benefit, benefitIndex) => (
                <Table.Tr key={`${itemIndex}-${benefitIndex}`}>
                  <Table.Td>{category}</Table.Td>
                  <Table.Td>{network}</Table.Td>
                  <Table.Td>{unit}</Table.Td>
                  <Table.Td>{term}</Table.Td>
                  <Table.Td>{benefit.type?.text ?? benefit.type?.coding?.[0]?.display ?? '—'}</Table.Td>
                  <Table.Td>{formatBenefitValue(benefit, 'allowed')}</Table.Td>
                  <Table.Td>{formatBenefitValue(benefit, 'used')}</Table.Td>
                </Table.Tr>
              ));
            })}
          </Table.Tbody>
        </Table>
      </Box>
    </Stack>
  );
}

function formatBenefitValue(
  benefit: CoverageEligibilityResponseInsuranceItemBenefit,
  prefix: 'allowed' | 'used'
): string {
  if (prefix === 'allowed') {
    if (benefit.allowedUnsignedInt !== undefined) {
      return benefit.allowedUnsignedInt.toLocaleString();
    }
    if (benefit.allowedString) {
      return benefit.allowedString;
    }
    if (benefit.allowedMoney) {
      return formatMoney(benefit.allowedMoney);
    }
  } else {
    if (benefit.usedUnsignedInt !== undefined) {
      return benefit.usedUnsignedInt.toLocaleString();
    }
    if (benefit.usedString) {
      return benefit.usedString;
    }
    if (benefit.usedMoney) {
      return formatMoney(benefit.usedMoney);
    }
  }
  return '—';
}
