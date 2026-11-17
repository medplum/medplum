// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Divider, Group, Paper, Stack, Text } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { getReferenceString } from '@medplum/core';
import type { Condition, Encounter, EncounterDiagnosis, Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconPlus } from '@tabler/icons-react';
import type { JSX } from 'react';
import { Fragment, useEffect, useState } from 'react';
import { findExistingPatientCondition } from '../../utils/encounter';
import { showErrorNotification } from '../../utils/notifications';
import ConditionItem from './ConditionItem';
import ConditionModal from './ConditionModal';
import ExistingConditionModal from './ExistingConditionModal';

interface ConditionListProps {
  patient: WithId<Patient>;
  encounter: Encounter;
  conditions: Condition[] | undefined;
  setConditions: (conditions: Condition[]) => void;
  onDiagnosisChange: (diagnosis: EncounterDiagnosis[]) => void;
}

const ALREADY_ON_ENCOUNTER = 'This diagnosis is already on the encounter';

export const ConditionList = (props: ConditionListProps): JSX.Element => {
  const { patient, encounter, conditions, setConditions, onDiagnosisChange } = props;
  const linkedCodes = (conditions ?? []).flatMap((c) => c.code?.coding?.flatMap((coding) => coding.code ?? []) ?? []);
  const medplum = useMedplum();
  const [opened, setOpened] = useState(false);
  const [existingOpened, setExistingOpened] = useState(false);

  useEffect(() => {
    const fetchConditions = async (): Promise<void> => {
      if (!encounter) {
        return;
      }

      const diagnosisReferences = encounter.diagnosis?.map((d) => d.condition?.reference).filter(Boolean) || [];
      const conditionsResult = await Promise.all(
        diagnosisReferences.map((ref) => medplum.readReference({ reference: ref }))
      );

      if (conditionsResult.length > 0 && encounter?.diagnosis) {
        const diagnosisMap = new Map<string, number>();

        const diagnosisReferences = encounter.diagnosis?.map((d) => d.condition?.reference) || [];
        const conditionsInDiagnosis = conditionsResult.filter((condition) =>
          diagnosisReferences.includes(getReferenceString(condition))
        );

        encounter.diagnosis.forEach((diagnosis, index) => {
          if (diagnosis.condition?.reference) {
            diagnosisMap.set(diagnosis.condition.reference, diagnosis.rank || index);
          }
        });

        conditionsInDiagnosis.sort((a, b) => {
          const aRef = getReferenceString(a);
          const bRef = getReferenceString(b);

          if (diagnosisMap.has(aRef) && diagnosisMap.has(bRef)) {
            const aValue = diagnosisMap.get(aRef) ?? 0;
            const bValue = diagnosisMap.get(bRef) ?? 0;
            return aValue - bValue;
          }

          if (diagnosisMap.has(aRef)) {
            return -1;
          }

          if (diagnosisMap.has(bRef)) {
            return 1;
          }

          return 0;
        });

        setConditions(conditionsInDiagnosis as Condition[]);
      }
    };

    fetchConditions().catch((err) => showErrorNotification(err));
  }, [encounter, medplum, setConditions]);

  /*
   * Re-orders the conditions in the conditions array and updates the encounter diagnosis.
   */
  const handleUpdateDiagnosis = async (condition: Condition, value: string): Promise<void> => {
    if (!conditions || conditions.length === 0 || !encounter) {
      return;
    }

    const newRank = Number(value);
    const maxAllowedRank = conditions.length;
    const validRank = Math.max(1, Math.min(newRank, maxAllowedRank));

    const updatedConditions = [...conditions];
    const conditionIndex = updatedConditions.findIndex((c) => getReferenceString(c) === getReferenceString(condition));

    if (conditionIndex === -1) {
      return;
    }

    const conditionToMove = updatedConditions.splice(conditionIndex, 1)[0];
    updatedConditions.splice(validRank - 1, 0, conditionToMove);
    setConditions(updatedConditions);
    onDiagnosisChange(
      updatedConditions.map((c, index) => ({
        condition: { reference: `Condition/${c.id}` },
        rank: index + 1,
      }))
    );
  };

  const handleRemoveDiagnosis = (condition: Condition): void => {
    if (!conditions) {
      return;
    }

    const reindexedDiagnosis = (encounter.diagnosis ?? [])
      .filter((d) => d.condition?.reference !== getReferenceString(condition))
      .map((d, index) => ({ ...d, rank: index + 1 }));

    setConditions(conditions.filter((c) => c.id !== condition.id));
    onDiagnosisChange(reindexedDiagnosis);
  };

  const handleConditionSubmit = async (condition: Condition): Promise<void> => {
    try {
      if (condition.code?.coding?.some((coding) => coding.code && linkedCodes.includes(coding.code))) {
        showErrorNotification(ALREADY_ON_ENCOUNTER);
        return;
      }

      const resolved =
        (condition.code && (await findExistingPatientCondition(medplum, encounter, condition.code))) ||
        (await medplum.createResource(condition));
      linkCondition(resolved);
    } catch (err) {
      showErrorNotification(err);
    } finally {
      setOpened(false);
    }
  };

  const handleExistingSubmit = (condition: WithId<Condition>): void => {
    linkCondition(condition);
    setExistingOpened(false);
  };

  const linkCondition = (condition: WithId<Condition>): void => {
    const diagnosis = encounter.diagnosis ?? [];
    setConditions([...(conditions ?? []), condition]);
    onDiagnosisChange([
      ...diagnosis,
      { condition: { reference: getReferenceString(condition) }, rank: diagnosis.length + 1 },
    ]);
  };

  return (
    <>
      <Stack gap="xs">
        <Group justify="space-between">
          <Text fw={600} size="lg">
            Diagnoses ({conditions?.length ?? 0})
          </Text>
          <Group gap="xs">
            <Button
              variant="light"
              size="xs"
              leftSection={<IconPlus size={14} />}
              onClick={() => setExistingOpened(true)}
            >
              Add Existing
            </Button>
            <Button variant="light" size="xs" leftSection={<IconPlus size={14} />} onClick={() => setOpened(true)}>
              Add New
            </Button>
          </Group>
        </Group>

        <Paper withBorder>
          {conditions && conditions.length > 0 ? (
            conditions.map((condition, idx) => (
              <Fragment key={condition.id ?? idx}>
                {idx > 0 && <Divider />}
                <ConditionItem
                  condition={condition}
                  rank={idx + 1}
                  total={conditions.length}
                  onChange={handleUpdateDiagnosis}
                  onRemove={handleRemoveDiagnosis}
                />
              </Fragment>
            ))
          ) : (
            <Text size="sm" c="dimmed" px="md" py="sm">
              No diagnoses
            </Text>
          )}
        </Paper>
      </Stack>
      <ConditionModal
        opened={opened}
        onClose={() => setOpened(false)}
        patient={patient}
        encounter={encounter}
        onSubmit={handleConditionSubmit}
      />
      <ExistingConditionModal
        opened={existingOpened}
        onClose={() => setExistingOpened(false)}
        patient={patient}
        excludeCodes={linkedCodes}
        onSubmit={handleExistingSubmit}
      />
    </>
  );
};
