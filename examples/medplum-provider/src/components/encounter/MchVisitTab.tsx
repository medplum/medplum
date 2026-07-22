// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Card, Group, SimpleGrid, Stack, Text } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import { formatCodeableConcept, formatDate, getReferenceString } from '@medplum/core';
import type { Encounter, Flag, Observation, Patient, QuestionnaireResponse } from '@medplum/fhirtypes';
import { QuestionnaireForm, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { ANC_VISIT_QUESTIONNAIRE } from '../../questionnaires/mch/ancVisitQuestionnaire';
import { MCH_CODE_SYSTEM } from '../../utils/mch';
import { ANC_DANGER_SIGN_CODES, ANC_OBSERVATION_CODES, saveAncVisitResponse } from '../../utils/mch-visit-utils';
import { showErrorNotification } from '../../utils/notifications';

interface MchVisitTabProps {
  patient: WithId<Patient>;
  encounter: WithId<Encounter>;
}

const SECTION_LABELS = ['ANC', 'PNC', 'Child growth', 'Immunization', 'Labor & delivery'];

export function MchVisitTab(props: MchVisitTabProps): JSX.Element {
  const { patient, encounter } = props;
  const medplum = useMedplum();
  const [saving, setSaving] = useState(false);
  const [loadingAncData, setLoadingAncData] = useState(false);
  const [ancObservations, setAncObservations] = useState<Observation[]>([]);
  const [dangerFlags, setDangerFlags] = useState<Flag[]>([]);
  const [savedAt, setSavedAt] = useState<string | undefined>();
  const visitType = encounter.type?.[0]?.text ?? encounter.type?.[0]?.coding?.[0]?.display ?? 'MCH visit';
  const pregnancyEpisode = encounter.episodeOfCare?.[0];
  const mchTypeCode = encounter.type?.[0]?.coding?.find((coding) => coding.system === MCH_CODE_SYSTEM)?.code;
  const isAncVisit = mchTypeCode === 'anc-initial' || mchTypeCode === 'anc-follow-up';

  const loadAncData = useCallback(async (): Promise<void> => {
    if (!isAncVisit) {
      setAncObservations([]);
      setDangerFlags([]);
      return;
    }
    setLoadingAncData(true);
    try {
      const encounterReference = getReferenceString(encounter);
      const [observations, flags] = await Promise.all([
        medplum.searchResources('Observation', `encounter=${encounterReference}&_sort=-_lastUpdated`, {
          cache: 'no-cache',
        }),
        medplum.searchResources('Flag', `encounter=${encounterReference}&status=active&_sort=-_lastUpdated`, {
          cache: 'no-cache',
        }),
      ]);
      setAncObservations(
        observations.filter((observation) =>
          observation.code.coding?.some((coding) => coding.system === 'http://loinc.org' && ANC_OBSERVATION_CODES.has(coding.code ?? ''))
        )
      );
      setDangerFlags(
        flags.filter((flag) =>
          flag.code.coding?.some((coding) => coding.system === 'http://snomed.info/sct' && ANC_DANGER_SIGN_CODES.has(coding.code ?? ''))
        )
      );
    } catch (error) {
      showErrorNotification(error);
    } finally {
      setLoadingAncData(false);
    }
  }, [encounter, isAncVisit, medplum]);

  useEffect(() => {
    loadAncData().catch(showErrorNotification);
  }, [loadAncData]);

  const handleAncSubmit = async (response: QuestionnaireResponse): Promise<void> => {
    setSaving(true);
    try {
      await saveAncVisitResponse(medplum, patient, encounter, response);
      setSavedAt(new Date().toISOString());
      await loadAncData();
      showNotification({ color: 'green', title: 'ANC visit saved', message: 'Measurements were added to the visit.' });
    } catch (error) {
      showErrorNotification(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack gap="md">
      <Card withBorder shadow="sm">
        <Group justify="space-between" align="flex-start">
          <Stack gap={4}>
            <Text fw={700} size="lg">
              {visitType}
            </Text>
            <Text size="sm" c="dimmed">
              {pregnancyEpisode?.display ?? pregnancyEpisode?.reference ?? 'No pregnancy episode linked'}
            </Text>
          </Stack>
          <Badge variant="light" color="teal">
            MCH
          </Badge>
        </Group>
      </Card>

      {isAncVisit && (
        <Card withBorder shadow="sm">
          <Stack gap="md">
            <Group justify="space-between" align="center">
              <Text fw={700}>ANC assessment</Text>
              {savedAt && (
                <Badge variant="light" color="green">
                  Saved
                </Badge>
              )}
            </Group>
            <QuestionnaireForm questionnaire={ANC_VISIT_QUESTIONNAIRE} onSubmit={handleAncSubmit} disabled={saving} />
          </Stack>
        </Card>
      )}

      {isAncVisit && (
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          <Card withBorder shadow="sm">
            <Stack gap="sm">
              <Group justify="space-between" align="center">
                <Text fw={700}>Recorded ANC measurements</Text>
                {loadingAncData && <Badge variant="light">Loading</Badge>}
              </Group>
              {ancObservations.length === 0 ? (
                <Text size="sm" c="dimmed">
                  No ANC measurements recorded yet.
                </Text>
              ) : (
                ancObservations.map((observation) => (
                  <Group key={observation.id ?? `${formatCodeableConcept(observation.code)}-${observation.effectiveDateTime}`} justify="space-between" align="flex-start" wrap="nowrap">
                    <Stack gap={0} flex={1}>
                      <Text size="sm" fw={600}>
                        {formatCodeableConcept(observation.code)}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {formatDate(observation.effectiveDateTime ?? observation.meta?.lastUpdated)}
                      </Text>
                    </Stack>
                    <Text size="sm">{formatObservationValue(observation)}</Text>
                  </Group>
                ))
              )}
            </Stack>
          </Card>

          <Card withBorder shadow="sm">
            <Stack gap="sm">
              <Text fw={700}>Active ANC danger signs</Text>
              {dangerFlags.length === 0 ? (
                <Text size="sm" c="dimmed">
                  No active ANC danger signs recorded.
                </Text>
              ) : (
                dangerFlags.map((flag) => (
                  <Group key={flag.id ?? formatCodeableConcept(flag.code)} justify="space-between" align="flex-start" wrap="nowrap">
                    <Stack gap={0} flex={1}>
                      <Text size="sm" fw={600}>
                        {formatCodeableConcept(flag.code)}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {formatDate(flag.period?.start ?? flag.meta?.lastUpdated)}
                      </Text>
                    </Stack>
                    <Badge color="red" variant="light">
                      Active
                    </Badge>
                  </Group>
                ))
              )}
            </Stack>
          </Card>
        </SimpleGrid>
      )}

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
        {SECTION_LABELS.filter((label) => !isAncVisit || label !== 'ANC').map((label) => (
          <Card key={label} withBorder shadow="sm">
            <Stack gap={4}>
              <Text fw={600}>{label}</Text>
              <Text size="sm" c="dimmed">
                Not recorded for this visit
              </Text>
            </Stack>
          </Card>
        ))}
      </SimpleGrid>
    </Stack>
  );
}

function formatObservationValue(observation: Observation): string {
  if (observation.valueQuantity) {
    const value = observation.valueQuantity.value ?? '';
    const unit = observation.valueQuantity.unit ?? observation.valueQuantity.code ?? '';
    return `${value} ${unit}`.trim();
  }
  if (observation.valueInteger !== undefined) {
    return String(observation.valueInteger);
  }
  if (observation.valueDateTime) {
    return formatDate(observation.valueDateTime);
  }
  return observation.valueString ?? 'Recorded';
}
