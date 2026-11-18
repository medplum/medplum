// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Grid, Paper, Tabs } from '@mantine/core';
import type { AccessPolicyInteraction } from '@medplum/core';
import { useMedplum } from '@medplum/react';
import { useMemo, useState } from 'react';
import type { JSX } from 'react';
import { ExplainView } from '../components/ExplainView';
import { FieldIssuesView } from '../components/FieldIssuesView';
import { MatrixView } from '../components/MatrixView';
import { MergedView } from '../components/MergedView';
import { PolicySetPanel } from '../components/PolicySetPanel';
import { SearchScopeView } from '../components/SearchScopeView';
import { findDeadEntries, findFieldIssues, listResourceTypes } from '../lib/analyze';
import { mergeAccessPolicies } from '../lib/merge';
import type { ExplorerOptions, PolicyRowState } from '../lib/rows';

export function ExplorerPage(): JSX.Element {
  const medplum = useMedplum();
  const [rows, setRows] = useState<PolicyRowState[]>([]);
  const [options, setOptions] = useState<ExplorerOptions>(() => ({
    profile: medplum.getProfile() ? `${medplum.getProfile()?.resourceType}/${medplum.getProfile()?.id}` : '',
    projectId: medplum.getProject()?.id ?? '',
    admin: false,
    botSystemReadonly: true,
  }));
  const [extraTypes, setExtraTypes] = useState<string[]>([]);
  const [tab, setTab] = useState<string | null>('merged');
  const [selection, setSelection] = useState<{ resourceType: string; interaction: AccessPolicyInteraction }>({
    resourceType: 'Patient',
    interaction: 'read',
  });

  const merged = useMemo(() => mergeAccessPolicies(rows, options), [rows, options]);
  const resourceTypes = useMemo(() => listResourceTypes(merged.entries, extraTypes), [merged, extraTypes]);
  const dead = useMemo(() => findDeadEntries(merged.entries, resourceTypes), [merged, resourceTypes]);
  const fieldIssues = useMemo(() => findFieldIssues(merged.entries, resourceTypes), [merged, resourceTypes]);

  return (
    <Grid gutter="md" p="md">
      <Grid.Col span={{ base: 12, lg: 4 }}>
        <Paper withBorder p="md">
          <PolicySetPanel rows={rows} onRowsChange={setRows} options={options} onOptionsChange={setOptions} />
        </Paper>
      </Grid.Col>
      <Grid.Col span={{ base: 12, lg: 8 }}>
        <Paper withBorder p="md">
          <Tabs value={tab} onChange={setTab} keepMounted={false}>
            <Tabs.List mb="md">
              <Tabs.Tab value="merged" rightSection={<CountBadge count={merged.warnings.length} />}>
                Merged policy
              </Tabs.Tab>
              <Tabs.Tab value="matrix">Matrix</Tabs.Tab>
              <Tabs.Tab value="explain">Which entry wins</Tabs.Tab>
              <Tabs.Tab value="fields" rightSection={<CountBadge count={fieldIssues.length} />}>
                Field surprises
              </Tabs.Tab>
              <Tabs.Tab value="search">Search scope</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="merged">
              <MergedView merged={merged} dead={dead} />
            </Tabs.Panel>
            <Tabs.Panel value="matrix">
              <MatrixView
                entries={merged.entries}
                resourceTypes={resourceTypes}
                extraTypes={extraTypes}
                onExtraTypesChange={setExtraTypes}
                onSelect={(resourceType, interaction) => {
                  setSelection({ resourceType, interaction });
                  setTab('explain');
                }}
              />
            </Tabs.Panel>
            <Tabs.Panel value="explain">
              <ExplainView
                entries={merged.entries}
                resourceTypes={resourceTypes}
                resourceType={selection.resourceType}
                interaction={selection.interaction}
                onChange={(resourceType, interaction) => setSelection({ resourceType, interaction })}
              />
            </Tabs.Panel>
            <Tabs.Panel value="fields">
              <FieldIssuesView issues={fieldIssues} />
            </Tabs.Panel>
            <Tabs.Panel value="search">
              <SearchScopeView entries={merged.entries} resourceTypes={resourceTypes} />
            </Tabs.Panel>
          </Tabs>
        </Paper>
      </Grid.Col>
    </Grid>
  );
}

function CountBadge({ count }: { readonly count: number }): JSX.Element | null {
  return count > 0 ? (
    <Badge size="xs" color="orange" circle>
      {count}
    </Badge>
  ) : null;
}
