// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Group, Stack, Text } from '@mantine/core';
import { formatDate, formatMoney, getDisplayString } from '@medplum/core';
import type { Claim } from '@medplum/fhirtypes';
import { MedplumLink, StatusBadge, useResource } from '@medplum/react';
import cx from 'clsx';
import type { JSX } from 'react';
import { getClaimTitle } from './claims.utils';
import classes from './ClaimListItem.module.css';

interface ClaimListItemProps {
  readonly claim: Claim;
  readonly getClaimUri: (claim: Claim) => string;
  readonly hideDivider?: boolean;
}

export function ClaimListItem({ claim, getClaimUri, hideDivider }: ClaimListItemProps): JSX.Element {
  // Prefer the reference display (set by createReference); only fetch when it's missing.
  const patient = useResource(claim.patient?.display ? undefined : claim.patient);
  const patientName = claim.patient?.display ?? (patient ? getDisplayString(patient) : undefined);

  // Line 2 is the payer organization behind the claim's first coverage:
  // claim.insurance[0].coverage -> Coverage.payor[0].
  const coverage = useResource(claim.insurance?.[0]?.coverage);
  const payorRef = coverage?.payor?.[0];
  const payor = useResource(payorRef?.display ? undefined : payorRef);
  const organizationName = payorRef?.display ?? (payor ? getDisplayString(payor) : undefined);

  const metaLine = [claim.created ? formatDate(claim.created) : null, claim.total ? formatMoney(claim.total) : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className={cx(classes.itemWrapper, { [classes.hideDivider]: hideDivider })}>
      <MedplumLink to={getClaimUri(claim)} underline="never">
        <Group align="center" wrap="nowrap" className={classes.contentContainer}>
          <Stack gap={2} flex={1} style={{ minWidth: 0 }}>
            <Group justify="space-between" align="flex-start" wrap="nowrap">
              <Text fw={700} className={classes.title} flex={1}>
                {patientName ?? getClaimTitle(claim)}
              </Text>
              {claim.status && <StatusBadge status={claim.status} />}
            </Group>
            {organizationName && (
              <Text size="sm" className={classes.title}>
                {organizationName}
              </Text>
            )}
            {metaLine && (
              <Text size="sm" c="dimmed" truncate>
                {metaLine}
              </Text>
            )}
          </Stack>
        </Group>
      </MedplumLink>
    </div>
  );
}
