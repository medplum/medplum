// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { BotEvent, MedplumClient } from '@medplum/core';
import type { Patient } from '@medplum/fhirtypes';

interface MagicLinkInput {
  patientId: string;
  questionnaireId: string;
}

interface MagicLinkOutput {
  preAuthorizedCode: string;
  expiresAt: string;
  clientId: string;
}

export async function handler(medplum: MedplumClient, event: BotEvent<MagicLinkInput>): Promise<MagicLinkOutput> {
  const { patientId } = event.input;
  const clientId = event.secrets['CLIENT_ID']?.valueString;

  if (!clientId) {
    throw new Error('Bot secret CLIENT_ID is not configured.');
  }

  // Ensure the patient has a ProjectMembership so the pre-authorized code can be issued on their behalf.
  // If Patient resource exists, but no auth identity, create a User and ProjectMembership on demand.
  const membershipBundle = (await medplum.get(
    medplum.fhirUrl('ProjectMembership') + `?profile=Patient/${patientId}`
  )) as { entry?: unknown[] };

  if (!membershipBundle.entry?.length) {
    const patient = (await medplum.readResource('Patient', patientId)) as Patient;
    const projectId = patient.meta?.project;
    if (!projectId) {
      throw new Error(`Could not determine project for Patient/${patientId}`);
    }
    const given = patient.name?.[0]?.given?.[0] ?? 'Unknown';
    const family = patient.name?.[0]?.family ?? 'Unknown';
    // In production, explicitly pass an accessPolicy here to scope the patient's token to their own data.
    // e.g. membership: { profile: ..., accessPolicy: { reference: 'AccessPolicy/<id>' } }
    // Default patient access policy is not automatically applied to admin invites (https://github.com/medplum/medplum/issues/8843)
    await medplum.post(`admin/projects/${projectId}/invite`, {
      resourceType: 'Patient',
      firstName: given,
      lastName: family,
      externalId: patientId,
      membership: { profile: { reference: `Patient/${patientId}` } },
    });
  }

  const result = (await medplum.post(
    'auth/preauthorize',
    { clientId, scope: 'openid', expiresIn: 3600 },
    'application/json',
    { headers: { 'X-Medplum-On-Behalf-Of': `Patient/${patientId}` } }
  )) as { preAuthorizedCode: string; expiresAt: string };

  return {
    preAuthorizedCode: result.preAuthorizedCode,
    expiresAt: result.expiresAt,
    clientId,
  };
}
