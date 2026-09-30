// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Practitioner } from '@medplum/fhirtypes';
import { useMedplum, useSearchOne, useStabilizedCallback } from '@medplum/react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { CANDID_CREATE_PROVIDER_BOT_IDENTIFIER, CANDID_EDIT_PROVIDER_BOT_IDENTIFIER } from '../../utils/candid';
import { showErrorNotification } from '../../utils/notifications';
import { CandidBillingPractitionerList } from './CandidBillingPractitionerList';
import { CandidBillingPractitionerModal } from './CandidBillingPractitionerModal';

/**
 * Props for the billing practitioners tab. `resourceId` mirrors the URL: the ID of the practitioner whose modal
 * is open. The tab never navigates itself but calls `onNavigate` with the ID the URL should move to, or none to
 * close the modal.
 */
export interface BillingPractitionersTabProps {
  readonly resourceId?: string;
  readonly onNavigate: (resourceId?: string) => void;
}

export function CandidBillingPractitioners(props: BillingPractitionersTabProps): JSX.Element {
  const { resourceId, onNavigate } = props;
  const medplum = useMedplum();
  const [createBot] = useSearchOne('Bot', {
    identifier: `${CANDID_CREATE_PROVIDER_BOT_IDENTIFIER.system}|${CANDID_CREATE_PROVIDER_BOT_IDENTIFIER.value}`,
  });
  const [editBot] = useSearchOne('Bot', {
    identifier: `${CANDID_EDIT_PROVIDER_BOT_IDENTIFIER.system}|${CANDID_EDIT_PROVIDER_BOT_IDENTIFIER.value}`,
  });
  const navigate = useStabilizedCallback(onNavigate);
  const [savedVersion, setSavedVersion] = useState(0);
  const [editing, setEditing] = useState<WithId<Practitioner> | undefined>(undefined);
  const open = resourceId !== undefined && editing?.id === resourceId ? editing : undefined;

  useEffect(() => {
    if (!resourceId || open?.id === resourceId) {
      return undefined;
    }
    let active = true;
    medplum
      .readResource('Practitioner', resourceId)
      .then((practitioner) => {
        if (active) {
          setEditing(practitioner);
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
  }, [medplum, navigate, resourceId, open]);

  return (
    <>
      <CandidBillingPractitionerList
        savedVersion={savedVersion}
        onSelectPractitioner={(practitioner) => {
          setEditing(practitioner);
          onNavigate(practitioner.id);
        }}
      />
      <CandidBillingPractitionerModal
        candidCreateBotId={createBot?.id}
        candidEditBotId={editBot?.id}
        practitioner={open}
        onClose={() => onNavigate()}
        onSaved={() => {
          setEditing(undefined);
          setSavedVersion((version) => version + 1);
        }}
      />
    </>
  );
}
