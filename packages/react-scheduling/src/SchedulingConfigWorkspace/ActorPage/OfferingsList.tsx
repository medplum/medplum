// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Accordion, Button, Checkbox, Divider, Group, Stack, Text, TextInput } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { HealthcareService } from '@medplum/fhirtypes';
import { IconSearch, IconTrash } from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { ConfirmModal } from '../ConfirmModal';
import { isCoveredByAllServices } from '../SchedulingConfigWorkspace.utils';
import { OfferingMenu } from './OfferingEditor';
import { OfferPicker } from './OfferPicker';
import { pageOfServices, serviceLabel } from './serviceList';

const ENTRY_PAGE_SIZE = 20;
const STOP_WHILE_ALL = 'Offered as one of all visit types. Turn off "Offer all visit types" to stop offering it.';

export interface OfferingsListProps {
  readonly actorName: string;
  /** The visit types offered, in the order they're listed. */
  readonly offeredServices: readonly WithId<HealthcareService>[];
  /** Whether the Schedule offers every active visit type, so none can be offered, or an active one stopped, alone. */
  readonly offersAllServices?: boolean;
  readonly openServiceId: string | null;
  readonly onOpenServiceIdChange: (id: string | null) => void;
  readonly renderHeader: (service: WithId<HealthcareService>) => ReactNode;
  /** An entry's panel, rendered once the entry is first opened. */
  readonly renderPanel: (service: WithId<HealthcareService>) => ReactNode;
  /** The active visit types not offered yet. */
  readonly offerableServices: readonly WithId<HealthcareService>[];
  readonly onOffer: (services: WithId<HealthcareService>[]) => void;
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
    offersAllServices,
    openServiceId,
    onOpenServiceIdChange,
    renderHeader,
    renderPanel,
    offerableServices,
    onOffer,
    onStopOffering,
  } = props;
  const [filterText, setFilterText] = useState('');
  const [matchLimit, setMatchLimit] = useState(ENTRY_PAGE_SIZE);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  // What was selected when the filter last changed, what was offered since, and an entry opened while hidden, listed
  // first so a filter or the page size can't hide it. One selected since stays where it is, so the list doesn't
  // move under the pointer.
  const [pinnedIds, setPinnedIds] = useState<ReadonlySet<string>>(new Set());
  const [servicesToStop, setServicesToStop] = useState<WithId<HealthcareService>[]>([]);
  // An entry's panel stays mounted once opened, so it can animate shut, and the rest are never built.
  const [everOpenedIds, setEverOpenedIds] = useState<ReadonlySet<string>>(new Set());
  if (openServiceId && !everOpenedIds.has(openServiceId)) {
    setEverOpenedIds(new Set([...everOpenedIds, openServiceId]));
  }

  const page = useMemo(
    () => pageOfServices(offeredServices, filterText, matchLimit, pinnedIds),
    [offeredServices, filterText, matchLimit, pinnedIds]
  );
  // An entry opened from outside the list, like the one a blocked save points at, is listed even when the filter or
  // page would hide it.
  if (openServiceId && !pinnedIds.has(openServiceId) && !page.rows.some((service) => service.id === openServiceId)) {
    setPinnedIds(new Set([...pinnedIds, openServiceId]));
  }

  const selectedServices = offeredServices.filter((service) => selectedIds.has(service.id));
  const selectedMatches = page.matches.filter((service) => selectedIds.has(service.id));
  const allMatchesSelected = page.matches.length > 0 && selectedMatches.length === page.matches.length;
  const stopSubject = stopConfirmSubject(servicesToStop);

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
      for (const service of page.matches) {
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
    onOffer(services);
  }

  function confirmStop(): void {
    const stoppedIds = new Set(servicesToStop.map((service) => service.id));
    setSelectedIds((current) => new Set([...current].filter((id) => !stoppedIds.has(id))));
    onStopOffering(servicesToStop);
    setServicesToStop([]);
  }

  const offerPicker = offersAllServices ? undefined : (
    <OfferPicker services={offerableServices} onOffer={handleOffer} />
  );

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
        {!offersAllServices && (
          <Checkbox
            aria-label={filterText.trim() ? 'Select all matching visit types' : 'Select all visit types'}
            checked={allMatchesSelected}
            indeterminate={selectedMatches.length > 0 && !allMatchesSelected}
            disabled={page.matches.length === 0}
            onChange={toggleAllMatchesSelected}
            pl="md"
          />
        )}
        <TextInput
          aria-label="Filter visit types"
          placeholder="Filter visit types"
          leftSection={<IconSearch size={16} />}
          value={filterText}
          onChange={(event) => handleFilterChange(event.currentTarget.value)}
          style={{ flex: 1 }}
        />
        {!offersAllServices && selectedServices.length > 0 && (
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
                {!offersAllServices && (
                  <Checkbox
                    aria-label={`Select ${serviceLabel(service)}`}
                    checked={selectedIds.has(service.id)}
                    onChange={() => toggleSelected(service.id)}
                    pl="md"
                  />
                )}
                <Accordion.Control>{renderHeader(service)}</Accordion.Control>
                <OfferingMenu
                  service={service}
                  onStopOffering={() => setServicesToStop([service])}
                  stopDisabledReason={offersAllServices && isCoveredByAllServices(service) ? STOP_WHILE_ALL : undefined}
                />
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
        title={stopSubject && `Stop offering ${stopSubject}?`}
        cancelLabel="Keep offering"
        confirmLabel="Stop offering"
        destructive
        onCancel={() => setServicesToStop([])}
        onConfirm={confirmStop}
      >
        {stopSubject &&
          `${actorName} will no longer be offered for ${stopSubject} once you save. ` +
            "Existing appointments aren't changed."}
      </ConfirmModal>
    </>
  );
}

function stopConfirmSubject(services: readonly WithId<HealthcareService>[]): string | undefined {
  if (services.length === 0) {
    return undefined;
  }
  return services.length === 1 ? (services[0].name ?? 'this visit type') : `${services.length} visit types`;
}
