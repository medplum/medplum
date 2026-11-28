// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Button, Group, Menu, Skeleton, Stack, Text } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import { formatDate } from '@medplum/core';
import type { Claim, PaymentReconciliation } from '@medplum/fhirtypes';
import {
  IconAlertTriangle,
  IconArrowRight,
  IconCirclePlus,
  IconDots,
  IconExternalLink,
  IconFileText,
  IconSend,
  IconTrash,
} from '@tabler/icons-react';
import type { JSX } from 'react';
import { Link } from 'react-router';
import { isClaimEditable } from '../billing/claimStatus';
import { DetailSection } from '../billing/DetailSection';
import sectionClasses from '../billing/DetailSection.module.css';
import { canDiscardClaim } from '../billing/discardClaim';
import { ClaimRows } from '../billing/RelatedClaims';
import relatedClasses from '../billing/RelatedClaims.module.css';
import type { VisitClaim } from '../billing/visitDetails';

export interface VisitClaimsSectionProps {
  /** The visit's claims, oldest first, or undefined while they load. */
  readonly claims?: VisitClaim[];
  /** The remittances that pay them. */
  readonly remittances?: WithId<PaymentReconciliation>[];
  /** The codes of the visit's charge items that aren't on a claim. */
  readonly unbilledCodes?: string[];
  /** The visit's claims that can still change, to add charge items to. */
  readonly openClaims?: WithId<Claim>[];
  /** Adds the charge items that aren't on a claim to an open claim. */
  readonly onAddUnbilled?: (claim: WithId<Claim>) => void;
  /** Opens a claim in the drawer over the visit. */
  readonly onOpenClaim: (id: string) => void;
  /** Opens the dialog to make a claim from some of the visit's lines, with the given charge items picked. */
  readonly onNewClaim?: (unbilled?: boolean) => void;
  /** Whether a claim submission operation is deployed in this project. */
  readonly canSubmit: boolean;
  readonly submitting: boolean;
  /** Exports a claim as a CMS 1500 form; no claim means the visit's first claim, made first. */
  readonly onExport: (claim?: WithId<Claim>) => void;
  /** Opens the submit dialog for a claim; no claim means the visit's first claim, made first. */
  readonly onSubmit: (claim?: WithId<Claim>) => void;
  /** Asks to discard a claim that was never submitted. */
  readonly onDiscard: (claim: WithId<Claim>) => void;
}

/**
 * The visit's claims, each with its status and remittances, and a menu to open it, export it or submit it. Charge items
 * that aren't on any claim are called out, with ways to bill them.
 * @param props - The VisitClaimsSection React props.
 * @returns The Claims section.
 */
export function VisitClaimsSection(props: VisitClaimsSectionProps): JSX.Element {
  const { claims, remittances, unbilledCodes = [], openClaims = [], onAddUnbilled, onOpenClaim, onNewClaim } = props;
  const unbilledCount = unbilledCodes.length;
  return (
    <DetailSection title="Claims" description="Claims for this visit and their remittances">
      {!claims && (
        <Stack gap={6}>
          <Skeleton height={16} width="40%" />
          <Skeleton height={12} width="60%" />
        </Stack>
      )}
      {claims?.length === 0 && (
        <Group gap="sm" wrap="nowrap" justify="space-between" className={relatedClasses.row}>
          <Stack gap={0} miw={0}>
            <Text size="sm" fw={500}>
              Claim
            </Text>
            <Text size="xs" c="dimmed">
              Made from the visit&apos;s charge items and diagnoses when you export or submit it
            </Text>
          </Stack>
          <ClaimActions {...props} />
        </Group>
      )}
      {!!claims?.length && (
        <ClaimRows
          claims={claims}
          remittances={remittances}
          toClaimUrl={(id) => `/Billing/Claims/all/${id}`}
          onOpenClaim={onOpenClaim}
          actions={(claim) => <ClaimActions {...props} claim={claim} responses={findResponses(claims, claim)} />}
        />
      )}
      {!!claims?.length && unbilledCount > 0 && (
        <Group gap="sm" wrap="nowrap" justify="space-between" className={relatedClasses.row}>
          <Group gap={6} wrap="nowrap" miw={0}>
            <IconAlertTriangle size={16} color="var(--mantine-color-orange-7)" style={{ flex: 'none' }} />
            <Text size="sm" c="var(--mantine-color-orange-7)">
              {unbilledCount} {unbilledCount === 1 ? "charge item isn't" : "charge items aren't"} on a claim:{' '}
              {unbilledCodes.join(', ')}
            </Text>
          </Group>
          <Group gap="xs" wrap="nowrap">
            {onAddUnbilled && openClaims.length > 0 && (
              <Menu position="bottom-end" shadow="md" radius="md" withinPortal>
                <Menu.Target>
                  <Button size="compact-sm" variant="default">
                    Add to Claim
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  {openClaims.map((c) => (
                    <Menu.Item key={c.id} onClick={() => onAddUnbilled(c)}>
                      Claim{c.created ? ` · ${formatDate(c.created)}` : ''}
                    </Menu.Item>
                  ))}
                </Menu.Dropdown>
              </Menu>
            )}
            {onNewClaim && (
              <Button size="compact-sm" variant="default" onClick={() => onNewClaim(true)}>
                New Claim
              </Button>
            )}
          </Group>
        </Group>
      )}
      {claims && onNewClaim && (
        <div className={sectionClasses.footer}>
          <Button variant="light" fullWidth leftSection={<IconCirclePlus size={16} />} onClick={() => onNewClaim()}>
            New Claim
          </Button>
        </div>
      )}
    </DetailSection>
  );
}

