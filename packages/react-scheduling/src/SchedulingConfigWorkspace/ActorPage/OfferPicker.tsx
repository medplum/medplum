// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Checkbox, Combobox, Group, Stack, Text, useCombobox } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { HealthcareService } from '@medplum/fhirtypes';
import { IconChevronDown } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useMemo, useState } from 'react';
import { matchesFilter } from '../SchedulingConfigWorkspace.utils';

const PAGE_SIZE = 10;

export interface OfferPickerProps {
  /** The active visit types the Schedule doesn't offer yet. */
  readonly services: readonly WithId<HealthcareService>[];
  readonly onOffer: (services: WithId<HealthcareService>[]) => void;
}

/**
 * A button opening a searchable list of the visit types an actor could offer, to tick any number of and offer
 * together.
 * @param props - The visit types to choose from, and what to do with the ones chosen.
 * @returns The picker.
 */
export function OfferPicker(props: OfferPickerProps): JSX.Element {
  const { services, onOffer } = props;
  const [search, setSearch] = useState('');
  // Kept when the dropdown closes, so a stray click outside it doesn't lose what was ticked.
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [shown, setShown] = useState(PAGE_SIZE);
  // What was ticked when the list was last opened or searched, listed first so a new search can't hide it. A box
  // ticked since stays where it is, so the list doesn't move under the pointer.
  const [pinned, setPinned] = useState<ReadonlySet<string>>(new Set());
  const combobox = useCombobox({
    onDropdownOpen: () => {
      setPinned(checked);
      combobox.focusSearchInput();
    },
    onDropdownClose: (eventSource) => {
      combobox.resetSelectedOption();
      // Not after a click elsewhere, which would pull focus back from what was clicked.
      if (eventSource === 'keyboard') {
        combobox.focusTarget();
      }
      setSearch('');
      setShown(PAGE_SIZE);
    },
  });
  const options = useMemo(() => listOptions(services, search, shown, pinned), [services, search, shown, pinned]);

  if (services.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No active visit types are left to offer.
      </Text>
    );
  }

  const chosen = services.filter((service) => checked.has(service.id));

  function toggle(id: string): void {
    setChecked((current) => {
      const next = new Set(current);
      if (!next.delete(id)) {
        next.add(id);
      }
      return next;
    });
  }

  function handleOffer(): void {
    onOffer(chosen);
    setChecked(new Set());
    combobox.closeDropdown();
    combobox.focusTarget();
  }

  // Combobox keeps a closed dropdown mounted, so its options are rendered only while it's open.
  const list = combobox.dropdownOpened ? options : undefined;

  return (
    <Group>
      <Combobox store={combobox} width={360} position="bottom-start" onOptionSubmit={toggle}>
        <Combobox.Target withAriaAttributes={false}>
          <Button
            variant="light"
            rightSection={<IconChevronDown size={16} />}
            onClick={() => combobox.toggleDropdown()}
            aria-haspopup="listbox"
            aria-expanded={combobox.dropdownOpened}
          >
            Offer visit types
          </Button>
        </Combobox.Target>
        <Combobox.Dropdown>
          <Combobox.Search
            value={search}
            onChange={(event) => {
              setSearch(event.currentTarget.value);
              setShown(PAGE_SIZE);
              setPinned(checked);
              combobox.updateSelectedOptionIndex();
            }}
            placeholder="Search visit types"
            aria-label="Search visit types"
          />
          <Combobox.Options mah={280} style={{ overflowY: 'auto' }} aria-multiselectable>
            {list?.rows.length === 0 && <Combobox.Empty>No visit types match</Combobox.Empty>}
            {list?.rows.map((service) => (
              <Combobox.Option
                key={service.id}
                value={service.id}
                active={checked.has(service.id)}
                aria-selected={checked.has(service.id)}
              >
                <Group gap="sm" wrap="nowrap">
                  <Checkbox
                    checked={checked.has(service.id)}
                    onChange={() => undefined}
                    aria-hidden
                    tabIndex={-1}
                    style={{ pointerEvents: 'none' }}
                  />
                  <Text size="sm">{serviceLabel(service)}</Text>
                </Group>
              </Combobox.Option>
            ))}
          </Combobox.Options>
          <Combobox.Footer>
            <Stack gap="xs">
              {!!list?.hidden && (
                <Button
                  variant="subtle"
                  size="xs"
                  onClick={() => {
                    setShown((current) => current + PAGE_SIZE);
                    combobox.focusSearchInput();
                  }}
                >
                  Show more ({list.hidden} not shown)
                </Button>
              )}
              <Button fullWidth size="xs" disabled={chosen.length === 0} onClick={handleOffer}>
                {offerLabel(chosen.length)}
              </Button>
            </Stack>
          </Combobox.Footer>
        </Combobox.Dropdown>
      </Combobox>
    </Group>
  );
}

function listOptions(
  services: readonly WithId<HealthcareService>[],
  search: string,
  shown: number,
  pinned: ReadonlySet<string>
): { rows: WithId<HealthcareService>[]; hidden: number } {
  const first = services.filter((service) => pinned.has(service.id));
  const matches = services.filter((service) => !pinned.has(service.id) && matchesFilter(serviceLabel(service), search));
  return { rows: [...first, ...matches.slice(0, shown)], hidden: Math.max(matches.length - shown, 0) };
}

function serviceLabel(service: HealthcareService): string {
  return service.name ?? 'Untitled visit type';
}

function offerLabel(count: number): string {
  if (count === 0) {
    return 'Offer';
  }
  return count === 1 ? 'Offer 1 visit type' : `Offer ${count} visit types`;
}
