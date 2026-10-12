// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Accordion, Button, Checkbox, Divider, Group, Stack, Text, TextInput } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { HealthcareService } from '@medplum/fhirtypes';
import { IconSearch, IconTrash } from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { ConfirmModal } from '../ConfirmModal';
import { OfferingMenu } from './OfferingEditor';
import type { OfferPickerProps } from './OfferPicker';
import { OfferPicker } from './OfferPicker';
import { matchingServices, pageOfServices, serviceLabel } from './serviceList';

const ENTRY_PAGE_SIZE = 20;
const STOP_CONFIRM_MAX_NAMES = 5;

const listAll = new Intl.ListFormat('en', { type: 'conjunction' });

export interface OfferingsListProps {
  readonly actorName: string;
  /** The visit types offered, in the order they're listed. */
  readonly offeredServices: readonly WithId<HealthcareService>[];
  /** The id of the open entry's visit type, if any. */
  readonly openServiceId: string | null;
  readonly onOpenServiceIdChange: (id: string | null) => void;
  /** An entry's header, shown while it's closed and open. */
  readonly renderHeader: (service: WithId<HealthcareService>) => ReactNode;
  /** An entry's panel, rendered once the entry is first opened. */
  readonly renderPanel: (service: WithId<HealthcareService>) => ReactNode;
  readonly offerPickerProps: OfferPickerProps;
  /** Called with the visit types to stop offering, once confirmed. */
  readonly onStopOffering: (services: WithId<HealthcareService>[]) => void;
}

/**
 * The visit types an actor offers, one entry each, opening one at a time to what the Schedule sets for it.
 * Searchable, listed a page at a time, and selectable, to stop offering several at once.
 * @param props - The visit types offered, the open entry, and how to render and change them.
 * @returns The list.
 */
