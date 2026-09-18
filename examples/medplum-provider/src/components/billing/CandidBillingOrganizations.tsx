// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { notifications } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import type { Organization } from '@medplum/fhirtypes';
import { useMedplum, useSearchOne, useStabilizedCallback } from '@medplum/react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { NEW_BILLING_ORGANIZATION_ID } from '../../utils/billing';
import { CANDID_CREATE_PROVIDER_BOT_IDENTIFIER, CANDID_EDIT_PROVIDER_BOT_IDENTIFIER } from '../../utils/candid';
import { showErrorNotification } from '../../utils/notifications';
import { CandidBillingOrganizationList } from './CandidBillingOrganizationList';
import { CandidBillingOrganizationModal } from './CandidBillingOrganizationModal';

/**
 * Props for the billing organizations tab. `resourceId` mirrors the URL: the ID of the organization whose modal
 * is open, or `NEW_BILLING_ORGANIZATION_ID` for the new organization modal. The tab never navigates itself but
 * calls `onNavigate` with the ID the URL should move to, or none to close the modal.
 */
export interface BillingOrganizationsTabProps {
  readonly resourceId?: string;
  readonly onNavigate: (resourceId?: string) => void;
}

export function CandidBillingOrganizations(props: BillingOrganizationsTabProps): JSX.Element {
  const { resourceId, onNavigate } = props;
  const medplum = useMedplum();
  const [createBot, , createBotOutcome] = useSearchOne('Bot', {
    identifier: `${CANDID_CREATE_PROVIDER_BOT_IDENTIFIER.system}|${CANDID_CREATE_PROVIDER_BOT_IDENTIFIER.value}`,
  });
  const [editBot] = useSearchOne('Bot', {
    identifier: `${CANDID_EDIT_PROVIDER_BOT_IDENTIFIER.system}|${CANDID_EDIT_PROVIDER_BOT_IDENTIFIER.value}`,
  });
  const navigate = useStabilizedCallback(onNavigate);
  const newOrganization = resourceId === NEW_BILLING_ORGANIZATION_ID;
  const linkedId = newOrganization ? undefined : resourceId;
  const [savedVersion, setSavedVersion] = useState(0);
  const [editing, setEditing] = useState<WithId<Organization> | undefined>(undefined);
  const open = linkedId !== undefined && editing?.id === linkedId ? editing : undefined;
  const createBotMissing = createBotOutcome !== undefined && createBot === undefined;

  useEffect(() => {
    if (newOrganization && createBotMissing) {
      notifications.show({
        color: 'yellow',
        title: 'Cannot create a billing organization',
        message:
          'The Candid create-provider bot is not deployed in this project, so billing organizations cannot be created here.',
      });
      navigate();
    }
  }, [navigate, newOrganization, createBotMissing]);

  useEffect(() => {
    if (!linkedId || open?.id === linkedId) {
      return undefined;
    }
    let active = true;
    medplum
      .readResource('Organization', linkedId)
      .then((organization) => {
        if (active) {
          setEditing(organization);
        }
      })
      .catch((err) => {
        if (active) {
          showErrorNotification(err);
          navigate();
        }
      });
    return () => {
      active = false;
    };
  }, [medplum, navigate, linkedId, open]);

  return (
    <>
      <CandidBillingOrganizationList
        candidBotId={createBot?.id}
        savedVersion={savedVersion}
        onNewOrganization={() => onNavigate(NEW_BILLING_ORGANIZATION_ID)}
        onSelectOrganization={(organization) => {
          setEditing(organization);
          onNavigate(organization.id);
        }}
      />
      <CandidBillingOrganizationModal
        candidCreateBotId={createBot?.id}
        candidEditBotId={editBot?.id}
        organization={open}
        opened={(newOrganization && createBot !== undefined) || open !== undefined}
        onClose={() => onNavigate()}
        onSaved={() => {
          setEditing(undefined);
          setSavedVersion((version) => version + 1);
        }}
      />
    </>
  );
}
