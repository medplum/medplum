import { Anchor, Grid, Group, Modal, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Condition, Encounter, Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { Fragment, useCallback, useState } from 'react';
import { killEvent } from '../utils/dom';
import { ConceptBadge } from './ConceptBadge';
import { ConditionDialog } from './ConditionDialog';

export interface ProblemListProps {
  readonly patient: Patient;
  readonly encounter?: Encounter;
  readonly problems: Condition[];
}

export function ProblemList(props: ProblemListProps): JSX.Element {
  const medplum = useMedplum();
  const { patient, encounter } = props;
  const [problems, setProblems] = useState<Condition[]>(props.problems);
  const [editCondition, setEditCondition] = useState<Condition>();
  const [opened, { open, close }] = useDisclosure(false);

  const handleSubmit = useCallback(
    async (condition: Condition) => {
      if (condition.id) {
        const updatedCondition = await medplum.updateResource(condition);
        setProblems(problems.map((p) => (p.id === updatedCondition.id ? updatedCondition : p)));
      } else {
        const newCondition = await medplum.createResource(condition);
        setProblems([...problems, newCondition]);
      }
      setEditCondition(undefined);
      close();
    },
    [medplum, problems, close]
  );

  return (
    <>
      <Group justify="space-between">
        <Text fz="md" fw={700}>
          Problem List
        </Text>
        <Anchor
          component="button"
          onClick={(e) => {
            killEvent(e);
            setEditCondition(undefined);
            open();
          }}
        >
          + Add
        </Anchor>
      </Group>
      {problems.length > 0 ? (
        <Grid gutter="xs">
          {problems.map((problem) => (
            <Fragment key={problem.id}>
              <Grid.Col span={2}>{problem.onsetDateTime?.substring(0, 4)}</Grid.Col>
              <Grid.Col span={10}>
                <ConceptBadge<Condition>
                  key={problem.id}
                  resource={problem}
                  onEdit={(c) => {
                    setEditCondition(c);
                    open();
                  }}
                />
              </Grid.Col>
            </Fragment>
          ))}
        </Grid>
      ) : (
        <Text>(none)</Text>
      )}
      <Modal opened={opened} onClose={close} title={editCondition ? 'Edit Problem' : 'Add Problem'}>
        <ConditionDialog patient={patient} encounter={encounter} condition={editCondition} onSubmit={handleSubmit} />
      </Modal>
    </>
  );
}
