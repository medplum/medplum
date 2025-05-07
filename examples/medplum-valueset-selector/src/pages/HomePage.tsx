import { Alert, Box, Button, Grid, Group, Textarea, Title } from '@mantine/core';
import { ValueSet } from '@medplum/fhirtypes';
import { CodingInput, Document, ResourceInput, ResourceName, useMedplum } from '@medplum/react';
import { JSX, useState } from 'react';

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
  const [selectedCode, setSelectedCode] = useState<any>();
  const [error, setError] = useState<string>();
  const [successMessage, setSuccessMessage] = useState<string>();

  // Use a resource directly from the ValueSet search
  const handleValueSetChange = (valueSet: ValueSet | undefined): void => {
    setCurrentValueSet(valueSet);
    if (valueSet?.url) {
      setSearchTerm(valueSet.url);
      setSelectedValueSet(valueSet.url);
    } else {
      setSelectedValueSet('');
    }
    setError(undefined);
    setSuccessMessage(undefined);
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
            Search for standard ValueSets that are already available in the system. Start typing to see suggestions.
          </p>
          <ul>
            <li>Try searching for "allergy", "condition", "clinical findings", or "snomed"</li>
            <li>Examples: allergyintolerance-code, clinical-findings, condition-code</li>
            <li>Or use a full URL like http://hl7.org/fhir/ValueSet/allergyintolerance-code</li>
          </ul>
          <Group>
            <Box style={{ width: '100%' }}>
              <ResourceInput<ValueSet>
                resourceType="ValueSet"
                name="valueSet"
                label="Search ValueSet"
                placeholder="Start typing to search for ValueSets..."
                onChange={handleValueSetChange}
              />
              {error && (
                <Alert color="red" mt="md">
                  {error}
                </Alert>
              )}
              {currentValueSet && (
                <Box mt="md">
                  <p>
                    Selected ValueSet: <ResourceName value={currentValueSet} link />
                  </p>
                  {currentValueSet.url && (
                    <p>
                      <strong>URL:</strong> {currentValueSet.url}
                    </p>
                  )}
                  {currentValueSet.description && (
                    <p>
                      <strong>Description:</strong> {currentValueSet.description}
                    </p>
                  )}
                </Box>
              )}
            </Box>
          </Group>

          {selectedValueSet && (
            <Box mt="md">
              <Title order={3} mb="md">
                Select code from ValueSet
              </Title>
              <CodingInput
                name="code"
                path="code"
                binding={selectedValueSet}
                required
                onChange={(value) => setSelectedCode(value)}
              />
              {selectedCode && (
                <Box mt="md">
                  <p>Selected Code:</p>
                  <pre
                    style={{
                      fontSize: '0.875rem',
                      backgroundColor: '#f8f9fa',
                      padding: '1rem',
                      borderRadius: '4px',
                      margin: 0,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      maxWidth: '100%',
                    }}
                  >
                    {JSON.stringify(selectedCode, null, 2)}
                  </pre>
                </Box>
              )}
            </Box>
          )}
        </Grid.Col>

        <Grid.Col span={6}>
          <Title order={2}>Create Custom ValueSet</Title>
          <p style={{ marginBottom: '1rem' }}>
            Define your own ValueSet by editing the JSON below. The example shows a ValueSet for RxNorm branded drugs.
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
