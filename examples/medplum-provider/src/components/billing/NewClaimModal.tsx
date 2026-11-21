// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Select, Stack, Text } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { createReference, formatDateTime, getReferenceString } from '@medplum/core';
import type { Claim, Encounter, Patient } from '@medplum/fhirtypes';
import { Modal, ResourceInput, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { showErrorNotification } from '../../utils/notifications';
import { getClaimEncounter } from './claimConditions';
import { createClaimFromEncounter, createRelatedClaim, findEncounterClaim } from './newClaim';

export interface NewClaimModalProps {
  readonly opened: boolean;
  readonly onClose: () => void;
  /** Called with the new claim. */
  readonly onCreated: (claim: WithId<Claim>) => void;
}

interface EncounterOption {
  readonly encounter: WithId<Encounter>;
  /** The encounter's open claim, if it has one. */
  readonly claimId?: string;
}

/**
 * Creates a claim from an encounter. Pick the patient, then the encounter to bill. An encounter that already has a claim
 * gets a new, related claim with the visit's details and diagnoses; its own claim is left as it is.
 * @param props - The NewClaimModal React props.
 * @returns The NewClaimModal React node.
 */
export function NewClaimModal(props: NewClaimModalProps): JSX.Element {
  const { opened, onClose, onCreated } = props;
  const medplum = useMedplum();
  const [patient, setPatient] = useState<WithId<Patient>>();
  const [options, setOptions] = useState<EncounterOption[]>();
  const [encounterId, setEncounterId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!patient) {
      return undefined;
    }
    let active = true;
    const load = async (): Promise<EncounterOption[]> => {
      // Every visit, newest first by the date the list shows, so one without a period isn't sorted out of place.
      const [encounters, claims] = await Promise.all([
        medplum.searchResources(
          'Encounter',
          { patient: getReferenceString(patient), _count: '1000' },
          { cache: 'no-cache' }
        ),
        medplum.searchResources(
          'Claim',
          { patient: getReferenceString(patient), status: 'active,draft', _count: '1000' },
          { cache: 'no-cache' }
        ),
      ]);
      return encounters
        .sort((a, b) => getEncounterDate(b).localeCompare(getEncounterDate(a)))
        .map((encounter) => ({
          encounter,
          claimId: claims.find((c) => getClaimEncounter(c)?.reference === getReferenceString(encounter))?.id,
        }));
    };
    load()
      .then((found) => {
        if (active) {
          setOptions(found);
          setEncounterId((found.find((o) => !o.claimId) ?? found[0])?.encounter.id ?? null);
        }
      })
      .catch(showErrorNotification);
    return () => {
      active = false;
    };
  }, [medplum, patient]);

  const close = (): void => {
    setPatient(undefined);
    setOptions(undefined);
    setEncounterId(null);
    onClose();
  };

  const selected = options?.find((o) => o.encounter.id === encounterId);

  const create = async (): Promise<void> => {
    if (!selected) {
      return;
    }
    setSaving(true);
    try {
      const visitClaim = await findEncounterClaim(medplum, selected.encounter);
      const claim = visitClaim
        ? await createRelatedClaim(medplum, visitClaim, createReference(selected.encounter))
        : await createClaimFromEncounter(medplum, selected.encounter);
      onCreated(claim);
      close();
    } catch (err) {
      showErrorNotification(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={close}
      title="New claim"
      actions={
        <Button disabled={!selected} loading={saving} onClick={create}>
          {selected?.claimId ? 'Create related claim' : 'Create claim'}
        </Button>
      }
    >
      <Stack gap="md">
        <ResourceInput<Patient>
          key={opened ? 'open' : 'closed'}
          resourceType="Patient"
          name="patient"
          label="Patient"
          required
          placeholder="Search patients"
          onChange={(value) => {
            setOptions(undefined);
            setEncounterId(null);
            setPatient(value as WithId<Patient> | undefined);
          }}
        />
        <Select
          label="Encounter"
          required
          placeholder={getEncounterPlaceholder(patient, options)}
          disabled={!options?.length}
          data={(options ?? []).map((o) => ({
            value: o.encounter.id,
            label: `${getEncounterLabel(o.encounter)}${o.claimId ? ' · has a claim' : ''}`,
          }))}
          value={encounterId}
          onChange={setEncounterId}
          searchable
          nothingFoundMessage="No matching encounters"
          comboboxProps={{ withinPortal: true }}
        />
        <Text size="xs" c="dimmed">
          {selected?.claimId
            ? "This encounter already has a claim. The new claim copies the visit's details and diagnoses and links to it; the visit's claim stays as it is."
            : "The claim's lines and diagnoses come from the encounter's charge items and diagnoses. Edit them on the claim."}
        </Text>
      </Stack>
    </Modal>
  );
}

function getEncounterDate(encounter: Encounter): string {
  return encounter.period?.start ?? encounter.meta?.lastUpdated ?? '';
}

function getEncounterLabel(encounter: Encounter): string {
  const date = getEncounterDate(encounter);
  const type =
    encounter.serviceType?.text ??
    encounter.serviceType?.coding?.[0]?.display ??
    encounter.type?.[0]?.text ??
    encounter.type?.[0]?.coding?.[0]?.display ??
    encounter.class?.display ??
    'Encounter';
  return [date ? formatDateTime(date) : undefined, type, encounter.status].filter(Boolean).join(' · ');
}

function getEncounterPlaceholder(patient: Patient | undefined, options: EncounterOption[] | undefined): string {
  if (!patient) {
    return 'Select a patient first';
  }
  return options?.length === 0 ? 'No encounters' : 'Select';
}
