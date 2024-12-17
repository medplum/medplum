import { Title, Group, Radio } from '@mantine/core';
import {
  CodingInput,
  Document,
  ResourceName,
  useMedplum
} from '@medplum/react';
import { useState, useEffect } from 'react';
import { ValueSet } from '@medplum/fhirtypes';

const valueSetUrls = [
  'http://hl7.org/fhir/ValueSet/icd-10',
  'http://www.ama-assn.org/go/cpt/vs',
];

/**
 * Home page that greets the user and displays a list of patients.
 * @returns A React component that displays the home page.
 */
export function HomePage(): JSX.Element {
  const medplum = useMedplum();
  const [selectedValueSet, setSelectedValueSet] = useState(valueSetUrls[0]);
  const [currentValueSet, setCurrentValueSet] = useState<ValueSet>();
  const [valueSetResources, setValueSetResources] = useState<Map<string, ValueSet>>(new Map());

  // Fetch all ValueSets on component mount
  useEffect(() => {
    const fetchAllValueSets = async () => {
      const valueSetsMap = new Map<string, ValueSet>();

      for (const url of valueSetUrls) {
        try {
          const result = await medplum.search('ValueSet', {
            url: url
          });

          if (result.entry?.[0]?.resource) {
            const valueSet = result.entry[0].resource as ValueSet;
            valueSetsMap.set(url, valueSet);
          }
        } catch (error) {
          console.error(`Error fetching ValueSet ${url}:`, error);
        }
      }

      setValueSetResources(valueSetsMap);
      // Set the current ValueSet to the first one
      const firstValueSet = valueSetsMap.get(valueSetUrls[0]);
      if (firstValueSet) {
        setCurrentValueSet(firstValueSet);
      }
    };

    fetchAllValueSets();
  }, [medplum]);

  // Update current ValueSet when selection changes
  useEffect(() => {
    const valueSet = valueSetResources.get(selectedValueSet);
    if (valueSet) {
      setCurrentValueSet(valueSet);
    }
  }, [selectedValueSet, valueSetResources]);

  const handleRadioChange = (value: string) => {
    setSelectedValueSet(value);
  };

  return (
    <Document>
      <Title>
        ValueSet Coding Example
      </Title>
      <Group>
        <Radio.Group
          value={selectedValueSet}
          onChange={handleRadioChange}
          name="valueSetOption"
        >
          {Array.from(valueSetResources.entries()).map(([url, valueSet]) => (
            <Radio
              key={url}
              label={<ResourceName value={valueSet} link />}
              value={url}
            />
          ))}
        </Radio.Group>
      </Group>
      <CodingInput
        path=""
        binding={selectedValueSet}
        name="code"
      />
    </Document>
  );
}
