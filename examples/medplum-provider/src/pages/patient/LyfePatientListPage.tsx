// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  ActionIcon,
  Avatar,
  Badge,
  Box,
  Button,
  Center,
  Collapse,
  Group,
  Loader,
  Menu,
  Pagination,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import type { Bundle, Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import {
  IconAdjustmentsHorizontal,
  IconCalendar,
  IconChevronDown,
  IconChevronUp,
  IconDotsVertical,
  IconDownload,
  IconFilter,
  IconHash,
  IconMail,
  IconPhone,
  IconRefresh,
  IconSearch,
  IconSparkles,
  IconUsers,
} from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { LyfePageHeader } from '../../components/brand/LyfePageHeader';
import {
  ageToBirthDateBounds,
  formatDob,
  getAge,
  getAvatarColor,
  getContact,
  getDisplayName,
  getInitials,
  getMrn,
} from '../../components/patients/patient-roster-utils';

const PAGE_SIZE = 20;
const DEBOUNCE_MS = 300;

/** Columns that FHIR can actually sort on, so the header never offers a lie. */
const SORTABLE = {
  name: 'name',
  birthDate: 'birthdate',
  _lastUpdated: '_lastUpdated',
} as const;

type SortField = keyof typeof SORTABLE;

/** Uppercase micro-label used on every filter control, matching the Lyfe roster. */
const FILTER_LABEL = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.06em',
  color: 'var(--mantine-color-gray-5)',
} as const;

/**
 * The patient roster: search, sort, page and export the project's patients.
 * @returns The roster page.
 */