export function OfferingsList(props: OfferingsListProps): JSX.Element {
  const {
    actorName,
    offeredServices,
    openServiceId,
    onOpenServiceIdChange,
    renderHeader,
    renderPanel,
    offerPickerProps,
    onStopOffering,
  } = props;
  const [filterText, setFilterText] = useState('');
  const [matchLimit, setMatchLimit] = useState(ENTRY_PAGE_SIZE);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  // What was selected when the filter last changed, and what was offered since, listed first so a filter or the
  // page size can't hide it. One selected since stays where it is, so the list doesn't move under the pointer.
  const [pinnedIds, setPinnedIds] = useState<ReadonlySet<string>>(new Set());
  const [servicesToStop, setServicesToStop] = useState<WithId<HealthcareService>[]>([]);
  // An entry's panel stays mounted once opened, so it can animate shut, and the rest are never built.
  const [everOpenedIds, setEverOpenedIds] = useState<ReadonlySet<string>>(
    () => new Set(openServiceId ? [openServiceId] : [])
  );
  if (openServiceId && !everOpenedIds.has(openServiceId)) {
    setEverOpenedIds(new Set([...everOpenedIds, openServiceId]));
  }

  const page = useMemo(() => {
    const pageWithoutOpen = pageOfServices(offeredServices, filterText, matchLimit, pinnedIds);
    // An entry opened from outside the list, like the one a blocked save points at, is listed wherever it is.
    return !openServiceId || pageWithoutOpen.rows.some((service) => service.id === openServiceId)
      ? pageWithoutOpen
      : pageOfServices(offeredServices, filterText, matchLimit, new Set([...pinnedIds, openServiceId]));
  }, [offeredServices, filterText, matchLimit, pinnedIds, openServiceId]);
  const filterMatches = useMemo(() => matchingServices(offeredServices, filterText), [offeredServices, filterText]);

  const selectedServices = offeredServices.filter((service) => selectedIds.has(service.id));
  const selectedMatches = filterMatches.filter((service) => selectedIds.has(service.id));
  const allMatchesSelected = filterMatches.length > 0 && selectedMatches.length === filterMatches.length;

  function handleFilterChange(value: string): void {
    setFilterText(value);
    setMatchLimit(ENTRY_PAGE_SIZE);
    setPinnedIds(selectedIds);
  }

  function toggleSelected(id: string): void {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (!next.delete(id)) {
        next.add(id);
      }
      return next;
    });
  }

  function toggleAllMatchesSelected(): void {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const service of filterMatches) {
        if (allMatchesSelected) {
          next.delete(service.id);
        } else {
          next.add(service.id);
        }
      }
      return next;
    });
  }

  function handleOffer(services: WithId<HealthcareService>[]): void {
    setPinnedIds((current) => new Set([...current, ...services.map((service) => service.id)]));
    offerPickerProps.onOffer(services);
  }

  function confirmStop(): void {
    const stoppedIds = new Set(servicesToStop.map((service) => service.id));
    setSelectedIds((current) => new Set([...current].filter((id) => !stoppedIds.has(id))));
    onStopOffering(servicesToStop);
    setServicesToStop([]);
  }

  const offerPicker = <OfferPicker {...offerPickerProps} onOffer={handleOffer} />;

  if (offeredServices.length === 0) {
    return (
      <>
        <Text size="sm" c="dimmed">
          {actorName} offers no visit types yet.
        </Text>
        {offerPicker}
      </>
    );
  }

  return (
    <>
      <Group gap="sm" wrap="nowrap">
        <Checkbox
          aria-label={filterText.trim() ? 'Select all matching visit types' : 'Select all visit types'}
          checked={allMatchesSelected}
          indeterminate={selectedMatches.length > 0 && !allMatchesSelected}
          disabled={filterMatches.length === 0}
          onChange={toggleAllMatchesSelected}
          pl="md"
        />
        <TextInput
          aria-label="Filter visit types"
          placeholder="Filter visit types"
          leftSection={<IconSearch size={16} />}
          value={filterText}
          onChange={(event) => handleFilterChange(event.currentTarget.value)}
          style={{ flex: 1 }}
        />
        {selectedServices.length > 0 && (
          <Button
            variant="light"
            color="red"
            leftSection={<IconTrash size={16} />}
            onClick={() => setServicesToStop(selectedServices)}
          >
            Stop offering {selectedServices.length}
          </Button>
        )}
        {offerPicker}
      </Group>

      {page.rows.length === 0 ? (
        <Text size="sm" c="dimmed">
          No visit types match.
        </Text>
      ) : (
        <Accordion variant="separated" value={openServiceId} onChange={onOpenServiceIdChange}>
          {page.rows.map((service) => (
            <Accordion.Item key={service.id} value={service.id}>
              {/* Beside the control rather than in it, which is itself a button. */}
              <Group gap={0} wrap="nowrap" pr="sm">
                <Checkbox
                  aria-label={`Select ${serviceLabel(service)}`}
                  checked={selectedIds.has(service.id)}
                  onChange={() => toggleSelected(service.id)}
                  pl="md"
                />
                <Accordion.Control>{renderHeader(service)}</Accordion.Control>
                <OfferingMenu service={service} onStopOffering={() => setServicesToStop([service])} />
              </Group>
              <Accordion.Panel>
                {everOpenedIds.has(service.id) && (
                  <Stack gap="lg">
                    <Divider />
                    {renderPanel(service)}
                  </Stack>
                )}
              </Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion>
      )}

      {page.hiddenCount > 0 && (
        <Group>
          <Button variant="subtle" size="xs" onClick={() => setMatchLimit((current) => current + ENTRY_PAGE_SIZE)}>
            Show more ({page.hiddenCount} not shown)
          </Button>
        </Group>
      )}

      <ConfirmModal
        opened={servicesToStop.length > 0}
        title={stopConfirmTitle(servicesToStop)}
        cancelLabel="Keep offering"
        confirmLabel="Stop offering"
        destructive
        onCancel={() => setServicesToStop([])}
        onConfirm={confirmStop}
      >
        {servicesToStop.length > 0 &&
          `${actorName} will no longer be offered for ${stopConfirmNames(servicesToStop)} once you save. ` +
            "Existing appointments aren't changed."}
      </ConfirmModal>
    </>
  );
}

function stopConfirmTitle(services: readonly WithId<HealthcareService>[]): string | undefined {
  if (services.length === 0) {
    return undefined;
  }
  return services.length === 1
    ? `Stop offering ${services[0].name ?? 'this visit type'}?`
    : `Stop offering ${services.length} visit types?`;
}

function stopConfirmNames(services: readonly WithId<HealthcareService>[]): string {
  if (services.length === 1) {
    return services[0].name ?? 'this visit type';
  }
  const names = services.slice(0, STOP_CONFIRM_MAX_NAMES).map(serviceLabel);
  const unnamedCount = services.length - names.length;
  return listAll.format(unnamedCount > 0 ? [...names, `${unnamedCount} more`] : names);
}
