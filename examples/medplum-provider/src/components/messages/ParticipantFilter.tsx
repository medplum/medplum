// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import {
  ActionIcon,
  Checkbox,
  CloseButton,
  Group,
  Popover,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { useDebouncedCallback, useDisclosure } from '@mantine/hooks';
import { createReference, formatHumanName, getReferenceString } from '@medplum/core';
import type { Patient, Practitioner, Reference } from '@medplum/fhirtypes';
import { ResourceAvatar, useMedplum, useMedplumProfile } from '@medplum/react';
import { IconUsers } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import classes from './ParticipantFilter.module.css';
import { showErrorNotification } from '../../utils/notifications';

interface Participant {
  reference: string;
  display: string;
}

interface ParticipantFilterProps {
  selectedParticipantRefs: string[];
  onFilterChange: (participantRefs: string[]) => void;
}

export function ParticipantFilter(props: ParticipantFilterProps): JSX.Element {
  const { selectedParticipantRefs, onFilterChange } = props;
  const [opened, { open, close }] = useDisclosure(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Participant[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [additionalParticipants, setAdditionalParticipants] = useState<Participant[]>([]);
  const medplum = useMedplum();
  const profile = useMedplumProfile();

  // Current user participant - always shown at top
  const currentUserParticipant = useMemo((): Participant | undefined => {
    if (!profile) {
      return undefined;
    }
    const ref = createReference(profile);
    const refString = getReferenceString(ref);
    if (!refString) {
      return undefined;
    }
    return {
      reference: refString,
      display: formatHumanName(profile.name?.[0]) ?? 'You',
    };
  }, [profile]);

  // Resolve additional participants from URL (excluding current user)
  useEffect(() => {
    const resolveParticipants = async (): Promise<void> => {
      if (selectedParticipantRefs.length === 0) {
        setAdditionalParticipants([]);
        return;
      }

      const resolved: Participant[] = [];
      for (const ref of selectedParticipantRefs) {
        if (currentUserParticipant?.reference === ref) {
          continue;
        }
        try {
          const [resourceType, id] = ref.split('/');
          if (resourceType && id) {
            const resource = await medplum.readResource(resourceType as 'Patient' | 'Practitioner', id);
            const name = 'name' in resource && resource.name?.[0] ? formatHumanName(resource.name[0]) : undefined;
            resolved.push({
              reference: ref,
              display: name ?? ref,
            });
          }
        } catch {
          resolved.push({ reference: ref, display: ref });
        }
      }
      setAdditionalParticipants(resolved);
    };

    resolveParticipants().catch(console.error);
  }, [selectedParticipantRefs, medplum, currentUserParticipant]);

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
        .map((resource) => createReference(resource) as Participant);

      setSearchResults(results);
    } catch (error) {
      showErrorNotification(error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, 300);

  useEffect(() => {
    debouncedSearch(searchQuery);
  }, [searchQuery, debouncedSearch]);

  const isSelected = (reference: string): boolean => {
    return selectedParticipantRefs.includes(reference);
  };

  const toggleParticipant = (participant: Participant): void => {
    const newRefs = isSelected(participant.reference)
      ? selectedParticipantRefs.filter((ref) => ref !== participant.reference)
      : [...selectedParticipantRefs, participant.reference];

    onFilterChange(newRefs);
  };

  const removeParticipant = (participant: Participant): void => {
    const newRefs = selectedParticipantRefs.filter((ref) => ref !== participant.reference);
    onFilterChange(newRefs);
  };

  // Build display list: current user first, then additional selected, then search results
  const displayParticipants = useMemo(() => {
    const result: Participant[] = [];

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

  const hasActiveFilter = selectedParticipantRefs.length > 0;

  return (
    <Popover opened={opened} onChange={(o) => !o && close()} position="bottom-start" width={360} shadow="md" withinPortal>
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
                isSelected={isSelected(currentUserParticipant.reference)}
                isCurrentUser={true}
                onToggle={() => toggleParticipant(currentUserParticipant)}
              />
            )}

            {displayParticipants.map((participant) => (
              <ParticipantItem
                key={participant.reference}
                participant={participant}
                isSelected={isSelected(participant.reference)}
                isCurrentUser={false}
                onToggle={() => toggleParticipant(participant)}
                onRemove={isSelected(participant.reference) ? () => removeParticipant(participant) : undefined}
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
  participant: Participant;
  isSelected: boolean;
  isCurrentUser: boolean;
  onToggle: () => void;
  onRemove?: () => void;
}

function ParticipantItem(props: ParticipantItemProps): JSX.Element {
  const { participant, isSelected, isCurrentUser, onToggle, onRemove } = props;

  return (
    <Group justify="space-between" wrap="nowrap" className={classes.participantItem}>
      <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
        <Checkbox checked={isSelected} onChange={onToggle} />
        <ResourceAvatar
          value={{ reference: participant.reference } as Reference<Patient | Practitioner>}
          radius="xl"
          size={32}
        />
        <Text size="sm" truncate style={{ flex: 1 }}>
          {participant.display}
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
