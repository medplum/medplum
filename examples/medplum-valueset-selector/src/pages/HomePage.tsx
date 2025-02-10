import { Title, Group, TextInput, Box, Textarea, Button, Alert, Grid } from '@mantine/core';
import { CodingInput, Document, ResourceName, useMedplum } from '@medplum/react';
import { useState } from 'react';
import { ValueSet } from '@medplum/fhirtypes';

export function HomePage(): JSX.Element {
  const medplum = useMedplum();

  const [searchTerm, setSearchTerm] = useState('');
  const [customValueSet, setCustomValueSet] = useState(`{
  "resourceType": "ValueSet",
  "id": "rxnorm-branded-drugs",
  "url": "http://example.org/fhir/ValueSet/rxnorm-branded-drugs",
  "version": "1.0.0",
  "name": "RxNormBrandedDrugs",
  "title": "RxNorm Branded Drug Components",
  "status": "active",
  "experimental": false,
  "date": "2025-01-28",
  "publisher": "National Library of Medicine",
  "description": "ValueSet of RxNorm branded drug components",
  "compose": {
    "include": [
      {
        "system": "http://www.nlm.nih.gov/research/umls/rxnorm",
        "filter": [
          {
            "property": "tty",
            "op": "in",
            "value": "BN,SBD,SBDG,BPCK"
          }
        ]
      }
    ]
  }
}`);
  const [currentValueSet, setCurrentValueSet] = useState<ValueSet>();
  const [selectedValueSet, setSelectedValueSet] = useState('');
  const [error, setError] = useState<string>();
  const [successMessage, setSuccessMessage] = useState<string>();

  // Search function
  const searchValueSet = async (term: string): Promise<void> => {
    if (!term) {
      setCurrentValueSet(undefined);
      setError(undefined);
      return;
    }

    setError(undefined);
    setSuccessMessage(undefined);

    try {
      // First try to parse if it's a custom ValueSet
      try {
        const customVS = JSON.parse(customValueSet);
        if (customVS.url === term) {
          setCurrentValueSet(customVS);
          setSelectedValueSet(term);
          return;
        }
      } catch (e) {
        // If parsing fails, continue with normal search
        console.log(e);
      }

      const result = await medplum.search('ValueSet', {
        url: term,
      });

      if (result.entry?.[0]?.resource) {
        const valueSet = result.entry[0].resource as ValueSet;
        setCurrentValueSet(valueSet);
        setSelectedValueSet(term);
      } else {
        setCurrentValueSet(undefined);
        setError('No ValueSet found');
      }
    } catch (error) {
      console.error('Error searching ValueSet:', error);
      setError('Error searching ValueSet');
      setCurrentValueSet(undefined);
    }
  };

  const handleCreateValueSet = async (): Promise<void> => {
    try {
      setError(undefined);
      setSuccessMessage(undefined);

      // Parse the JSON to validate it
      const valueSetData = JSON.parse(customValueSet);

      // Check if a ValueSet with this URL already exists
      const existingValueSet = await medplum.search('ValueSet', {
        url: valueSetData.url,
      });

      if (existingValueSet.entry?.[0]?.resource) {
        setError(`A ValueSet with URL "${valueSetData.url}" already exists`);
        return;
      }

      // Create the ValueSet resource
      const newValueSet = await medplum.createResource(valueSetData as ValueSet);
      setSuccessMessage('ValueSet created successfully');

      // Update the search if the current search term matches the new ValueSet's URL
      if (searchTerm === valueSetData.url) {
        setCurrentValueSet(newValueSet);
        setSelectedValueSet(valueSetData.url);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create ValueSet');
    }
  };

  // Handle input changes
  const handleSearchChange = async (value: string): Promise<void> => {
    setSearchTerm(value);
    await searchValueSet(value);
  };

  return (
    <Document>
      <Title>ValueSet Demo</Title>

      <Box mb="xl">
        <p>
          This demo shows how to work with FHIR ValueSets. You can either search for existing ValueSets on the left, or
          create your own custom ValueSet on the right. Once a ValueSet is selected or created, you can use it for
          typeaheads.
        </p>
      </Box>

      <Grid mt="md">
        <Grid.Col span={6}>
          <Title order={2}>Search Existing ValueSets</Title>
          <p style={{ marginBottom: '1rem' }}>
            Search for standard ValueSets that are already available in the system. Enter a ValueSet URL below to
            search.
          </p>
          <ul>
            <li>http://hl7.org/fhir/ValueSet/allergyintolerance-code</li>
            <li>http://hl7.org/fhir/ValueSet/clinical-findings</li>
            <li>http://example.org/custom-allergies (matches custom ValueSet on right)</li>
          </ul>
          <Group>
            <TextInput
              label="Search ValueSet URL"
              placeholder="Enter ValueSet URL..."
              value={searchTerm}
              onChange={(event) => handleSearchChange(event.currentTarget.value)}
              error={error}
              style={{ width: '100%' }}
            />
            {currentValueSet && (
              <div>
                Selected ValueSet: <ResourceName value={currentValueSet} link />
              </div>
            )}
          </Group>

          {selectedValueSet && (
            <Box mt="md">
              <CodingInput name="code" path="code" binding={selectedValueSet} required />
            </Box>
          )}
        </Grid.Col>

        <Grid.Col span={6}>
          <Title order={2}>Create Custom ValueSet</Title>
          <p style={{ marginBottom: '1rem' }}>
            Define your own ValueSet by editing the JSON below. The example shows a ValueSet for common allergies.
          </p>
          <Textarea
            label="Custom ValueSet (JSON)"
            placeholder="Enter custom ValueSet JSON..."
            value={customValueSet}
            onChange={(event) => setCustomValueSet(event.currentTarget.value)}
            error={error}
            autosize={false}
            minRows={30}
            styles={{
              input: {
                height: '500px',
                overflowY: 'auto',
              },
            }}
          />
          <Box mt="md">
            <Button onClick={handleCreateValueSet}>Create ValueSet</Button>
          </Box>
          {successMessage && (
            <Alert color="green" mt="md">
              {successMessage}
            </Alert>
          )}
        </Grid.Col>
      </Grid>
    </Document>
  );
}
