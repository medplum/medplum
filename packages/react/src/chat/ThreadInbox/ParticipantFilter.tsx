// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Checkbox, CloseButton, Group, Popover, Stack, Text, TextInput } from '@mantine/core';
import { useDebouncedCallback, useDisclosure } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { createReference, formatHumanName, getReferenceString, normalizeErrorString } from '@medplum/core';
import type { Patient, Practitioner, Reference } from '@medplum/fhirtypes';
import { useMedplum, useMedplumProfile, useResource } from '@medplum/react-hooks';
import { IconUsers } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { ResourceAvatar } from '../../ResourceAvatar/ResourceAvatar';
import classes from './ParticipantFilter.module.css';

interface ParticipantFilterProps {
  readonly selectedParticipants: Reference<Patient | Practitioner>[];
  readonly onFilterChange: (participants: Reference<Patient | Practitioner>[]) => void;
}

export function ParticipantFilter(props: ParticipantFilterProps): JSX.Element {
  const { selectedParticipants, onFilterChange } = props;
  const [opened, { open, close }] = useDisclosure(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Reference<Patient | Practitioner>[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [additionalParticipants, setAdditionalParticipants] = useState<Reference<Patient | Practitioner>[]>([]);
  const medplum = useMedplum();
  const profile = useMedplumProfile();

  // Current user participant - always shown at top
  const currentUserParticipant = useMemo((): Reference<Patient | Practitioner> | undefined => {
    if (!profile) {
      return undefined;
    }
    return createReference(profile) as Reference<Patient | Practitioner>;
  }, [profile]);

  // Filter additional participants (excluding current user)
  useEffect(() => {
    const currentUserRef = currentUserParticipant?.reference;
    const filtered = selectedParticipants.filter((p) => p.reference !== currentUserRef);
    setAdditionalParticipants(filtered);
  }, [selectedParticipants, currentUserParticipant]);

  const debouncedSearch = useDebouncedCallback(async (query: string): Promise<void> => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const bundle = await medplum.search('Patient', {
        _type: 'Patient,Practitioner',
        name: query,
        _count: '10',
      });

      const currentUserRef = currentUserParticipant?.reference;

      const results = (bundle.entry ?? [])
        .map((entry) => entry.resource as Patient | Practitioner)
        .filter((resource): resource is Patient | Practitioner => {
          if (!resource) {
            return false;
          }
          const refString = getReferenceString(resource);
          return !!refString && refString !== currentUserRef;
        })
        .map((resource) => createReference(resource));

      setSearchResults(results);
    } catch (error) {
      showNotification({
        title: 'Error',
        message: normalizeErrorString(error),
        color: 'red',
      });
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, 300);

  useEffect(() => {
    debouncedSearch(searchQuery);
  }, [searchQuery, debouncedSearch]);

  const isSelected = (participant: Reference<Patient | Practitioner>): boolean => {
    return selectedParticipants.some((p) => p.reference === participant.reference);
  };

  const toggleParticipant = (participant: Reference<Patient | Practitioner>): void => {
    const newParticipants = isSelected(participant)
      ? selectedParticipants.filter((p) => p.reference !== participant.reference)
      : [...selectedParticipants, participant];

    onFilterChange(newParticipants);
  };

  const removeParticipant = (participant: Reference<Patient | Practitioner>): void => {
    const newParticipants = selectedParticipants.filter((p) => p.reference !== participant.reference);
    onFilterChange(newParticipants);
  };

  // Build display list: current user first, then additional selected, then search results
  const displayParticipants = useMemo(() => {
    const result: Reference<Patient | Practitioner>[] = [];

    for (const p of additionalParticipants) {
      if (!result.some((r) => r.reference === p.reference)) {
        result.push(p);
      }
    }

    if (searchQuery.trim() && searchResults.length > 0) {
      for (const p of searchResults) {
        if (currentUserParticipant?.reference === p.reference) {
          continue;
        }
        if (!result.some((r) => r.reference === p.reference)) {
          result.push(p);
        }
      }
    }

    return result;
  }, [additionalParticipants, searchQuery, searchResults, currentUserParticipant]);

  const hasActiveFilter = selectedParticipants.length > 0;

  return (
    <Popover
      opened={opened}
      onChange={(o) => !o && close()}
      position="bottom-start"
      width={360}
      shadow="md"
      withinPortal
    >
      <Popover.Target>
        <ActionIcon
          variant={hasActiveFilter ? 'filled' : 'light'}
          color={hasActiveFilter ? 'blue' : 'gray'}
          onClick={opened ? close : open}
          radius="xl"
          size="lg"
        >
          <IconUsers size={18} />
        </ActionIcon>
      </Popover.Target>

      <Popover.Dropdown p="md">
        <Stack gap="md">
          <Text fw={600} size="sm">
            Message Participants
          </Text>

          <TextInput
            placeholder="Search for a Patient or Practitioner..."
            value={searchQuery}
            autoFocus
            onChange={(e) => setSearchQuery(e.target.value)}
            rightSection={searchQuery ? <CloseButton size="sm" onClick={() => setSearchQuery('')} /> : null}
          />

          <Stack gap="xs" mah={250} style={{ overflowY: 'auto' }}>
            {currentUserParticipant && (
              <ParticipantItem
                participant={currentUserParticipant}
                isSelected={isSelected(currentUserParticipant)}
                isCurrentUser={true}
                onToggle={() => toggleParticipant(currentUserParticipant)}
              />
            )}

            {displayParticipants.map((participant) => (
              <ParticipantItem
                key={participant.reference}
                participant={participant}
                isSelected={isSelected(participant)}
                isCurrentUser={false}
                onToggle={() => toggleParticipant(participant)}
                onRemove={isSelected(participant) ? () => removeParticipant(participant) : undefined}
              />
            ))}

            {isSearching && (
              <Text size="sm" c="dimmed" ta="center">
                Searching...
              </Text>
            )}
            {searchQuery.trim() && !isSearching && searchResults.length === 0 && (
              <Text size="sm" c="dimmed" ta="center">
                No results found
              </Text>
            )}
          </Stack>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

interface ParticipantItemProps {
  readonly participant: Reference<Patient | Practitioner>;
  readonly isSelected: boolean;
  readonly isCurrentUser: boolean;
  readonly onToggle: () => void;
  readonly onRemove?: () => void;
}

function ParticipantItem(props: ParticipantItemProps): JSX.Element | null {
  const { participant, isSelected, isCurrentUser, onToggle, onRemove } = props;
  const patientResource = useResource(participant);

  if (!patientResource) {
    return null;
  }

  return (
    <Group justify="space-between" wrap="nowrap" className={classes.participantItem}>
      <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
        <Checkbox checked={isSelected} onChange={onToggle} />
        <ResourceAvatar value={participant} radius="xl" size={32} />
        <Text size="sm" truncate style={{ flex: 1 }}>
          {formatHumanName(patientResource?.name?.[0] ?? {})}
          {isCurrentUser && (
            <Text component="span" c="dimmed" size="sm">
              {' '}
              (you)
            </Text>
          )}
        </Text>
      </Group>
      {onRemove && <CloseButton size="sm" onClick={onRemove} />}
    </Group>
  );
}