export function LyfePatientListPage(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState>({
    field: '_lastUpdated',
    desc: true,
  });
  const [patients, setPatients] = useState<Patient[]>();
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  const [showFilters, setShowFilters] = useState(false);
  const [dob, setDob] = useState('');
  const [ageMin, setAgeMin] = useState('');
  const [ageMax, setAgeMax] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [gender, setGender] = useState<string | null>(null);

  const activeFilterCount = [dob, ageMin, ageMax, status, gender].filter(Boolean).length;

  const clearFilters = useCallback(() => {
    setDob('');
    setAgeMin('');
    setAgeMax('');
    setStatus(null);
    setGender(null);
    setPage(1);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(query.trim());
      setPage(1);
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const params = new URLSearchParams();
    params.set('_count', String(PAGE_SIZE));
    params.set('_offset', String((page - 1) * PAGE_SIZE));
    params.set('_sort', `${sort.desc ? '-' : ''}${SORTABLE[sort.field]}`);
    params.set('_total', 'accurate');
    if (debounced) {
      params.set('name', debounced);
    }

    // An exact date of birth wins over the age range — it is the more specific
    // ask, and sending both would produce a contradictory window.
    if (dob) {
      params.set('birthdate', dob);
    } else {
      const bounds = ageToBirthDateBounds(ageMin ? Number(ageMin) : undefined, ageMax ? Number(ageMax) : undefined);
      if (bounds.ge) {
        params.append('birthdate', `ge${bounds.ge}`);
      }
      if (bounds.le) {
        params.append('birthdate', `le${bounds.le}`);
      }
    }

    if (status) {
      params.set('active', status);
    }
    if (gender) {
      params.set('gender', gender);
    }

    medplum
      .search('Patient', params.toString())
      .then((bundle: Bundle<Patient>) => {
        if (cancelled) {
          return;
        }
        setPatients(bundle.entry?.map((e) => e.resource as Patient) ?? []);
        setTotal(bundle.total ?? 0);
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [medplum, debounced, page, sort, reloadKey, dob, ageMin, ageMax, status, gender]);

  const toggleSort = useCallback((field: SortField) => {
    setSort((s) => (s.field === field ? { field, desc: !s.desc } : { field, desc: false }));
    setPage(1);
  }, []);

  const exportCsv = useCallback(() => {
    const rows = [
      ['Patient', 'MRN', 'DOB', 'Age', 'Gender', 'Email', 'Phone'],
      ...(patients ?? []).map((p) => {
        const { email, phone } = getContact(p);
        return [
          getDisplayName(p),
          getMrn(p) ?? '',
          formatDob(p.birthDate),
          getAge(p.birthDate),
          p.gender ?? '',
          email ?? '',
          phone ?? '',
        ];
      }),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `patients-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [patients]);

  return (
    <Stack gap="md" m="xs">
      <LyfePageHeader
        icon={<IconUsers size={20} />}
        eyebrow="Roster"
        title="Patients"
        count={total}
        description="Manage and view your patient roster"
        actions={
          <Button
            radius="md"
            leftSection={<IconSparkles size={16} />}
            onClick={() => navigate('/onboarding')?.catch(console.error)}
          >
            LyfeAI Onboarding
          </Button>
        }
      />

      <Paper shadow="xs" p="md" radius="md">
        <Stack gap="md">
          <Group gap="sm" wrap="nowrap">
            <TextInput
              flex={1}
              size="md"
              radius="md"
              placeholder="Search by name, MRN, email, or phone..."
              leftSection={<IconSearch size={16} />}
              rightSection={loading ? <Loader size="xs" /> : undefined}
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
              aria-label="Search patients"
            />
            <Tooltip label={showFilters ? 'Hide filters' : 'Advanced filters'}>
              <ActionIcon
                variant={showFilters || activeFilterCount ? 'filled' : 'default'}
                size={42}
                radius="md"
                onClick={() => setShowFilters((v) => !v)}
                aria-label="Toggle advanced filters"
                aria-expanded={showFilters}
              >
                <IconAdjustmentsHorizontal size={18} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Reload">
              <ActionIcon variant="default" size={42} radius="md" onClick={() => setReloadKey((k) => k + 1)}>
                <IconRefresh size={18} />
              </ActionIcon>
            </Tooltip>
            <Button
              variant="default"
              size="md"
              radius="md"
              leftSection={<IconDownload size={16} />}
              onClick={exportCsv}
              disabled={!patients?.length}
            >
              Export
            </Button>
          </Group>

          <Collapse in={showFilters}>
            <Box
              p="md"
              style={{
                border: '1px solid var(--mantine-color-gray-2)',
                borderRadius: 'var(--mantine-radius-md)',
                background: 'var(--mantine-color-gray-0)',
              }}
            >
              <Group justify="space-between" mb="sm">
                <Group gap="xs">
                  <IconAdjustmentsHorizontal size={16} color="var(--mantine-primary-color-filled)" />
                  <Text fw={600} size="sm" c="gray.9">
                    Advanced Filters
                  </Text>
                  {activeFilterCount > 0 && (
                    <Badge size="sm" radius="sm" variant="light">
                      {activeFilterCount}
                    </Badge>
                  )}
                </Group>
                {activeFilterCount > 0 && (
                  <Button variant="subtle" size="compact-sm" onClick={clearFilters}>
                    Clear all
                  </Button>
                )}
              </Group>

              <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
                <TextInput
                  label="DATE OF BIRTH"
                  placeholder="YYYY-MM-DD"
                  type="date"
                  leftSection={<IconCalendar size={14} />}
                  value={dob}
                  onChange={(e) => {
                    setDob(e.currentTarget.value);
                    setPage(1);
                  }}
                  styles={{ label: FILTER_LABEL }}
                />

                <Box>
                  <Text component="label" style={FILTER_LABEL}>
                    AGE RANGE
                  </Text>
                  <Group gap={6} wrap="nowrap" mt={4}>
                    <TextInput
                      placeholder="Min"
                      type="number"
                      min={0}
                      leftSection={<IconHash size={14} />}
                      value={ageMin}
                      disabled={!!dob}
                      onChange={(e) => {
                        setAgeMin(e.currentTarget.value);
                        setPage(1);
                      }}
                    />
                    <Text c="gray.5">–</Text>
                    <TextInput
                      placeholder="Max"
                      type="number"
                      min={0}
                      value={ageMax}
                      disabled={!!dob}
                      onChange={(e) => {
                        setAgeMax(e.currentTarget.value);
                        setPage(1);
                      }}
                    />
                  </Group>
                </Box>

                <Select
                  label="STATUS"
                  placeholder="All"
                  clearable
                  leftSection={<IconFilter size={14} />}
                  data={[
                    { value: 'true', label: 'Active' },
                    { value: 'false', label: 'Inactive' },
                  ]}
                  value={status}
                  onChange={(v) => {
                    setStatus(v);
                    setPage(1);
                  }}
                  styles={{ label: FILTER_LABEL }}
                />

                <Select
                  label="GENDER"
                  placeholder="All"
                  clearable
                  data={['female', 'male', 'other', 'unknown']}
                  value={gender}
                  onChange={(v) => {
                    setGender(v);
                    setPage(1);
                  }}
                  styles={{ label: FILTER_LABEL }}
                />
              </SimpleGrid>
            </Box>
          </Collapse>

          <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>
                  <SortHeader field="name" label="PATIENT" sort={sort} onToggle={toggleSort} />
                </Table.Th>
                <Table.Th>
                  <ColumnLabel label="MRN" />
                </Table.Th>
                <Table.Th>
                  <SortHeader field="birthDate" label="DOB" sort={sort} onToggle={toggleSort} />
                </Table.Th>
                <Table.Th>
                  <ColumnLabel label="AGE" />
                </Table.Th>
                <Table.Th>
                  <ColumnLabel label="GENDER" />
                </Table.Th>
                <Table.Th>
                  <ColumnLabel label="CONTACT" />
                </Table.Th>
                <Table.Th>
                  <ColumnLabel label="STATUS" />
                </Table.Th>
                <Table.Th>
                  <ColumnLabel label="ACTIONS" ta="right" />
                </Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {patients?.map((p) => {
                const { email, phone } = getContact(p);
                const mrn = getMrn(p);
                return (
                  <Table.Tr
                    key={p.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/Patient/${p.id}`)?.catch(console.error)}
                  >
                    <Table.Td>
                      <Group gap="sm" wrap="nowrap">
                        <Avatar color={getAvatarColor(p)} radius="xl" size={36}>
                          {getInitials(p)}
                        </Avatar>
                        <Text fw={500} size="sm" c="gray.9">
                          {getDisplayName(p)}
                        </Text>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      {mrn ? (
                        <Badge variant="default" radius="sm" style={{ fontWeight: 500, textTransform: 'none' }}>
                          {mrn}
                        </Badge>
                      ) : (
                        <Text size="sm" c="gray.4">
                          —
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="gray.6">
                        {formatDob(p.birthDate)}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="gray.9">
                        {getAge(p.birthDate)}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="gray.6" tt="capitalize">
                        {p.gender ?? '—'}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap={6}>
                        {email && (
                          <Tooltip label={email}>
                            <IconMail size={16} color="var(--mantine-color-gray-5)" />
                          </Tooltip>
                        )}
                        {phone && (
                          <Tooltip label={phone}>
                            <IconPhone size={16} color="var(--mantine-color-gray-5)" />
                          </Tooltip>
                        )}
                        {!email && !phone && (
                          <Text size="sm" c="gray.4">
                            —
                          </Text>
                        )}
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      {/* Patient.active is the only status FHIR carries here; Lyfe's
                          invite state has no Medplum equivalent yet, so nothing is invented. */}
                      <Badge
                        variant="light"
                        radius="sm"
                        color={p.active === false ? 'gray' : 'teal'}
                        style={{ fontWeight: 500, textTransform: 'none' }}
                      >
                        {p.active === false ? 'Inactive' : 'Active'}
                      </Badge>
                    </Table.Td>
                    <Table.Td ta="right" onClick={(e) => e.stopPropagation()}>
                      <Menu position="bottom-end" shadow="md" radius="md">
                        <Menu.Target>
                          <ActionIcon variant="subtle" color="gray" aria-label="Patient actions">
                            <IconDotsVertical size={16} />
                          </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Item onClick={() => navigate(`/Patient/${p.id}`)?.catch(console.error)}>
                            Open chart
                          </Menu.Item>
                          <Menu.Item onClick={() => navigate(`/Patient/${p.id}/edit`)?.catch(console.error)}>
                            Edit
                          </Menu.Item>
                          <Menu.Item onClick={() => navigate(`/Patient/${p.id}/export`)?.catch(console.error)}>
                            Export record
                          </Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>

          {!loading && patients?.length === 0 && (
            <Text c="gray.5" size="sm" ta="center" py="xl">
              {debounced ? `No patients match “${debounced}”.` : 'No patients yet.'}
            </Text>
          )}

          {total > PAGE_SIZE && (
            <Center>
              <Pagination value={page} onChange={setPage} total={Math.ceil(total / PAGE_SIZE)} radius="md" size="sm" />
            </Center>
          )}
        </Stack>
      </Paper>
    </Stack>
  );
}

interface SortState {
  readonly field: SortField;
  readonly desc: boolean;
}

/**
 * A column heading that toggles sort order on click.
 * @param props - Component props.
 * @param props.field - The FHIR field this column sorts on.
 * @param props.label - The heading text.
 * @param props.sort - The roster's current sort state.
 * @param props.onToggle - Called with the field when the heading is clicked.
 * @returns The heading element.
 */
function SortHeader(props: {
  readonly field: SortField;
  readonly label: string;
  readonly sort: SortState;
  readonly onToggle: (field: SortField) => void;
}): JSX.Element {
  const { field, label, sort, onToggle } = props;
  const active = sort.field === field;
  return (
    <UnstyledButton onClick={() => onToggle(field)} aria-label={`Sort by ${label}`}>
      <Group gap={4} wrap="nowrap">
        <ColumnLabel label={label} />
        {active &&
          (sort.desc ? (
            <IconChevronDown size={12} color="var(--mantine-color-gray-5)" />
          ) : (
            <IconChevronUp size={12} color="var(--mantine-color-gray-5)" />
          ))}
      </Group>
    </UnstyledButton>
  );
}

/**
 * A non-sortable column heading, styled to match the sortable ones.
 * @param props - Component props.
 * @param props.label - The heading text.
 * @param props.ta - Optional text alignment.
 * @returns The heading element.
 */
function ColumnLabel(props: { readonly label: string; readonly ta?: 'right' }): JSX.Element {
  return (
    <Text fz={11} fw={600} c="gray.5" style={{ letterSpacing: '0.06em' }} ta={props.ta}>
      {props.label}
    </Text>
  );
}
