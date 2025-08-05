// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Divider, Group, Input, List, ListItem, rem, Text } from '@mantine/core';
import { Coverage, Patient } from '@medplum/fhirtypes';
import { BillingInformation, LabOrderInputErrors } from '@medplum/health-gorilla-core';
import { useHealthGorillaLabOrderContext } from '@medplum/health-gorilla-react';
import { IconArrowDown, IconArrowUp } from '@tabler/icons-react';
import { JSX, useEffect, useState } from 'react';

const INITIAL_COVERAGES: { coverage: Coverage; selected: boolean }[] = [];
const MAX_COVERAGES = 3;

export type PatientCoverages = { coverage: Coverage; selected: boolean }[];

export type CoverageInputProps = {
  patient: Patient;
  error?: NonNullable<LabOrderInputErrors['billingInformation']>['patientCoverage'];
};
export function CoverageInput({ patient, error }: CoverageInputProps): JSX.Element {
  const { getActivePatientCoverages, updateBillingInformation, state } = useHealthGorillaLabOrderContext();
  const [coverages, setCoverages] = useState<PatientCoverages>(INITIAL_COVERAGES);
  const disabled = state.billingInformation.billTo !== 'insurance';

  useEffect(() => {
    getActivePatientCoverages()
      .then((coverages) => {
        setCoverages(coverages.map((coverage, i) => ({ coverage, selected: i <= 2 })));
      })
      .catch(console.error);
  }, [getActivePatientCoverages, patient]);

  useEffect(() => {
    const selectedCoverages = coverages
      ?.filter((item) => item.selected)
      .map((item) => item.coverage)
      .slice(0, 3);
    updateBillingInformation({ patientCoverage: validatePatientCoverages(selectedCoverages) });
  }, [coverages, updateBillingInformation]);

  return (
    <Input.Wrapper c={disabled ? 'dimmed' : undefined} label="Patient coverages (max 3)" error={error?.message}>
      {coverages?.length ? (
        <List type="ordered" listStyleType="none" spacing={4}>
          {coverages.map(({ coverage }, i) => {
            const display = coverage.payor?.find((p) => p.display)?.display || 'Unknown';
            const listItem = (
              <ListItem key={coverage.id} c={disabled || i >= MAX_COVERAGES ? 'dimmed' : undefined}>
                <Group align="center" gap={4}>
                  {getCoverageListNumber(i)}
                  <ActionIcon.Group>
                    <ActionIcon
                      disabled={disabled || i === 0}
                      variant="default"
                      size="sm"
                      aria-label="Move up"
                      onClick={() => {
                        const newCoverages = [...coverages];
                        const temp = newCoverages[i];
                        newCoverages[i] = newCoverages[i - 1];
                        newCoverages[i - 1] = temp;
                        setCoverages(newCoverages);
                      }}
                    >
                      <IconArrowUp style={{ width: rem(16) }} stroke={1.5} />
                    </ActionIcon>

                    <ActionIcon
                      disabled={disabled || i === coverages.length - 1}
                      variant="default"
                      size="sm"
                      aria-label="Move down"
                      onClick={() => {
                        const newCoverages = [...coverages];
                        const temp = newCoverages[i];
                        newCoverages[i] = newCoverages[i + 1];
                        newCoverages[i + 1] = temp;
                        setCoverages(newCoverages);
                      }}
                    >
                      <IconArrowDown style={{ width: rem(16) }} stroke={1.5} />
                    </ActionIcon>
                  </ActionIcon.Group>
                  <Text>{display}</Text>
                </Group>
              </ListItem>
            );
            if (i === 3) {
              return [
                <Divider
                  key="more-divider"
                  label="Additional coverages that will not be submitted"
                  labelPosition="center"
                  my="xs"
                />,
                listItem,
              ];
            }

            return listItem;
          })}
        </List>
      ) : (
        <Text>No coverages found</Text>
      )}
    </Input.Wrapper>
  );
}

function getCoverageListNumber(index: number): React.ReactNode {
  return (
    <Text fw={500} display="inline-block" w={16} h={16} lh={1} ta="center">
      {index < 3 ? `${index + 1}.` : ''}
    </Text>
  );
}

function validatePatientCoverages(coverages: Coverage[]): BillingInformation['patientCoverage'] {
  if (coverages.length === 0) {
    return coverages as [];
  } else if (coverages.length === 1) {
    return coverages as [Coverage];
  } else if (coverages.length === 2) {
    return coverages as [Coverage, Coverage];
  } else if (coverages.length === 3) {
    return coverages as [Coverage, Coverage, Coverage];
  }

  throw new Error('Invalid number of coverages');
}
