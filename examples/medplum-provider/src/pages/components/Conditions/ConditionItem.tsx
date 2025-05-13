import { Condition, EncounterDiagnosis } from '@medplum/fhirtypes';
import { ActionIcon, Select, Group, Flex, Text } from '@mantine/core';
import { useResource } from '@medplum/react';
import { IconX } from '@tabler/icons-react';

interface ConditionItemProps {
  diagnosis: EncounterDiagnosis;
  totalDiagnosis: number;
  onChange?: (diagnosis: EncounterDiagnosis, value: string) => void;
  onRemove?: (diagnosis: EncounterDiagnosis) => void;
}

export default function ConditionItem(props: ConditionItemProps): JSX.Element {
  const { diagnosis, totalDiagnosis, onChange, onRemove } = props;
  const conditionRef = diagnosis.condition?.reference;
  const condition = useResource<Condition>({ reference: conditionRef });

  return (
    <Flex justify="space-between">
      <Group>
        <Group>
          <Select
            placeholder="Sequence"
            w={80}
            value={diagnosis.rank?.toString() || '1'}
            data={Array.from({ length: totalDiagnosis }, (_, i) => (i + 1).toString())}
            onChange={(value) => {
              if (value) {
                onChange?.(diagnosis, value);
              }
            }}
          />
          <Text>{condition?.code?.coding?.[0]?.display}</Text>
        </Group>
      </Group>
      <ActionIcon
        variant="subtle"
        color="gray"
        onClick={() => {
          onRemove?.(diagnosis);
        }}
      >
        <IconX size={16} />
      </ActionIcon>
    </Flex>
  );
}
