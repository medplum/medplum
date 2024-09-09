import { Anchor, Badge, Box, Button, Group, Modal, Radio, Stack, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { HTTP_HL7_ORG, HTTP_TERMINOLOGY_HL7_ORG, LOINC, SNOMED, createReference } from '@medplum/core';
import { Encounter, Observation, Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { useCallback, useState } from 'react';
import { CodeableConceptDisplay } from '../CodeableConceptDisplay/CodeableConceptDisplay';
import { Form } from '../Form/Form';
import { killEvent } from '../utils/dom';

const NULLFLAVOR = HTTP_TERMINOLOGY_HL7_ORG + '/CodeSystem/v3-NullFlavor';

type SexualOrientationCode = '38628009' | '20430005' | '42035005' | 'OTH' | 'UNK' | 'ASKU';
// Sexual orientation widget
// See: https://hl7.org/fhir/us/core/STU5.0.1/StructureDefinition-us-core-observation-sexual-orientation.html
const CodesToText: Record<SexualOrientationCode, string> = {
  '38628009': 'Homosexual',
  '20430005': 'Heterosexual',
  '42035005': 'Bisexual',
  OTH: 'Other',
  UNK: 'Unknown',
  ASKU: 'Asked but no answer',
};

const CodesToSystem: Record<SexualOrientationCode, string> = {
  38628009: SNOMED,
  20430005: SNOMED,
  42035005: SNOMED,
  OTH: NULLFLAVOR,
  UNK: NULLFLAVOR,
  ASKU: NULLFLAVOR,
};

export interface SexualOrientationProps {
  readonly patient: Patient;
  readonly encounter?: Encounter;
  readonly sexualOrientation?: Observation;
}

export function SexualOrientation(props: SexualOrientationProps): JSX.Element {
  const medplum = useMedplum();
  const { patient, encounter } = props;
  const [sexualOrientation, setSexualOrientation] = useState<Observation | undefined>(props.sexualOrientation);
  const [opened, { open, close }] = useDisclosure(false);

  const handleSubmit = useCallback(
    (formData: Record<string, string>) => {
      const code = formData.sexualOrientation as SexualOrientationCode;
      medplum
        .createResource<Observation>({
          resourceType: 'Observation',
          meta: {
            profile: [HTTP_HL7_ORG + '/fhir/us/core/ValueSet/us-core-sexual-orientation'],
          },
          status: 'final',
          category: [
            {
              coding: [
                {
                  system: HTTP_TERMINOLOGY_HL7_ORG + '/CodeSystem/observation-category',
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
                code: '76690-7',
                display: 'Sexual orientation',
              },
            ],
            text: 'Sexual orientation',
          },
          subject: createReference(patient),
          encounter: encounter ? createReference(encounter) : undefined,
          effectiveDateTime: new Date().toISOString(),
          valueCodeableConcept: {
            coding: [
              {
                system: CodesToSystem[code],
                code: formData.sexualOrientation,
              },
            ],
            text: CodesToText[code],
          },
        })
        .then((newSexualOrientation) => {
          setSexualOrientation(newSexualOrientation);
          close();
        })
        .catch(console.error);
    },
    [medplum, patient, encounter, close]
  );

  return (
    <>
      <Group justify="space-between">
        <Text fz="md" fw={700}>
          Sexual Orientation
        </Text>
        <Anchor
          href="#"
          onClick={(e) => {
            killEvent(e);
            open();
          }}
        >
          + Edit
        </Anchor>
      </Group>
      {sexualOrientation?.valueCodeableConcept ? (
        <Box>
          <Badge variant="light">
            <CodeableConceptDisplay value={sexualOrientation.valueCodeableConcept} />
          </Badge>
        </Box>
      ) : (
        <Text>(none)</Text>
      )}
      <Modal opened={opened} onClose={close} title="Set Sexual Orientation">
        <Form onSubmit={handleSubmit}>
          <Stack>
            <Radio.Group name="sexualOrientation" label="Sexual Orientation" required>
              {Object.entries(CodesToText).map(([code, text]) => (
                <Radio key={code} value={code} label={text} my="xs" />
              ))}
            </Radio.Group>
            <Group justify="flex-end" gap={4} mt="md">
              <Button type="submit">Save</Button>
            </Group>
          </Stack>
        </Form>
      </Modal>
    </>
  );
}