function findResponses(claims: VisitClaim[], claim: WithId<Claim>): VisitClaim['responses'] {
  return claims.find((c) => c.claim.id === claim.id)?.responses ?? [];
}

/**
 * A claim's menu: open it, export it, or submit it.
 * @param props - The section props, with the claim the menu is for.
 * @param props.claim - The claim; none for the visit's claim before it is made.
 * @param props.responses - The claim's responses, for whether it can still be submitted.
 * @returns The menu.
 */
function ClaimActions(
  props: VisitClaimsSectionProps & { readonly claim?: WithId<Claim>; readonly responses?: VisitClaim['responses'] }
): JSX.Element {
  const { claim, responses, canSubmit, submitting, onOpenClaim, onExport, onSubmit, onDiscard } = props;
  const editable = !claim || isClaimEditable(claim, responses ?? []);
  let submitNote: string | undefined;
  if (!canSubmit) {
    submitNote = 'Claim submission is not enabled for this project';
  } else if (!editable) {
    submitNote = 'This claim has already been submitted';
  }
  const comingSoon = (title: string, message: string) => () =>
    showNotification({ title, message: `Please contact sales to enable ${message} export`, color: 'blue' });

  return (
    <Menu position="bottom-end" shadow="md" width={220} withinPortal>
      <Menu.Target>
        <ActionIcon variant="subtle" color="gray" radius="xl" aria-label="Claim actions" loading={submitting}>
          <IconDots size={16} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        {claim && (
          <>
            <Menu.Item leftSection={<IconArrowRight size={14} />} onClick={() => onOpenClaim(claim.id)}>
              Open Claim
            </Menu.Item>
            <Menu.Item
              component={Link}
              to={`/Billing/Claims/all/${claim.id}`}
              leftSection={<IconExternalLink size={14} />}
            >
              Open in Billing
            </Menu.Item>
            <Menu.Divider />
          </>
        )}
        <Menu.Label>Export</Menu.Label>
        <Menu.Item leftSection={<IconFileText size={14} />} onClick={() => onExport(claim)}>
          CMS 1500 Form
        </Menu.Item>
        <Menu.Item leftSection={<IconFileText size={14} />} onClick={comingSoon('EDI X12', 'EDI X12')}>
          EDI X12
        </Menu.Item>
        <Menu.Item leftSection={<IconFileText size={14} />} onClick={comingSoon('NUCC Crosswalk', 'NUCC Crosswalk')}>
          NUCC Crosswalk CSV
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item
          leftSection={<IconSend size={14} />}
          disabled={!!submitNote || submitting}
          onClick={() => onSubmit(claim)}
        >
          Submit Claim
        </Menu.Item>
        {submitNote && (
          <Text size="xs" c="dimmed" px="sm" pb={6}>
            {submitNote}
          </Text>
        )}
        {claim && canDiscardClaim(claim, responses ?? []) && (
          <>
            <Menu.Divider />
            <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => onDiscard(claim)}>
              Discard Claim
            </Menu.Item>
          </>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}
