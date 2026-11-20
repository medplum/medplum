// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Loader, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { ContentType, createReference, formatHumanName, normalizeErrorString } from '@medplum/core';
import type { Bundle, Patient, Practitioner, ServiceRequest } from '@medplum/fhirtypes';
import { Document, useMedplum, useMedplumProfile, useSearchOne } from '@medplum/react';
import type { JSX } from 'react';
import { useState } from 'react';
import classes from './HomePage.module.css';
import { PractitionerCard } from '../components/PractitionerCard';
import { PractitionerSearchForm } from '../components/PractitionerSearchForm';
import { ReferDialog } from '../components/ReferDialog';
import { cleanSearch, formatDisplayName, readPractitionerBundle, savePractitionerAndRole } from '../practitioners';
import { saveReferral } from '../referral';
import type { PractitionerResult, PractitionerSearch } from '../practitioners';

/**
 * Exact name of the deployed lookup Bot (examples/medplum-demo-bots/src/nppes-lookup.ts).
 * Override with MEDPLUM_NPPES_BOT_NAME in .env.
 */
const BOT_NAME: string = import.meta.env.MEDPLUM_NPPES_BOT_NAME || 'nppes-lookup';

/** The doctor the user clicked "Select" on, plus this referral's unique ID. */
interface ReferTarget {
  result: PractitionerResult;
  name: string;
  referralId: string;
}

/**
 * Signed-in practitioner looks up another practitioner through the nppes-lookup bot, which returns FHIR
 * Practitioner + PractitionerRole resources. Each result is shown as a card, and the user can refer one of their
 * patients to that practitioner.
 * @returns The home page.
 */
export function HomePage(): JSX.Element {
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const [bot, botLoading] = useSearchOne('Bot', { 'name:exact': BOT_NAME });
  const [loading, setLoading] = useState(false);
  const [lookup, setLookup] = useState<{ results: PractitionerResult[]; skipped: string[] }>();
  const [error, setError] = useState<string>();
  const [referTarget, setReferTarget] = useState<ReferTarget>();
  const [referralNote, setReferralNote] = useState<string>();

  if (profile?.resourceType !== 'Practitioner') {
    return (
      <Document>
        <Alert color="orange" title="Sign in as a practitioner">
          This demo is for practitioners. You are signed in as a {profile?.resourceType ?? 'unknown profile'}.
        </Alert>
      </Document>
    );
  }
  const me = profile as WithId<Practitioner>;

  async function handleSearch(search: PractitionerSearch): Promise<void> {
    if (!bot) {
      return;
    }
    setLoading(true);
    setLookup(undefined);
    setError(undefined);
    setReferralNote(undefined);
    try {
      // POST /fhir/R4/Bot/{id}/$execute; Medplum passes the JSON body to the bot as event.input.
      // The bot returns a FHIR searchset Bundle of Practitioner + PractitionerRole.
      const bundle = (await medplum.executeBot(bot.id, cleanSearch(search), ContentType.JSON)) as Bundle;
      setLookup(readPractitionerBundle(bundle));
    } catch (err) {
      // The bot threw: bad input (e.g. a 9-digit NPI) or NPPES rejected the search (e.g. state alone).
      // Medplum returns an OperationOutcome, which the client throws.
      setError(normalizeErrorString(err));
    } finally {
      setLoading(false);
    }
  }

  /**
   * Runs when the user approves the reviewed referral:
   * 1. Save the doctor (Practitioner + PractitionerRole, update-or-create by the bot's identifiers).
   * 2. Save the approved referral unchanged, except performer now points at the saved role
   *    (conditional create by referral ID, so a retry doesn't duplicate it).
   * @param patient - The chosen patient.
   * @param approvedReferral - The ServiceRequest shown on the review step.
   */
  async function handleReferSubmit(patient: WithId<Patient>, approvedReferral: ServiceRequest): Promise<void> {
    if (!referTarget) {
      return;
    }
    const { practitioner, role } = await savePractitionerAndRole(medplum, referTarget.result);
    const referral = await saveReferral(medplum, {
      ...approvedReferral,
      performer: [{ ...createReference(role), display: referTarget.name }],
    });
    console.log('Saved Practitioner:', practitioner);
    console.log('Saved PractitionerRole:', role);
    console.log('Saved referral ServiceRequest:', referral);
    setReferralNote(
      `Referred ${formatHumanName(patient.name?.[0])} to ${referTarget.name} (ServiceRequest/${referral.id}). ` +
        'Details are in the browser console.'
    );
    setReferTarget(undefined);
  }

  return (
    <Document width={1000}>
      <Stack gap="lg">
        <div>
          <Title order={2}>Look up a practitioner</Title>
          <Text c="dimmed">Signed in as {formatHumanName(me.name?.[0])}</Text>
        </div>

        {botLoading && <Loader size="sm" />}
        {!botLoading && !bot && (
          <Alert color="orange" title={`No Bot named "${BOT_NAME}" found`}>
            Deploy the lookup bot to this project. See the README.
          </Alert>
        )}

        {referralNote && (
          <Alert color="green" title="Referral saved" withCloseButton onClose={() => setReferralNote(undefined)}>
            {referralNote}
          </Alert>
        )}

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
          <Paper withBorder p="md">
            <PractitionerSearchForm
              loading={loading}
              disabled={!bot}
              onSubmit={(search) => handleSearch(search).catch(console.error)}
            />
          </Paper>
          <Paper withBorder className={classes.results}>
            <div className={classes.resultsScroll}>
              {error && (
                <Alert color="red" title="Lookup failed">
                  {error}
                </Alert>
              )}
              {lookup && (
                <Stack gap="sm">
                  <Text size="sm" c="dimmed">
                    {lookup.results.length} result(s)
                  </Text>
                  {lookup.results.map((r) => (
                    <PractitionerCard
                      key={r.npiIdentifier.value}
                      practitioner={r.practitioner}
                      role={r.role}
                      onRefer={() =>
                        setReferTarget({
                          result: r,
                          name: formatDisplayName(r.practitioner.name?.[0]),
                          referralId: crypto.randomUUID(),
                        })
                      }
                    />
                  ))}
                  {lookup.skipped.map((message) => (
                    <Text key={message} size="xs" c="dimmed">
                      {message}
                    </Text>
                  ))}
                </Stack>
              )}
              {!error && !lookup && <Text c="dimmed">Matching practitioners will appear here.</Text>}
            </div>
          </Paper>
        </SimpleGrid>
      </Stack>

      {referTarget && (
        <ReferDialog
          key={referTarget.referralId}
          doctorName={referTarget.name}
          doctorIdentifier={referTarget.result.npiIdentifier}
          specialty={referTarget.result.role.specialty?.[0]}
          referralId={referTarget.referralId}
          me={me}
          onClose={() => setReferTarget(undefined)}
          onSubmit={handleReferSubmit}
        />
      )}
    </Document>
  );
}
