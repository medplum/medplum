// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Card, Group, Loader, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { getExtensionValue, normalizeErrorString } from '@medplum/core';
import type { Basic, ChargeItem, Invoice } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import { IconCircleOff } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

const BILLING_PLAN_SYSTEM = 'https://medsscript.com/billing-plan';
const PLAN_NAME_URL = 'https://medsscript.com/billing-plan/plan-name';
const MONTHLY_FEE_URL = 'https://medsscript.com/billing-plan/monthly-fee-usd';
const PER_TRANSACTION_FEE_URL = 'https://medsscript.com/billing-plan/per-transaction-fee-usd';

interface BillingPlan {
  id?: string;
  planName: string;
  monthlyFee?: number;
  perTransactionFee?: number;
}

function readNumber(resource: Basic, url: string): number | undefined {
  const value = getExtensionValue(resource, url) as number | string | undefined;
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function formatUsd(value: number | undefined): string {
  if (value === undefined) {
    return '—';
  }
  return `$${value.toFixed(2)}`;
}

function startOfMonthIso(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

export function BillingPage(): JSX.Element {
  const medplum = useMedplum();
  const [plans, setPlans] = useState<BillingPlan[]>();
  const [charges, setCharges] = useState<ChargeItem[]>();
  const [invoices, setInvoices] = useState<Invoice[]>();

  const load = useCallback(() => {
    medplum
      .searchResources('Basic', `identifier=${encodeURIComponent(BILLING_PLAN_SYSTEM + '|')}&_count=50`)
      .then((results) => {
        setPlans(
          results.map((plan) => ({
            id: plan.id,
            planName: (getExtensionValue(plan, PLAN_NAME_URL) as string | undefined) ?? '(unnamed plan)',
            monthlyFee: readNumber(plan, MONTHLY_FEE_URL),
            perTransactionFee: readNumber(plan, PER_TRANSACTION_FEE_URL),
          }))
        );
      })
      .catch((err) => {
        showNotification({ color: 'red', icon: <IconCircleOff />, title: 'Error', message: normalizeErrorString(err) });
        setPlans([]);
      });

    medplum
      .searchResources('ChargeItem', `_count=200&_sort=-_lastUpdated&enteredDate=ge${startOfMonthIso()}`)
      .then(setCharges)
      .catch((err) => {
        showNotification({ color: 'red', icon: <IconCircleOff />, title: 'Error', message: normalizeErrorString(err) });
        setCharges([]);
      });

    medplum
      .searchResources('Invoice', '_count=10&_sort=-_lastUpdated')
      .then(setInvoices)
      .catch((err) => {
        showNotification({ color: 'red', icon: <IconCircleOff />, title: 'Error', message: normalizeErrorString(err) });
        setInvoices([]);
      });
  }, [medplum]);

  useEffect(() => {
    load();
  }, [load]);

  const chargesByType = useMemo(() => {
    const counts = new Map<string, number>();
    for (const charge of charges ?? []) {
      const coding = charge.code?.coding?.[0];
      const key = coding?.display ?? coding?.code ?? charge.code?.text ?? 'Uncategorized';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [charges]);

  return (
    <Document>
      <Title order={2} mb="md">
        Clinic Billing
      </Title>
      <Text c="dimmed" mb="lg">
        Your current billing plan, this month&apos;s transactions, and recent invoices.
      </Text>

      <Stack gap="xl">
        {/* Billing plans */}
        <div>
          <Title order={4} mb="sm">
            Current Plan
          </Title>
          {!plans ? (
            <Group justify="center" p="md">
              <Loader />
            </Group>
          ) : plans.length === 0 ? (
            <Text c="dimmed">No billing plan on file yet.</Text>
          ) : (
            <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
              {plans.map((plan) => (
                <Card key={plan.id} withBorder radius="md" padding="lg">
                  <Group justify="space-between" mb="xs">
                    <Text fw={600}>{plan.planName}</Text>
                    <Badge color="teal" variant="light">
                      Active
                    </Badge>
                  </Group>
                  <Text size="sm" c="dimmed">
                    Monthly fee: {formatUsd(plan.monthlyFee)}
                  </Text>
                  <Text size="sm" c="dimmed">
                    Per-transaction fee: {formatUsd(plan.perTransactionFee)}
                  </Text>
                </Card>
              ))}
            </SimpleGrid>
          )}
        </div>

        {/* This month's transactions */}
        <div>
          <Group justify="space-between" mb="sm">
            <Title order={4}>This Month&apos;s Transactions</Title>
            {charges && (
              <Badge color="teal" variant="filled" size="lg">
                {charges.length} total
              </Badge>
            )}
          </Group>
          {!charges ? (
            <Group justify="center" p="md">
              <Loader />
            </Group>
          ) : charges.length === 0 ? (
            <Text c="dimmed">No transactions recorded this month.</Text>
          ) : (
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Transaction type</Table.Th>
                  <Table.Th>Count</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {chargesByType.map(([type, count]) => (
                  <Table.Tr key={type}>
                    <Table.Td>{type}</Table.Td>
                    <Table.Td>{count}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </div>

        {/* Recent invoices */}
        <div>
          <Title order={4} mb="sm">
            Recent Invoices
          </Title>
          {!invoices ? (
            <Group justify="center" p="md">
              <Loader />
            </Group>
          ) : invoices.length === 0 ? (
            <Text c="dimmed">No invoices yet.</Text>
          ) : (
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Invoice</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Date</Table.Th>
                  <Table.Th>Total</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {invoices.map((invoice) => {
                  const total = invoice.totalGross ?? invoice.totalNet;
                  return (
                    <Table.Tr key={invoice.id}>
                      <Table.Td>{invoice.identifier?.[0]?.value ?? invoice.id}</Table.Td>
                      <Table.Td>
                        <Badge
                          variant="light"
                          color={
                            invoice.status === 'balanced' ? 'teal' : invoice.status === 'issued' ? 'blue' : 'gray'
                          }
                        >
                          {invoice.status}
                        </Badge>
                      </Table.Td>
                      <Table.Td>{invoice.date ? new Date(invoice.date).toLocaleDateString() : '—'}</Table.Td>
                      <Table.Td>
                        {total?.value !== undefined ? `${total.currency ?? 'USD'} ${total.value.toFixed(2)}` : '—'}
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          )}
        </div>
      </Stack>
    </Document>
  );
}
