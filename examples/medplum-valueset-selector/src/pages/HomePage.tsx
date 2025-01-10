import { Title, Group, Radio } from '@mantine/core';
import {
  CodingInput,
  Document,
  ResourceForm,
  ResourceName,
  useMedplum,
} from '@medplum/react';
import { useState, useEffect } from 'react';
import { ValueSet, AllergyIntolerance } from '@medplum/fhirtypes';

const valueSetUrls = [
  'http://hl7.org/fhir/ValueSet/allergyintolerance-code',
  'http://hl7.org/fhir/ValueSet/clinical-findings',
  'http://snomed.info/sct?fhir_vs=ecl/<<418038007' // Substance for allergy
];

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

  const handleSubmit = (formData: AllergyIntolerance) => {
    console.log('Submitting allergy intolerance:', formData);
    // Handle the submission here
    return medplum.createResource(formData);
  };

  // Create a default AllergyIntolerance resource
  // Define your profile URL
  const profileUrl = 'http://example.org/StructureDefinition/my-allergy-profile';

  const defaultResource: Partial<AllergyIntolerance> = {
    meta: {
      profile: [profileUrl]
    },
    resourceType: 'AllergyIntolerance',
    clinicalStatus: {
      coding: [{
        system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
        code: 'active'
      }]
    },
    verificationStatus: {
      coding: [{
        system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification',
        code: 'confirmed'
      }]
    },
    type: 'allergy',
    category: ['food'],
    criticality: 'low'
  };

  return (
    <Document>
      <Title>Allergy Intolerance Form</Title>
      <ResourceForm
        defaultValue={defaultResource}
        onSubmit={handleSubmit}
        profile={profileUrl}
      >
        <Group>
          <Radio.Group
            value={selectedValueSet}
            onChange={(value) => setSelectedValueSet(value)}
            name="valueSetOption"
            label="Select Allergy/Intolerance Coding System"
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
          name="code"
          path="code"
          binding={selectedValueSet}
          required
        />
      </ResourceForm>
    </Document>
  );
}
