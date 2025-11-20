// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Group, Loader, Stack, Text } from '@mantine/core';
import { normalizeErrorString } from '@medplum/core';
import type { Parameters, ParametersParameter, ValueSet, ValueSetExpansionContains } from '@medplum/fhirtypes';
import {
  DescriptionList,
  DescriptionListEntry,
  Document,
  ErrorBoundary,
  useMedplum,
  ValueSetAutocomplete,
} from '@medplum/react';
import { IconAlertCircle } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useMemo, useState } from 'react';

export interface ValueSetPreviewProps {
  readonly valueSet: ValueSet;
}

interface CodeSystemPropertyListProps {
  readonly properties: ParametersParameter[];
}

/**
 * Formats a property value from a ParametersParameter part.
 * Handles various value types: code, string, boolean, integer, decimal, date, and dateTime.
 *
 * @param part - The ParametersParameter part containing the value
 * @returns The formatted string value or 'N/A' if no value is present
 */
function formatPropertyValue(part: ParametersParameter): string {
  return (
    part.valueCode ||
    part.valueString ||
    (part.valueBoolean === undefined ? undefined : String(part.valueBoolean)) ||
    (part.valueInteger === undefined ? undefined : String(part.valueInteger)) ||
    (part.valueDecimal === undefined ? undefined : String(part.valueDecimal)) ||
    part.valueDate ||
    part.valueDateTime ||
    'N/A'
  );
}

/**
 * Renders a list of CodeSystem properties from a CodeSystem/$lookup operation result.
 * Each property displays its code, description, and value.
 *
 * @param props - Component props
 * @param props.properties - Array of filtered ParametersParameter objects representing CodeSystem properties
 * @returns JSX element displaying the properties
 */
function CodeSystemPropertyList(props: CodeSystemPropertyListProps): JSX.Element {
  const { properties } = props;

  return (
    <Stack gap="md">
      {properties.map((param, index) => (
        <DescriptionList key={`${param.name}-${index}`}>
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
                      {formatPropertyValue(part)}
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
  );
}

/**
 * ValueSetPreview component displays a ValueSet and allows users to select values from it.
 * When a value is selected, it performs a CodeSystem/$lookup operation to retrieve
 * additional property information about the selected code.
 *
 * @param props - Component props
 * @param props.valueSet - The ValueSet resource to preview
 * @returns JSX element displaying the ValueSet preview interface
 */
export function ValueSetPreview(props: ValueSetPreviewProps): JSX.Element {
  const { valueSet } = props;
  const medplum = useMedplum();
  const valueSetUrl = valueSet.url;
  const [selectedValue, setSelectedValue] = useState<ValueSetExpansionContains | undefined>();
  const [lookupResult, setLookupResult] = useState<Parameters | undefined>();
  const [isLoadingLookup, setIsLoadingLookup] = useState(false);
  const [lookupError, setLookupError] = useState<Error | undefined>();

  const handleValueChange = useCallback(
    async (newValue: ValueSetExpansionContains | undefined): Promise<void> => {
      setSelectedValue(newValue);
      setLookupResult(undefined);
      setLookupError(undefined);

      if (!newValue?.code || !newValue?.system) {
        setIsLoadingLookup(false);
        return;
      }

      setIsLoadingLookup(true);
      try {
        // Call CodeSystem/$lookup operation
        const params = new URLSearchParams({ system: newValue.system, code: newValue.code });
        const url = medplum.fhirUrl('CodeSystem', '$lookup') + '?' + params.toString();
        const result = await medplum.get(url);
        setLookupResult(result as Parameters);
      } catch (error) {
        setLookupError(error instanceof Error ? error : new Error(String(error)));
      } finally {
        setIsLoadingLookup(false);
      }
    },
    [medplum]
  );

  const properties = useMemo(() => {
    return lookupResult?.parameter?.filter((param) => param.name === 'property' && param.part) ?? [];
  }, [lookupResult]);

  const hasProperties = properties.length > 0;

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

            {isLoadingLookup && (
              <Group gap="xs">
                <Loader size="sm" />
                <Text size="sm" c="dimmed">
                  Loading properties...
                </Text>
              </Group>
            )}
            {!isLoadingLookup && lookupError && (
              <Alert icon={<IconAlertCircle size={16} />} title="Lookup Failed" color="red">
                Failed to retrieve code information: {normalizeErrorString(lookupError)}
              </Alert>
            )}
            {!isLoadingLookup && !lookupError && hasProperties && (
              <ErrorBoundary>
                <CodeSystemPropertyList properties={properties} />
              </ErrorBoundary>
            )}
          </Stack>
        ) : null}
      </Stack>
    </Document>
  );
}
