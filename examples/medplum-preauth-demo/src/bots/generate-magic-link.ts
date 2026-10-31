// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { BotEvent, MedplumClient } from '@medplum/core';
import { createReference } from '@medplum/core';
import { DEMO_TAG, SIGNER_ACCESS_POLICY_NAME } from '../constants';

interface MagicLinkInput {
  patientId: string;
}

interface MagicLinkOutput {
  preAuthorizedCode: string;
  expiresAt: string;
  clientId: string;
}

export async function handler(medplum: MedplumClient, event: BotEvent<MagicLinkInput>): Promise<MagicLinkOutput> {
  const { patientId } = event.input;
  const clientId = event.secrets['CLIENT_ID']?.valueString;

  if (!patientId) {
    throw new Error('Missing required input: patientId');
  }

  if (!clientId) {
    throw new Error('Bot secret CLIENT_ID is not configured.');
  }

  const patientReference = `Patient/${patientId}`;

  // This bot runs as Project Admin, and anyone who can read Bots can execute it, so it only issues links for the
  // tagged demo patient. That also keeps it from replacing the access policy on a real patient's membership.
  const patient = await medplum.readResource('Patient', patientId);
  if (!patient.meta?.tag?.some((tag) => tag.system === DEMO_TAG.system && tag.code === DEMO_TAG.code)) {
    throw new Error(`${patientReference} is not the demo patient (missing the ${DEMO_TAG.code} tag)`);
  }

  const accessPolicy = await medplum.searchOne('AccessPolicy', { name: SIGNER_ACCESS_POLICY_NAME });
  if (!accessPolicy) {
    throw new Error(`AccessPolicy "${SIGNER_ACCESS_POLICY_NAME}" not found. Run npm run build:bots.`);
  }
  const accessPolicyReference = createReference(accessPolicy);

  // Ensure the patient has a ProjectMembership, scoped to the signer AccessPolicy, so the pre-authorized code
  // can be issued on their behalf. If the Patient resource exists but has no auth identity, invite them on demand.
  const membership = await medplum.searchOne('ProjectMembership', { profile: patientReference });

  if (!membership) {
    const projectId = patient.meta?.project;
    if (!projectId) {
      throw new Error(`Could not determine project for ${patientReference}`);
    }
    const firstName = patient.name?.[0]?.given?.[0];
    const lastName = patient.name?.[0]?.family;
    if (!firstName || !lastName) {
      throw new Error(`${patientReference} must have a given and family name to create a login`);
    }
    await medplum.invite(projectId, {
      resourceType: 'Patient',
      firstName,
      lastName,
      // An invite needs an email or an externalId. The demo patient has no email, so use its ID.
      externalId: patientId,
      membership: { profile: { reference: patientReference }, accessPolicy: accessPolicyReference },
    });
  } else if (membership.accessPolicy?.reference !== accessPolicyReference.reference) {
    await medplum.updateResource({ ...membership, accessPolicy: accessPolicyReference });
  }

  const result = await medplum.post(
    'auth/preauthorize',
    { clientId, scope: 'openid', expiresIn: 3600 },
    'application/json',
    {
      headers: { 'X-Medplum-On-Behalf-Of': patientReference },
    }
  );

  return {
    preAuthorizedCode: result.preAuthorizedCode,
    expiresAt: result.expiresAt,
    clientId,
  };
}
