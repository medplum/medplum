// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Group, Modal, Radio, Stack, Text, UnstyledButton } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { HTTP_HL7_ORG, LOINC, SNOMED, createReference, formatCodeableConcept } from '@medplum/core';
import { Encounter, Observation, Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { JSX, useCallback, useState } from 'react';
import { Form } from '../Form/Form';
import { SubmitButton } from '../Form/SubmitButton';
import { CollapsibleSection } from './CollapsibleSection';

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
      <CollapsibleSection
        title="Smoking Status"
        onAdd={() => {
          open();
        }}
      >
        {smokingStatus?.valueCodeableConcept ? (
          <UnstyledButton data-testid="smoking-status-button" onClick={() => props.onClickResource?.(smokingStatus)}>
            <Text>{formatCodeableConcept(smokingStatus.valueCodeableConcept)}</Text>
          </UnstyledButton>
        ) : (
          <Text>(none)</Text>
        )}
      </CollapsibleSection>
      <Modal opened={opened} onClose={close} title="Set Smoking Status">
        <Form onSubmit={handleSubmit}>
          <Stack>
            <Radio.Group name="smokingStatus" label="Smoking Status" required>
              {Object.entries(smokingStatusOptions).map(([code, text]) => (
                <Radio key={code} value={code} label={text} my="xs" />
              ))}
            </Radio.Group>
            <Group justify="flex-end" gap={4} mt="md">
              <SubmitButton>Save</SubmitButton>
            </Group>
          </Stack>
        </Form>
      </Modal>
    </>
  );
}
