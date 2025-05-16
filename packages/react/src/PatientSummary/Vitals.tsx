import { Box, Group, Text, Collapse, ActionIcon, UnstyledButton, Flex, Modal, SimpleGrid, TextInput, Textarea } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { formatDate, formatQuantity } from '@medplum/core';
import { Encounter, Observation, Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { useCallback, useState } from 'react';
import { killEvent } from '../utils/dom';
import { IconChevronDown, IconPlus, IconChevronRight } from '@tabler/icons-react';
import { MedplumLink } from '../MedplumLink/MedplumLink';
import { Form } from '../Form/Form';
import { SubmitButton } from '../Form/SubmitButton';
import {
  createCompoundObservation,
  createLoincCode,
  createObservation,
  createQuantity,
  getObservationValue,
} from './Vitals.utils';
import styles from './PatientSummary.module.css';

interface ObservationMeta {
  readonly name: string;
  readonly short: string;
  readonly code: string;
  readonly component?: string;
  readonly title: string;
  readonly unit: string;
}

const LOINC_CODES: ObservationMeta[] = [
  {
    name: 'systolic',
    short: 'Systolic',
    code: '8480-6',
    title: 'Systolic blood pressure',
    unit: 'mm[Hg]',
  },
  {
    name: 'diastolic',
    short: 'Diastolic',
    code: '8462-4',
    title: 'Diastolic blood pressure',
    unit: 'mm[Hg]',
  },
  {
    name: 'pulse',
    short: 'Pulse',
    code: '8867-4',
    title: 'Heart rate',
    unit: '/min',
  },
  {
    name: 'temperature',
    short: 'Temp',
    code: '8310-5',
    title: 'Body temperature',
    unit: 'Cel',
  },
  {
    name: 'respiratory',
    short: 'Resp',
    code: '9279-1',
    title: 'Respiratory rate',
    unit: '/min',
  },
  {
    name: 'oxygen',
    short: 'O2',
    code: '2708-6',
    title: 'Oxygen saturation in Arterial blood',
    unit: '%',
  },
  {
    name: 'height',
    short: 'Height',
    code: '8302-2',
    title: 'Body height',
    unit: 'cm',
  },
  {
    name: 'weight',
    short: 'Weight',
    code: '29463-7',
    title: 'Body weight',
    unit: 'kg',
  },
  {
    name: 'bmi',
    short: 'BMI',
    code: '39156-5',
    title: 'Body mass index (BMI) [Ratio]',
    unit: 'kg/m2',
  },
];

export interface VitalsProps {
  readonly patient: Patient;
  readonly encounter?: Encounter;
  readonly vitals: Observation[];
  readonly onClickResource?: (resource: Observation) => void;
}

export function Vitals(props: VitalsProps): JSX.Element {
  const medplum = useMedplum();
  const [vitals, setVitals] = useState<Observation[]>(props.vitals);
  const [opened, { open, close }] = useDisclosure(false);
  const [collapsed, setCollapsed] = useState(false);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const handleSubmit = useCallback(
    (formData: Record<string, string>) => {
      const observations: Observation[] = [];

      // Handle blood pressure as a compound observation
      if (formData.systolic || formData.diastolic) {
        const bpObs = createCompoundObservation(
          props.patient,
          props.encounter,
          'blood-pressure',
          'Blood pressure',
          [
            {
              code: createLoincCode('8480-6', 'Systolic blood pressure'),
              valueQuantity: createQuantity(parseFloat(formData.systolic), 'mm[Hg]'),
            },
            {
              code: createLoincCode('8462-4', 'Diastolic blood pressure'),
              valueQuantity: createQuantity(parseFloat(formData.diastolic), 'mm[Hg]'),
            },
          ]
        );
        if (bpObs) {
          observations.push(bpObs);
        }
      }

      // Handle all other vitals as individual observations
      LOINC_CODES.filter((meta) => meta.name !== 'systolic' && meta.name !== 'diastolic').forEach((meta) => {
        const value = formData[meta.name];
        if (value) {
          const obs = createObservation(
            props.patient,
            props.encounter,
            meta.code,
            meta.title,
            createQuantity(parseFloat(value), meta.unit)
          );
          if (obs) {
            observations.push(obs);
          }
        }
      });

      Promise.all(observations.map((obs) => medplum.createResource(obs)))
        .then((newVitals) => {
          setVitals([...vitals, ...newVitals]);
          close();
        })
        .catch(console.error);
    },
    [medplum, props.patient, props.encounter, vitals, close]
  );

  const patientId = props.patient.id;

  return (
    <>
      <Box style={{ position: 'relative' }}>
        <UnstyledButton
          style={{
            width: '100%',
            cursor: 'default',
            '&:hover .add-button': {
              opacity: 1
            },
            '& .mantine-ActionIcon-root, & .mantine-Text-root': {
              cursor: 'pointer',
              margin: '0'
            }
          }}
        >
          <Group justify="space-between">
            <Group gap={8}>
              <ActionIcon
                variant="subtle"
                onClick={() => setCollapsed((c) => !c)}
                aria-label={collapsed ? 'Show vitals' : 'Hide vitals'}
                style={{ transition: 'transform 0.2s', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
                size="md"
              >
                <IconChevronDown size={20} />
              </ActionIcon>
              <Text fz="md" fw={800} onClick={() => setCollapsed((c) => !c)} style={{ cursor: 'pointer' }}>
                Vitals
              </Text>
            </Group>
            <ActionIcon
              className="add-button"
              variant="subtle"
              onClick={(e) => {
                killEvent(e);
                open();
              }}
              style={{
                opacity: 0,
                transition: 'opacity 0.2s',
                position: 'absolute',
                right: 0,
                top: 0,
                transform: 'none',
                strokeWidth: 1
              }}
              size="md"
            >
              <IconPlus size={18} />
            </ActionIcon>
          </Group>
        </UnstyledButton>
        <Collapse in={!collapsed}>
          {vitals.length > 0 ? (
            <Box ml="36" mt="8" mb="16">
              <Flex direction="column" gap={8}>
                {LOINC_CODES.map((meta, index) => {
                  const obs = vitals.find((o) => o.code?.coding?.[0].code === meta.code);
                  if (!obs) {
                    return null;
                  }

                  const loincCode = meta.code;
                  const category = meta.name === 'respiratory' ? 'respRate' : 'vital-signs';
                  const tableUrl = `/Patient/${patientId}/Observation?_count=20&_fields=_id,_lastUpdated,value[x]&category=${category}&category=vital-signs&patient=Patient%2F${patientId}&code=${loincCode}`;

                  return (
                    <MedplumLink
                      key={meta.code}
                      to={tableUrl}
                      style={{ textDecoration: 'none', display: 'block', color: 'black' }}
                    >
                      <Box
                      className={styles.patientSummaryListItem}
                      onMouseEnter={() => setHoverIndex(index)}
                      onMouseLeave={() => setHoverIndex(null)}
                        onClick={() => {
                          if (props.onClickResource) {
                            props.onClickResource(obs);
                          }
                        }}
                        style={{ cursor: 'pointer' }}
                    >
                      <Group gap={4} align="center">
                        <Text size="sm" fw={500} style={{ cursor: 'pointer' }}>
                          {meta.short}:
                        </Text>
                        <Text size="sm">
                          {formatQuantity(getObservationValue(obs, meta.component))}
                        </Text>
                        {obs?.effectiveDateTime && (
                          <Text size="xs" fw={500} color="gray.6" ml={2}>
                            {formatDate(obs.effectiveDateTime)}
                          </Text>
                        )}
                      </Group>
                      <div className={styles.patientSummaryGradient} />
                      <div className={styles.patientSummaryChevronContainer}>
                        <ActionIcon
                          className={styles.patientSummaryChevron}
                          size="md"
                          variant="transparent"
                            tabIndex={-1}
                        >
                          <IconChevronRight size={16} stroke={2.5}/>
                        </ActionIcon>
                      </div>
                    </Box>
                    </MedplumLink>
                  );
                })}
              </Flex>
            </Box>
          ) : (
            <Box ml="36" my="4">
              <Text>(none)</Text>
            </Box>
          )}
        </Collapse>
        <style>{`
          .mantine-UnstyledButton-root:hover .add-button {
            opacity: 1 !important;
          }
        `}</style>
      </Box>
      <Modal opened={opened} onClose={close} title="Add Vitals">
        <Form onSubmit={handleSubmit}>
          <SimpleGrid cols={2}>
            {LOINC_CODES.map((meta, index) => (
              <TextInput
                key={meta.name}
                name={meta.name}
                label={meta.short}
                description={`${meta.title} (${meta.unit})`}
                data-autofocus={index === 0}
                autoFocus={index === 0}
              />
            ))}
          </SimpleGrid>
          <Textarea name="notes" label="Notes" />
          <Group justify="flex-end" gap={4} mt="md">
            <SubmitButton>Save</SubmitButton>
          </Group>
        </Form>
      </Modal>
    </>
  );
}
