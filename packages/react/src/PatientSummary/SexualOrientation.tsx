import { ActionIcon, Box, Collapse, Flex, Group, Modal, Text, UnstyledButton } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Encounter, Observation, Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { IconChevronDown, IconPencil, IconPlus } from '@tabler/icons-react';
import { useCallback, useState } from 'react';
import { Form } from '../Form/Form';
import { SubmitButton } from '../Form/SubmitButton';
import { MedplumLink } from '../MedplumLink/MedplumLink';
import { killEvent } from '../utils/dom';

export interface SexualOrientationProps {
  readonly patient: Patient;
  readonly encounter?: Encounter;
  readonly sexualOrientation?: Observation;
  readonly onClickResource?: (resource: Observation) => void;
}

export function SexualOrientation(props: SexualOrientationProps): JSX.Element {
  const medplum = useMedplum();
  const [sexualOrientation, setSexualOrientation] = useState<Observation | undefined>(props.sexualOrientation);
  const [opened, { open, close }] = useDisclosure(false);
  const [collapsed, setCollapsed] = useState(false);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const handleSubmit = useCallback(
    (formData: Record<string, string>) => {
      medplum
        .createResource<Observation>({
          resourceType: 'Observation',
          status: 'final',
          category: [
            {
              coding: [
                {
                  system: 'http://terminology.hl7.org/CodeSystem/observation-category',
                  code: 'social-history',
                  display: 'Social History',
                },
              ],
              text: 'Social History',
            },
          ],
          code: {
            coding: [
              {
                system: 'http://loinc.org',
                code: '76690-7',
                display: 'Sexual orientation',
              },
            ],
            text: 'Sexual orientation',
          },
          subject: { reference: `Patient/${props.patient.id}` },
          encounter: props.encounter ? { reference: `Encounter/${props.encounter.id}` } : undefined,
          effectiveDateTime: new Date().toISOString(),
          valueCodeableConcept: {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/v3-NullFlavor',
                code: formData.sexualOrientation,
              },
            ],
            text: formData.sexualOrientation,
          },
        })
        .then((newSexualOrientation) => {
          setSexualOrientation(newSexualOrientation);
          close();
        })
        .catch(console.error);
    },
    [medplum, props.patient.id, props.encounter, close]
  );

  return (
    <>
      <Box style={{ position: 'relative' }}>
        <UnstyledButton
          style={{
            width: '100%',
            cursor: 'default',
            '&:hover .add-button': {
              opacity: 1,
            },
            '& .mantine-ActionIcon-root, & .mantine-Text-root': {
              cursor: 'pointer',
              margin: '0',
            },
          }}
        >
          <Group justify="space-between">
            <Group gap={8}>
              <ActionIcon
                variant="subtle"
                onClick={() => setCollapsed((c) => !c)}
                aria-label={collapsed ? 'Show sexual orientation' : 'Hide sexual orientation'}
                style={{ transition: 'transform 0.2s', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
                size="md"
              >
                <IconChevronDown size={20} />
              </ActionIcon>
              <Text fz="md" fw={700} onClick={() => setCollapsed((c) => !c)} style={{ cursor: 'pointer' }}>
                Sexual Orientation
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
                strokeWidth: 1,
              }}
              size="md"
            >
              <IconPlus size={18} />
            </ActionIcon>
          </Group>
        </UnstyledButton>
        <Collapse in={!collapsed}>
          {sexualOrientation ? (
            <Box ml="36" mt="8" mb="16">
              <Flex direction="column" gap={8}>
                <Box
                  style={{ position: 'relative' }}
                  onMouseEnter={() => setHoverIndex(0)}
                  onMouseLeave={() => setHoverIndex(null)}
                >
                  <MedplumLink
                    to={`/Observation/${sexualOrientation.id}`}
                    style={{ textDecoration: 'none', display: 'block', color: 'black' }}
                  >
                    <UnstyledButton
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        position: 'relative',
                        padding: 0,
                        background: 'none',
                        border: 'none',
                        boxShadow: 'none',
                      }}
                      onClick={(e) => {
                        killEvent(e);
                        if (props.onClickResource) {
                          props.onClickResource(sexualOrientation);
                        }
                      }}
                    >
                      <Box pr={hoverIndex === 0 ? 24 : 0} style={{ transition: 'padding-right 0.2s' }}>
                        <Text size="sm" fw={500}>
                          {sexualOrientation.valueCodeableConcept?.text || 'Unknown'}
                        </Text>

                        {hoverIndex === 0 && (
                          <ActionIcon
                            style={{
                              position: 'absolute',
                              right: 0,
                              top: '50%',
                              transform: 'translateY(-50%)',
                              zIndex: 2,
                            }}
                            onClick={(e) => {
                              killEvent(e);
                              open();
                            }}
                            size="xs"
                            variant="transparent"
                          >
                            <IconPencil size={14} />
                          </ActionIcon>
                        )}
                      </Box>
                    </UnstyledButton>
                  </MedplumLink>
                </Box>
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
      <Modal opened={opened} onClose={close} title="Add Sexual Orientation">
        <Form onSubmit={handleSubmit}>
          <SubmitButton>Save</SubmitButton>
        </Form>
      </Modal>
    </>
  );
}
