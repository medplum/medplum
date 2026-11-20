// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Button, Group, Modal, Select, Stack, Text, Textarea } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { createReference, formatHumanName, normalizeErrorString } from '@medplum/core';
import type { CodeableConcept, Identifier, Patient, Practitioner, ServiceRequest } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';
import { buildReferral, findOpenReferralsToDoctor, getMyPatients } from '../referral';
import { ReferralReview } from './ReferralReview';

export interface ReferDialogProps {
  /** Name of the doctor being referred to, for the dialog title. */
  readonly doctorName: string;
  /** NPI identifier of the doctor being referred to, used to warn about existing open referrals to the same doctor. */
  readonly doctorIdentifier: Identifier;
  /** The doctor's primary specialty, used as the referral's performerType. */
  readonly specialty?: CodeableConcept;
  /** This referral's unique ID (made when the doctor was selected). */
  readonly referralId: string;
  /** The signed-in practitioner, whose patients are listed. */
  readonly me: WithId<Practitioner>;
  readonly onClose: () => void;
  /**
   * Called with the patient and the referral the user approved. The draft's performer is name-only (the doctor
   * isn't saved yet); the caller saves the doctor, swaps in the saved reference, and saves the rest unchanged.
   * Should resolve when done, or throw on failure.
   */
  readonly onSubmit: (patient: WithId<Patient>, approvedReferral: ServiceRequest) => Promise<void>;
}

/**
 * Two-step referral dialog: (1) choose one of my patients and a reason, (2) review the ServiceRequest and approve.
 * Nothing is saved until the user clicks Refer on the review step.
 * Render it only while a referral is in progress (it is always open while mounted).
 * @param props - The dialog props.
 * @returns The dialog.
 */
