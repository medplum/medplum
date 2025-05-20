import { Box, Group, Text, Collapse, ActionIcon, UnstyledButton, Flex, Modal } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { HTTP_HL7_ORG, LOINC, SNOMED, createReference, formatDate } from '@medplum/core';
import { Encounter, Observation, Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { useCallback, useState, JSX } from 'react';
import { killEvent } from '../utils/dom';
import { IconChevronDown, IconPlus, IconPencil } from '@tabler/icons-react';
import { MedplumLink } from '../MedplumLink/MedplumLink';
import { Form } from '../Form/Form';
import { SubmitButton } from '../Form/SubmitButton';

// Smoking Status widget
// See: https://build.fhir.org/ig/HL7/US-Core/StructureDefinition-us-core-smokingstatus.html

const smokingStatusOptions: Record<string, string> = {
  '266919005': 'Never smoked tobacco',
  '266927001': 'Tobacco smoking consumption unknown',
  '428041000124106': 'Occasional tobacco smoker',
  '428061000124105': 'Light tobacco smoker',
  '428071000124103': 'Heavy tobacco smoker',
  '449868002': 'Smokes tobacco daily',
  '77176002': 'Smoker',
  '8517006': 'Ex-smoker',
};

export interface SmokingStatusProps {
  readonly patient: Patient;
  readonly encounter?: Encounter;
  readonly smokingStatus?: Observation;
  readonly onClickResource?: (resource: Observation) => void;
}

export function SmokingStatus(props: SmokingStatusProps): JSX.Element {
  const medplum = useMedplum();
  const [smokingStatus, setSmokingStatus] = useState<Observation | undefined>(props.smokingStatus);
  const [opened, { open, close }] = useDisclosure(false);
  const [collapsed, setCollapsed] = useState(false);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const handleSubmit = useCallback(
    (formData: Record<string, string>) => {
      medplum
        .createResource<Observation>({
          resourceType: 'Observation',
          meta: {
            profile: [HTTP_HL7_ORG + '/fhir/us/core/StructureDefinition/us-core-smokingstatus'],
          },
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
                system: LOINC,
                code: '72166-2',
                display: 'Tobacco smoking status',
              },
            ],
            text: 'Tobacco smoking status',
          },
          subject: createReference(props.patient),
          encounter: props.encounter ? createReference(props.encounter) : undefined,
          effectiveDateTime: new Date().toISOString(),
          valueCodeableConcept: {
            coding: [
              {
                system: SNOMED,
                version: SNOMED + '/731000124108',
                code: formData.smokingStatus,
              },
            ],
            text: smokingStatusOptions[formData.smokingStatus],
          },
        })
        .then((newSmokingStatus) => {
          setSmokingStatus(newSmokingStatus);
          close();
        })
        .catch(console.error);
    },
    [medplum, props.patient, props.encounter, close]
  );

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
                aria-label={collapsed ? 'Show smoking status' : 'Hide smoking status'}
                style={{ transition: 'transform 0.2s', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
                size="md"
              >
                <IconChevronDown size={20} />
              </ActionIcon>
              <Text fz="md" fw={700} onClick={() => setCollapsed((c) => !c)} style={{ cursor: 'pointer' }}>
                Smoking Status
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
          {smokingStatus ? (
            <Box ml="36" mt="8" mb="16">
              <Flex direction="column" gap={8}>
                <Box 
                  style={{ position: 'relative' }}
                  onMouseEnter={() => setHoverIndex(0)}
                  onMouseLeave={() => setHoverIndex(null)}
                >
                  <MedplumLink
                    to={`/Observation/${smokingStatus.id}`}
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
                          props.onClickResource(smokingStatus);
                        }
                      }}
                    >
                      <Box pr={hoverIndex === 0 ? 24 : 0} style={{ transition: 'padding-right 0.2s' }}>
                        <Text size="sm" fw={500}>
                          {smokingStatus.valueCodeableConcept?.text || 'Unknown'}
                        </Text>
                        {smokingStatus.effectiveDateTime && (
                          <Text size="xs" c="dimmed">
                            · Recorded {formatDate(smokingStatus.effectiveDateTime)}
                          </Text>
                        )}
                        {hoverIndex === 0 && (
                          <ActionIcon
                            style={{
                              position: 'absolute',
                              right: 0,
                              top: '50%',
                              transform: 'translateY(-50%)',
                              zIndex: 2
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
      <Modal opened={opened} onClose={close} title="Add Smoking Status">
        <Form onSubmit={handleSubmit}>
          <SubmitButton>Save</SubmitButton>
        </Form>
      </Modal>
    </>
  );
}
