// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Alert,
  Autocomplete,
  Badge,
  Button,
  Group,
  JsonInput,
  SegmentedControl,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import type { AccessPolicyInteraction } from '@medplum/core';
import { normalizeErrorString } from '@medplum/core';
import type { Resource } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import type { ExplainStatus } from '../lib/analyze';
import { explain, INTERACTIONS, OTHER_TYPE } from '../lib/analyze';
import type { MergedEntry } from '../lib/merge';
import { EntryLabel, EntryRules } from './EntryLabel';

const STATUS: Record<ExplainStatus, { color: string; label: string; help: string }> = {
  winner: { color: 'green', label: 'wins', help: 'First matching entry: decides access and field rules.' },
  'conditional-winner': {
    color: 'yellow',
    label: 'wins if criteria match',
    help: 'Applies to resources matching its criteria; others fall through to later entries.',
  },
  fallback: {
    color: 'teal',
    label: 'wins otherwise',
    help: 'Applies to every resource not caught by an earlier conditional entry.',
  },
  shadowed: { color: 'gray', label: 'shadowed', help: 'An earlier entry always matches first.' },
  'criteria-failed': { color: 'red', label: 'criteria fail', help: 'The sample resource does not match.' },
  'criteria-error': { color: 'orange', label: 'cannot evaluate', help: '' },
  'interaction-mismatch': { color: 'gray', label: 'other interactions', help: '' },
  'type-mismatch': { color: 'gray', label: 'other type', help: '' },
};

export interface ExplainViewProps {
  readonly entries: readonly MergedEntry[];
  readonly resourceTypes: readonly string[];
  readonly resourceType: string;
  readonly interaction: AccessPolicyInteraction;
  readonly onChange: (resourceType: string, interaction: AccessPolicyInteraction) => void;
  /** Kept by the parent so the sample survives switching tabs. */
  readonly sampleJson: string;
  readonly onSampleJsonChange: (json: string) => void;
}

