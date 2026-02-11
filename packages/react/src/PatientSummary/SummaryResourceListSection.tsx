// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Flex, Group, Text } from '@mantine/core';
import { getDisplayString as coreGetDisplayString } from '@medplum/core';
import type { Resource, ResourceType } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { StatusBadge } from '../StatusBadge/StatusBadge';
import { CollapsibleSection } from './CollapsibleSection';
import type { PatientSummarySectionConfig, SectionRenderContext } from './PatientSummary.types';
import SummaryItem from './SummaryItem';
import styles from './SummaryItem.module.css';

export interface SummaryResourceListOptions {
  /** Unique key for React reconciliation. */
  readonly key: string;
  /** Section title displayed in the collapsible header. */
  readonly title: string;
  /** FHIR search configuration. */
  readonly search: {
    readonly resourceType: ResourceType;
    /** Which search param references the patient. Defaults to 'subject'. */
    readonly patientParam?: string;
    /** Additional search params. */
    readonly query?: Record<string, string | number | boolean | undefined>;
  };
  /** Override the default display string for each resource. */
  readonly getDisplayString?: (resource: Resource) => string;
  /** Return a status badge config, or undefined to show no badge. */
  readonly getStatus?: (resource: Resource) => { label: string; color: string } | undefined;
  /** Return secondary text (shown dimmed below the primary text). */
  readonly getSecondaryText?: (resource: Resource) => string | undefined;
  /** Filter resources before display. */
  readonly filter?: (resource: Resource) => boolean;
  /** Sort resources before display. */
  readonly sort?: (a: Resource, b: Resource) => number;
  /** Callback for the "+" add button. If omitted, no add button is shown. */
  readonly onAdd?: () => void;
}

/**
 * Creates a `PatientSummarySectionConfig` that renders a list of resources
 * using the same visual pattern as built-in sections (CollapsibleSection + SummaryItem + StatusBadge).
 * @param options - Configuration for the resource list section.
 * @returns A section config that renders a generic resource list.
 */
export function summaryResourceListSection(options: SummaryResourceListOptions): PatientSummarySectionConfig {
  return {
    key: options.key,
    title: options.title,
    searches: [
      {
        resourceType: options.search.resourceType,
        patientParam: options.search.patientParam,
        query: options.search.query,
      },
    ],
    render: (context: SectionRenderContext) => (
      <ResourceListDisplay options={options} resources={context.results[0] ?? []} context={context} />
    ),
  };
}

interface ResourceListDisplayProps {
  readonly options: SummaryResourceListOptions;
  readonly resources: Resource[];
  readonly context: SectionRenderContext;
}

function ResourceListDisplay(props: ResourceListDisplayProps): JSX.Element {
  const { options, context } = props;
  let resources = [...props.resources];

  if (options.filter) {
    resources = resources.filter(options.filter);
  }

  if (options.sort) {
    resources.sort(options.sort);
  }

  return (
    <CollapsibleSection title={options.title} onAdd={options.onAdd}>
      {resources.length > 0 ? (
        <Flex direction="column" gap={8}>
          {resources.map((resource) => {
            const displayString = options.getDisplayString
              ? options.getDisplayString(resource)
              : coreGetDisplayString(resource);
            const status = options.getStatus?.(resource);
            const secondaryText = options.getSecondaryText?.(resource);

            return (
              <SummaryItem key={resource.id} onClick={() => context.onClickResource?.(resource)}>
                <Box>
                  <Text fw={500} className={styles.itemText}>
                    {displayString}
                  </Text>
                  {(status || secondaryText) && (
                    <Group mt={2} gap={4}>
                      {status && <StatusBadge color={status.color} variant="light" status={status.label} />}
                      {secondaryText && (
                        <Text size="xs" fw={500} c="dimmed">
                          {secondaryText}
                        </Text>
                      )}
                    </Group>
                  )}
                </Box>
              </SummaryItem>
            );
          })}
        </Flex>
      ) : (
        <Text>(none)</Text>
      )}
    </CollapsibleSection>
  );
}
