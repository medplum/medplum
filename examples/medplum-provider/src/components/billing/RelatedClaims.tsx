// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Anchor, Badge, Group, Stack, Text } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { formatDate, formatMoney } from '@medplum/core';
import type { Claim, PaymentReconciliation } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import type { JSX, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { showErrorNotification } from '../../utils/notifications';
import { getClaimEncounter } from './claimConditions';
import { getClaimStatus, isClaimEditable } from './claimStatus';
import { DetailSection } from './DetailSection';
import classes from './RelatedClaims.module.css';
import type { VisitClaim } from './visitDetails';
import { findVisitClaims } from './visitDetails';

/**
 * The other claims for this claim's visit: the visit's own claim and any related claims made from it. Each opens in
 * the drawer. Hidden when there are none.
 * @param props - The RelatedClaims React props.
 * @param props.claim - The claim open in the drawer.
 * @param props.onOpenClaim - Opens another claim in the drawer, instead of following its link.
 * @returns The Related Claims section, or null.
 */
export function RelatedClaims(props: {
  readonly claim: WithId<Claim>;
  readonly onOpenClaim?: (id: string) => void;
}): JSX.Element | null {
  const { claim, onOpenClaim } = props;
  const medplum = useMedplum();
  const { pathname } = useLocation();
  const encounter = getClaimEncounter(claim)?.reference;
  const patient = claim.patient.reference;
  const relatedKey = (claim.related ?? []).map((r) => r.claim?.reference ?? '').join(',');
  const [visitClaims, setVisitClaims] = useState<VisitClaim[]>();

  useEffect(() => {
    let active = true;
    findVisitClaims(medplum, { reference: patient }, encounter ? { reference: encounter } : undefined, {
      id: claim.id,
      created: claim.created,
      related: relatedKey.split(',').filter(Boolean),
    })
      .then((found) => active && setVisitClaims(found))
      .catch(showErrorNotification);
    return () => {
      active = false;
    };
  }, [medplum, claim.id, claim.created, patient, encounter, relatedKey]);

  const others = visitClaims?.filter((v) => v.claim.id !== claim.id) ?? [];
  if (!others.length) {
    return null;
  }
  const toClaimUrl = (id: string): string =>
    pathname.endsWith(`/${claim.id}`) ? `${pathname.slice(0, -claim.id.length)}${id}` : `/Billing/Claims/all/${id}`;

  return (
    <DetailSection title="Related Claims" description="Other claims for this visit">
      <ClaimRows claims={others} toClaimUrl={toClaimUrl} onOpenClaim={onOpenClaim} />
    </DetailSection>
  );
}

export interface ClaimRowsProps {
  readonly claims: VisitClaim[];
  readonly toClaimUrl: (id: string) => string;
  /** Opens a claim in place, e.g. in a drawer, instead of following its link; modified clicks still follow it. */
  readonly onOpenClaim?: (id: string) => void;
  /** The remittances that pay the claims, linked under the claim they pay. */
  readonly remittances?: WithId<PaymentReconciliation>[];
  /** Extra controls at the end of a row. */
  readonly actions?: (claim: WithId<Claim>) => ReactNode;
}

/**
 * A list of claims, each with a link to the claim, its codes and total, its status, and links to its remittances.
 * @param props - The ClaimRows React props.
 * @returns The claim rows.
 */
export function ClaimRows(props: ClaimRowsProps): JSX.Element {
  const { claims, toClaimUrl, onOpenClaim, remittances, actions } = props;
  return (
    <Stack gap="xs">
      {claims.map(({ claim, responses }) => {
        const status = getClaimStatus(claim, responses);
        const codes = (claim.item ?? []).map((item) => item.productOrService?.coding?.[0]?.code).filter(Boolean);
        const remits = (remittances ?? []).filter((r) =>
          r.detail?.some((d) => d.request?.reference === `Claim/${claim.id}`)
        );
        return (
          <Group key={claim.id} gap="sm" wrap="nowrap" justify="space-between" className={classes.row}>
            <Stack gap={0} miw={0}>
              <Anchor
                component={Link}
                to={toClaimUrl(claim.id)}
                size="sm"
                fw={500}
                onClick={(e) => {
                  if (onOpenClaim && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) {
                    e.preventDefault();
                    onOpenClaim(claim.id);
                  }
                }}
              >
                Claim
                {claim.created ? ` · ${formatDate(claim.created)}` : ''}
              </Anchor>
              <Text size="xs" c="dimmed" truncate>
                {[codes.length ? codes.join(', ') : 'No service lines', formatMoney(claim.total ?? { value: 0 })].join(
                  ' · '
                )}
              </Text>
              {isClaimEditable(claim, responses) && (
                <Text size="xs" c="dimmed">
                  Updates with its charge items until it&apos;s submitted
                </Text>
              )}
              {remits.map((remit) => (
                <Anchor key={remit.id} component={Link} to={`/Billing/Remits/all/${remit.id}`} size="xs">
                  {getRemitLabel(remit, claim.id)}
                </Anchor>
              ))}
            </Stack>
            <Group gap="xs" wrap="nowrap" className={classes.end}>
              <Badge color={status.color} variant="light" title={status.detail} className={classes.badge}>
                {status.label}
              </Badge>
              {actions?.(claim)}
            </Group>
          </Group>
        );
      })}
    </Stack>
  );
}

/**
 * Names a remittance by what it paid on one claim and when, e.g. "Remit · 4/7/2025 · $80.00".
 * @param remit - The remittance.
 * @param claimId - The claim it pays.
 * @returns The label.
 */
function getRemitLabel(remit: PaymentReconciliation, claimId: string): string {
  const paid = (remit.detail ?? [])
    .filter((d) => d.request?.reference === `Claim/${claimId}`)
    .reduce((sum, d) => sum + (d.amount?.value ?? 0), 0);
  return ['Remit', remit.paymentDate ? formatDate(remit.paymentDate) : undefined, formatMoney({ value: paid })]
    .filter(Boolean)
    .join(' · ');
}