export function ExplainView(props: ExplainViewProps): JSX.Element {
  const medplum = useMedplum();
  const { entries, resourceType, interaction, sampleJson, onSampleJsonChange: setSampleJson } = props;
  const [reference, setReference] = useState('');
  const [hideIrrelevant, setHideIrrelevant] = useState('relevant');
  const [error, setError] = useState<string>();
  const [schemaLoaded, setSchemaLoaded] = useState<string[]>([]);

  const parsedSample = useMemo((): Resource | undefined => {
    try {
      const parsed = sampleJson.trim() ? (JSON.parse(sampleJson) as Resource) : undefined;
      return typeof parsed?.resourceType === 'string' ? parsed : undefined;
    } catch {
      return undefined;
    }
  }, [sampleJson]);
  const sampleType = parsedSample?.resourceType;
  const typeMismatch = parsedSample !== undefined && sampleType !== resourceType;

  // Criteria are evaluated with the search parameter definitions in core's global schema, which starts empty in the browser.
  useEffect(() => {
    if (!sampleType || schemaLoaded.includes(sampleType)) {
      return;
    }
    medplum
      .requestSchema(sampleType)
      .then(() => setSchemaLoaded((loaded) => [...loaded, sampleType]))
      .catch((err) => setError(`Could not load search parameters for ${sampleType}: ${normalizeErrorString(err)}`));
  }, [medplum, sampleType, schemaLoaded]);

  const schemaReady = sampleType !== undefined && schemaLoaded.includes(sampleType);
  const sample = !typeMismatch && schemaReady ? parsedSample : undefined;

  function updateSample(json: string): void {
    setSampleJson(json);
    try {
      const parsed = JSON.parse(json) as Resource;
      if (typeof parsed?.resourceType === 'string' && parsed.resourceType !== resourceType) {
        props.onChange(parsed.resourceType, interaction);
      }
    } catch {
      // Still being typed
    }
  }

  const rows = explain(entries, resourceType, interaction, sample).filter(
    (r) => hideIrrelevant === 'all' || (r.status !== 'type-mismatch' && r.status !== 'interaction-mismatch')
  );
  const nobody = rows.every(
    (r) => r.status !== 'winner' && r.status !== 'fallback' && r.status !== 'conditional-winner'
  );

  async function loadReference(): Promise<void> {
    setError(undefined);
    try {
      const resource = await medplum.readReference({ reference: reference.trim() });
      updateSample(JSON.stringify(resource, null, 2));
    } catch (err) {
      setError(normalizeErrorString(err));
    }
  }

  return (
    <Stack>
      <Group align="flex-end">
        <Autocomplete
          label="Resource type"
          data={props.resourceTypes.filter((t) => t !== OTHER_TYPE).concat(OTHER_TYPE)}
          value={resourceType}
          onChange={(t) => props.onChange(t, interaction)}
        />
        <SegmentedControl
          data={INTERACTIONS}
          value={interaction}
          onChange={(i) => props.onChange(resourceType, i as AccessPolicyInteraction)}
        />
      </Group>

      <Group align="flex-end">
        <TextInput
          label="Sample resource (optional)"
          description="Load an existing resource to evaluate criteria against it"
          placeholder="Patient/123"
          value={reference}
          onChange={(e) => setReference(e.currentTarget.value)}
          style={{ flex: 1 }}
        />
        <Button
          variant="light"
          disabled={!reference.includes('/')}
          onClick={() => loadReference().catch(console.error)}
        >
          Load
        </Button>
      </Group>
      <JsonInput
        aria-label="Sample resource JSON"
        placeholder={`Or paste a ${resourceType} resource`}
        value={sampleJson}
        onChange={updateSample}
        autosize
        minRows={2}
        maxRows={10}
        validationError="Invalid JSON"
      />
      {error && <Alert color="red">{error}</Alert>}
      {sampleJson.trim() && !parsedSample && (
        <Alert color="orange">The sample is not a valid FHIR resource yet, so criteria are not evaluated.</Alert>
      )}
      {typeMismatch && (
        <Alert color="orange">
          <Group justify="space-between">
            <span>
              The sample is a {sampleType}, but {resourceType} is selected, so the sample is ignored.
            </span>
            <Group gap="xs">
              <Button size="compact-xs" onClick={() => props.onChange(sampleType as string, interaction)}>
                Switch to {sampleType}
              </Button>
              <Button size="compact-xs" variant="default" onClick={() => setSampleJson('')}>
                Clear sample
              </Button>
            </Group>
          </Group>
        </Alert>
      )}
      {parsedSample && !typeMismatch && !schemaReady && !error && (
        <Text size="sm" c="dimmed">
          Loading search parameters for {sampleType}…
        </Text>
      )}
      {sample && (
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <Text size="xs" c="dimmed">
            Criteria are evaluated in the browser with <code>matchesSearchRequest</code> from @medplum/core. It does not
            support every search parameter (for example chained searches), and <code>_compartment</code> uses the
            resource's <code>meta.compartment</code>, so load the resource from the server rather than typing it.
          </Text>
          <Button size="compact-xs" variant="default" onClick={() => setSampleJson('')}>
            Clear sample
          </Button>
        </Group>
      )}

      <Group justify="space-between">
        {nobody ? (
          <Alert color="gray" style={{ flex: 1 }}>
            No entry grants <b>{interaction}</b> on <b>{resourceType}</b>
            {sample ? ' for this resource' : ''}: the request is denied.
          </Alert>
        ) : (
          <span />
        )}
        <SegmentedControl
          size="xs"
          data={[
            { value: 'relevant', label: 'Matching type' },
            { value: 'all', label: 'All entries' },
          ]}
          value={hideIrrelevant}
          onChange={setHideIrrelevant}
        />
      </Group>

      <Table withTableBorder verticalSpacing="xs">
        <Table.Tbody>
          {rows.map((row) => {
            const status = STATUS[row.status];
            return (
              <Table.Tr key={row.entry.index}>
                <Table.Td w={170}>
                  <Badge color={status.color} variant="light">
                    {status.label}
                  </Badge>
                  <Text size="xs" c="dimmed" mt={4}>
                    {row.detail ?? status.help}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <EntryLabel entry={row.entry} />
                </Table.Td>
                <Table.Td>
                  <EntryRules entry={row.entry.entry} />
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}
