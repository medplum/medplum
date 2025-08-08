// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Flex, Modal, Card, Stack, Text } from '@mantine/core';
import { Condition, Encounter, EncounterDiagnosis, Patient } from '@medplum/fhirtypes';
import { JSX, useEffect, useState } from 'react';
import ConditionItem from './ConditionItem';
import ConditionModal from './ConditionModal';
import { useMedplum } from '@medplum/react';
import { getReferenceString } from '@medplum/core';
import { showErrorNotification } from '../../utils/notifications';

interface ConditionListProps {
  patient: Patient;
  encounter: Encounter;
  conditions: Condition[] | undefined;
  setConditions: (conditions: Condition[]) => void;
  onDiagnosisChange: (diagnosis: EncounterDiagnosis[]) => void;
}

export const ConditionList = (props: ConditionListProps): JSX.Element => {
  const { patient, encounter, conditions, setConditions, onDiagnosisChange } = props;
  const medplum = useMedplum();
  const [opened, setOpened] = useState(false);

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

  const handleRemoveDiagnosis = async (condition: Condition): Promise<void> => {
    if (!conditions) {
      return;
    }

    try {
      await medplum.deleteResource('Condition', condition.id as string);
      setConditions(conditions?.filter((c) => c.id !== condition.id));
      const updatedDiagnosis = encounter.diagnosis?.filter(
        (d) => d.condition?.reference !== getReferenceString(condition)
      );
      const reindexedDiagnosis = updatedDiagnosis?.map((d, index) => ({
        ...d,
        rank: index + 1,
      }));

      setConditions(conditions?.filter((c) => c.id !== condition.id) || []);
      onDiagnosisChange(reindexedDiagnosis || []);
    } catch (err) {
      showErrorNotification(err);
    }
  };

  const handleConditionSubmit = async (condition: Condition): Promise<void> => {
    try {
      const newCondition = await medplum.createResource(condition);
      if (encounter) {
        const updatedDiagnosis = [
          ...(encounter.diagnosis || []),
          {
            condition: { reference: `Condition/${newCondition.id}` },
            rank: encounter.diagnosis?.length ? encounter.diagnosis.length + 1 : 1,
          },
        ];
        setConditions([...(conditions || []), newCondition]);
        onDiagnosisChange(updatedDiagnosis);
      }
    } catch (err) {
      showErrorNotification(err);
    } finally {
      setOpened(false);
    }
  };

  return (
    <>
      <Stack gap={0}>
        <Text fw={600} size="lg" mb="md">
          Diagnosis
        </Text>

        <Card withBorder shadow="sm">
          <Stack gap="md">
            {conditions &&
              conditions.length > 0 &&
              conditions.map((condition, idx) => (
                <ConditionItem
                  key={condition.id ?? idx}
                  condition={condition}
                  rank={idx + 1}
                  total={conditions.length}
                  onChange={handleUpdateDiagnosis}
                  onRemove={handleRemoveDiagnosis}
                />
              ))}

            <Flex>
              <Button onClick={() => setOpened(true)}>Add Diagnosis</Button>
            </Flex>
          </Stack>
        </Card>
      </Stack>
      <Modal opened={opened} onClose={() => setOpened(false)} title={'Add Diagnosis'}>
        <ConditionModal patient={patient} encounter={encounter} onSubmit={handleConditionSubmit} />
      </Modal>
    </>
  );
};
