// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Checkbox, Combobox, Group, Text, useCombobox } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { HealthcareService } from '@medplum/fhirtypes';
import { IconChevronDown } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useState } from 'react';
import { matchesFilter } from '../SchedulingConfigWorkspace.utils';

const PAGE_SIZE = 10;
const SHOW_MORE = '__show-more';

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
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [shown, setShown] = useState(PAGE_SIZE);
  // What was ticked when the search last changed, listed first so a new search can't hide it. A box ticked since
  // stays where it is, so the list doesn't move under the pointer.
  const [pinned, setPinned] = useState<ReadonlySet<string>>(new Set());
  const combobox = useCombobox({
    onDropdownOpen: () => combobox.focusSearchInput(),
    onDropdownClose: () => {
      combobox.resetSelectedOption();
      setSearch('');
      setChecked(new Set());
      setPinned(new Set());
      setShown(PAGE_SIZE);
    },
  });

  if (services.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        There is nothing more to offer: every active visit type is offered here.
      </Text>
    );
  }

  function handleOptionSubmit(id: string): void {
    if (id === SHOW_MORE) {
      setShown((current) => current + PAGE_SIZE);
      return;
    }
    setChecked((current) => {
      const next = new Set(current);
      if (!next.delete(id)) {
        next.add(id);
      }
      return next;
    });
  }

  function handleOffer(): void {
    onOffer(services.filter((service) => checked.has(service.id)));
    combobox.closeDropdown();
  }

  return (
    <Group>
      <Combobox store={combobox} width={360} position="bottom-start" onOptionSubmit={handleOptionSubmit}>
        <Combobox.Target withAriaAttributes={false}>
          <Button
            variant="light"
            rightSection={<IconChevronDown size={16} />}
            onClick={() => combobox.toggleDropdown()}
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
            {/* Combobox keeps a closed dropdown mounted, so options are built only while it's open. */}
            {combobox.dropdownOpened && (
              <OfferOptions services={services} search={search} shown={shown} checked={checked} pinned={pinned} />
            )}
          </Combobox.Options>
          <Combobox.Footer>
            <Button fullWidth size="xs" disabled={checked.size === 0} onClick={handleOffer}>
              {offerLabel(checked.size)}
            </Button>
          </Combobox.Footer>
        </Combobox.Dropdown>
      </Combobox>
    </Group>
  );
}

interface OfferOptionsProps {
  readonly services: readonly WithId<HealthcareService>[];
  readonly search: string;
  readonly shown: number;
  readonly checked: ReadonlySet<string>;
  readonly pinned: ReadonlySet<string>;
}

function OfferOptions(props: OfferOptionsProps): JSX.Element {
  const { services, search, shown, checked, pinned } = props;
  const first = services.filter((service) => pinned.has(service.id));
  const matches = services.filter((service) => !pinned.has(service.id) && matchesFilter(service.name ?? '', search));
  if (first.length + matches.length === 0) {
    return <Combobox.Empty>No visit types match</Combobox.Empty>;
  }
  const hidden = matches.length - shown;
  return (
    <>
      {[...first, ...matches.slice(0, shown)].map((service) => (
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
            <Text size="sm">{service.name ?? 'Untitled visit type'}</Text>
          </Group>
        </Combobox.Option>
      ))}
      {hidden > 0 && (
        <Combobox.Option value={SHOW_MORE}>
          <Text size="sm" c="blue">
            Show more ({hidden} not shown)
          </Text>
        </Combobox.Option>
      )}
    </>
  );
}

function offerLabel(count: number): string {
  if (count === 0) {
    return 'Offer';
  }
  return count === 1 ? 'Offer 1 visit type' : `Offer ${count} visit types`;
}
