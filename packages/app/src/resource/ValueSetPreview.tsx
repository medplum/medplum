// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Stack } from '@mantine/core';
import type { Parameters, ValueSet, ValueSetExpansionContains } from '@medplum/fhirtypes';
import {
  DescriptionList,
  DescriptionListEntry,
  Document,
  useMedplum,
  ValueSetAutocomplete,
} from '@medplum/react';
import type { JSX } from 'react';
import { useState } from 'react';

export interface ValueSetPreviewProps {
  readonly valueSet: ValueSet;
}

export function ValueSetPreview(props: ValueSetPreviewProps): JSX.Element {
  const { valueSet } = props;
  const medplum = useMedplum();
  const valueSetUrl = valueSet.url;
  const [selectedValue, setSelectedValue] = useState<ValueSetExpansionContains | undefined>();
  const [lookupResult, setLookupResult] = useState<Parameters | undefined>();

  const handleValueChange = async (newValue: ValueSetExpansionContains | undefined): Promise<void> => {
    setSelectedValue(newValue);
    setLookupResult(undefined);

    if (!newValue?.code || !newValue?.system) {
      return;
    }

    try {
      // Call CodeSystem/$lookup operation
      const params = new URLSearchParams({ system: newValue.system, code: newValue.code });
      const url = medplum.fhirUrl('CodeSystem', '$lookup') + '?' + params.toString();
      const result = await medplum.get(url);
      setLookupResult(result as Parameters);
    } catch (error) {
      console.error('Failed to lookup code:', error);
    }
  };

  return (
    <Document>
      <Stack gap="xl">
        <ValueSetAutocomplete
          binding={valueSetUrl}
          placeholder="Select a value from the ValueSet"
          onChange={(values) => handleValueChange(values[0])}
          defaultValue={selectedValue}
          maxValues={1}
        />

        {/* Placeholder space that's always present to prevent layout shift */}
        <Box style={{ minHeight: '200px' }}>
          {selectedValue ? (
            <Stack gap="md">
              <DescriptionList>
                <DescriptionListEntry term="Code">{selectedValue.code}</DescriptionListEntry>
                {selectedValue.system && (
                  <DescriptionListEntry term="System">{selectedValue.system}</DescriptionListEntry>
                )}
                {selectedValue.display && (
                  <DescriptionListEntry term="Display">{selectedValue.display}</DescriptionListEntry>
                )}
              </DescriptionList>

              {lookupResult && (
                <Stack gap="md">
                  {lookupResult.parameter
                    ?.filter((param) => param.name === 'property' && param.part)
                    .map((param) => (
                      <DescriptionList key={param.name}>
                        <DescriptionListEntry term="Property">
                          <Stack gap="xs">
                            {param.part?.map((part) => {
                              if (part.name === 'code') {
                                return (
                                  <DescriptionListEntry key="code" term="Code">
                                    {part.valueCode}
                                  </DescriptionListEntry>
                                );
                              }
                              if (part.name === 'description') {
                                return (
                                  <DescriptionListEntry key="description" term="Description">
                                    {part.valueString}
                                  </DescriptionListEntry>
                                );
                              }
                              if (part.name === 'value') {
                                return (
                                  <DescriptionListEntry key="value" term="Value">
                                    {part.valueCode ||
                                      part.valueString ||
                                      (part.valueBoolean !== undefined ? String(part.valueBoolean) : undefined) ||
                                      (part.valueInteger !== undefined ? String(part.valueInteger) : undefined) ||
                                      (part.valueDecimal !== undefined ? String(part.valueDecimal) : undefined) ||
                                      part.valueDate ||
                                      part.valueDateTime ||
                                      'N/A'}
                                  </DescriptionListEntry>
                                );
                              }
                              return null;
                            })}
                          </Stack>
                        </DescriptionListEntry>
                      </DescriptionList>
                    ))}
                </Stack>
              )}
            </Stack>
          ) : null}
        </Box>
      </Stack>
    </Document>
  );
}