export function ReferDialog(props: ReferDialogProps): JSX.Element {
  const { doctorName, doctorIdentifier, specialty, referralId, me, onClose, onSubmit } = props;
  const medplum = useMedplum();
  const [patients, setPatients] = useState<WithId<Patient>[]>();
  const [patientId, setPatientId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  // Set when the user clicks Review: the exact ServiceRequest shown for approval.
  const [draft, setDraft] = useState<ServiceRequest>();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const [loadError, setLoadError] = useState<string>();
  // Result of the "already referred?" check for the selected patient.
  const [duplicateCheck, setDuplicateCheck] = useState<
    { state: 'checking' } | { state: 'failed' } | { state: 'done'; matches: WithId<ServiceRequest>[] }
  >();
  // The latest selected patient, so a slow check for a previously selected patient is ignored.
  const latestPatientId = useRef<string | null>(null);

  // Load "my patients" when the dialog opens. The parent mounts a fresh dialog for each referral,
  // so the form always starts empty.
  useEffect(() => {
    getMyPatients(medplum, me)
      .then(setPatients)
      .catch((err) => {
        setLoadError(normalizeErrorString(err));
        setPatients([]);
      });
  }, [medplum, me]);

  /**
   * When a patient is picked, check for open referrals from anyone to the same doctor (matched by NPI).
   * The check only warns; it never blocks submitting.
   * @param id - The selected patient id, or null when cleared.
   */
  function handlePatientChange(id: string | null): void {
    setPatientId(id);
    latestPatientId.current = id;
    const patient = patients?.find((p) => p.id === id);
    if (!patient) {
      setDuplicateCheck(undefined);
      return;
    }
    setDuplicateCheck({ state: 'checking' });
    findOpenReferralsToDoctor(medplum, patient, doctorIdentifier)
      .then((matches) => {
        if (latestPatientId.current === id) {
          setDuplicateCheck({ state: 'done', matches });
        }
      })
      .catch((err) => {
        console.error('Could not check for existing referrals', err);
        if (latestPatientId.current === id) {
          setDuplicateCheck({ state: 'failed' });
        }
      });
  }

  const duplicates = duplicateCheck?.state === 'done' ? duplicateCheck.matches : [];
  const selectedPatient = patients?.find((p) => p.id === patientId);

  // Step 1 -> 2: build the referral exactly as it will be saved, but with a name-only performer.
  function handleReview(): void {
    if (!selectedPatient) {
      return;
    }
    setError(undefined);
    setDraft(
      buildReferral({
        referralId,
        subject: createReference(selectedPatient),
        requester: createReference(me),
        performer: { display: doctorName },
        specialty,
        reason,
      })
    );
  }

  // Step 2: the user approved the draft.
  async function handleRefer(): Promise<void> {
    if (!selectedPatient || !draft) {
      return;
    }
    setSubmitting(true);
    setError(undefined);
    try {
      await onSubmit(selectedPatient, draft);
    } catch (err) {
      setError(normalizeErrorString(err));
    } finally {
      setSubmitting(false);
    }
  }

  const duplicateAlert = duplicates.length > 0 && (
    <Alert color="yellow" title="Already referred">
      <Text size="sm" mb={4}>
        {formatHumanName(selectedPatient?.name?.[0])} already has {duplicates.length} open referral
        {duplicates.length === 1 ? '' : 's'} to {doctorName}:
      </Text>
      {duplicates.map((d) => (
        <Text size="sm" key={d.id}>
          • {d.authoredOn ? new Date(d.authoredOn).toLocaleDateString() : 'Unknown date'} by{' '}
          {d.requester?.display ?? 'unknown'}, status {d.status}
          {d.note?.[0]?.text ? `, "${d.note[0].text}"` : ''}
        </Text>
      ))}
    </Alert>
  );

  const errorAlert = error && (
    <Alert color="red" title="Could not create referral">
      {error}
    </Alert>
  );

  // Step 2: review and approve
  if (draft && selectedPatient) {
    return (
      <Modal opened onClose={onClose} size="lg">
        <Stack gap="sm">
          <ReferralReview referral={draft} patient={selectedPatient} />
          {duplicateAlert}
          {errorAlert}
          <Text size="xs" c="dimmed">
            Refer saves the doctor and this referral to Medplum.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDraft(undefined)} disabled={submitting}>
              Back
            </Button>
            <Button onClick={() => handleRefer().catch(console.error)} loading={submitting}>
              {duplicates.length > 0 ? 'Send another referral' : 'Refer'}
            </Button>
          </Group>
        </Stack>
      </Modal>
    );
  }

  return (
    <Modal opened onClose={onClose} title={`Refer to ${doctorName}`}>
      <Stack gap="sm">
        {patients?.length === 0 && !loadError && (
          <Alert color="orange" title="No patients assigned to you">
            Only patients whose general practitioner is you are listed.
          </Alert>
        )}
        <Select
          label="Patient"
          placeholder={patients ? 'Select one of your patients' : 'Loading your patients...'}
          error={loadError ? `Couldn't load your patients: ${loadError}` : undefined}
          data={(patients ?? []).map((p) => ({
            value: p.id,
            label: `${formatHumanName(p.name?.[0])}${p.birthDate ? ` (DOB ${p.birthDate})` : ''}`,
          }))}
          value={patientId}
          onChange={handlePatientChange}
          disabled={!patients || patients.length === 0}
          searchable
          comboboxProps={{ withinPortal: false }}
        />
        {duplicateCheck?.state === 'checking' && (
          <Text size="xs" c="dimmed">
            Checking for existing referrals...
          </Text>
        )}
        {duplicateCheck?.state === 'failed' && (
          <Text size="xs" c="dimmed">
            Couldn't check for existing referrals. You can still continue.
          </Text>
        )}
        {duplicateAlert}
        <Textarea
          label="Reason (optional)"
          value={reason}
          onChange={(e) => setReason(e.currentTarget.value)}
          autosize
          minRows={2}
        />
        {errorAlert}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleReview} disabled={!selectedPatient}>
            Review referral
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
