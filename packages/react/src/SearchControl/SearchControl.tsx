// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  ActionIcon,
  Button,
  Center,
  Checkbox,
  Group,
  Loader,
  Menu,
  Pagination,
  Table,
  Text,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import type { Filter, SearchRequest } from '@medplum/core';
import {
  deepEquals,
  DEFAULT_SEARCH_COUNT,
  formatSearchQuery,
  isDataTypeLoaded,
  normalizeOperationOutcome,
} from '@medplum/core';
import type { Bundle, OperationOutcome, Resource, SearchParameter } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import {
  IconArrowDown,
  IconArrowUp,
  IconColumns,
  IconDots,
  IconFilter,
  IconLibraryPlus,
  IconPlus,
  IconReload,
  IconTableExport,
  IconTrash,
} from '@tabler/icons-react';
import type { JSX, KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Container } from '../Container/Container';
import { Modal } from '../Modal/Modal';
import { OperationOutcomeAlert } from '../OperationOutcomeAlert/OperationOutcomeAlert';
import { SearchExportDialog } from '../SearchExportDialog/SearchExportDialog';
import { SearchFieldEditor } from '../SearchFieldEditor/SearchFieldEditor';
import { SearchFilterEditor } from '../SearchFilterEditor/SearchFilterEditor';
import { SearchFilterValueDialog } from '../SearchFilterValueDialog/SearchFilterValueDialog';
import { SearchFilterValueDisplay } from '../SearchFilterValueDisplay/SearchFilterValueDisplay';
import { SearchPopupMenu } from '../SearchPopupMenu/SearchPopupMenu';
import { SearchSortEditor } from '../SearchSortEditor/SearchSortEditor';
import { isAuxClick, isCheckboxCell, killEvent } from '../utils/dom';
import { getPaginationControlProps } from '../utils/pagination';
import classes from './SearchControl.module.css';
import { getFieldDefinitions } from './SearchControlField';
import { addFilter, buildFieldNameString, DEFAULT_SORT_RULES, getOpString, renderValue, setPage } from './SearchUtils';

export class SearchChangeEvent extends Event {
  readonly definition: SearchRequest;

  constructor(definition: SearchRequest) {
    super('change');
    this.definition = definition;
  }
}

export class SearchLoadEvent extends Event {
  readonly response: Bundle;

  constructor(response: Bundle) {
    super('load');
    this.response = response;
  }
}

export class SearchClickEvent extends Event {
  readonly resource: Resource;
  readonly browserEvent: MouseEvent;

  constructor(resource: Resource, browserEvent: MouseEvent) {
    super('click');
    this.resource = resource;
    this.browserEvent = browserEvent;
  }
}

/**
 * An additional, computed column appended after the search-result columns. It is not backed by a
 * search parameter, so it has no sort/filter menu and renders arbitrary content per row.
 */
export interface SearchControlAdditionalColumn {
  /** The column header text. */
  readonly name: string;
  /** Renders the cell contents for the given row resource. */
  readonly renderCell: (resource: Resource) => ReactNode;
}

export interface SearchControlProps {
  readonly search: SearchRequest;
  readonly checkboxesEnabled?: boolean;
  /** Additional computed columns rendered after the search-result columns. */
  readonly additionalColumns?: readonly SearchControlAdditionalColumn[];
  readonly hideToolbar?: boolean;
  /** Hides the per-column filter description row under the column headers. */
  readonly hideFilters?: boolean;
  readonly onLoad?: (e: SearchLoadEvent) => void;
  readonly onChange?: (e: SearchChangeEvent) => void;
  readonly onClick?: (e: SearchClickEvent) => void;
  readonly onAuxClick?: (e: SearchClickEvent) => void;
  readonly onNew?: () => void;
  readonly onExport?: () => void;
  readonly onExportCsv?: () => void;
  readonly onExportTransactionBundle?: () => void;
  /**
   * Deletes the checked rows after confirmation. A returned Promise keeps the modal open with a
   * loading button until it settles; a rejection leaves the modal open for the caller to report.
   */
  readonly onDelete?: (ids: string[]) => void | Promise<void>;
  readonly onBulk?: (ids: string[]) => void;
}

interface SearchControlState {
  readonly searchResponse?: Bundle;
  readonly selected: { [id: string]: boolean };
  readonly exportDialogVisible: boolean;
  readonly deleteConfirmVisible?: boolean;
  readonly deleting?: boolean;
  readonly dialogOpenTime?: number;
  readonly fieldEditorVisible: boolean;
  readonly filterEditorVisible: boolean;
  readonly filterDialogVisible: boolean;
  readonly filterDialogFilter?: Filter;
  readonly filterDialogSearchParam?: SearchParameter;
}

/**
 * Embeddable FHIR search table with a toolbar (column, filter and sort popovers, result count,
 * actions menu, New button), sortable/filterable column headers, optional row checkboxes and
 * pagination. Controlled: every change is emitted through `onChange` for the caller to apply.
 * @param props - The SearchControl React props.
 * @returns The SearchControl React node.
 */
export function SearchControl(props: SearchControlProps): JSX.Element {
  const medplum = useMedplum();
  const [outcome, setOutcome] = useState<OperationOutcome | undefined>();
  const { search, onLoad } = props;
  const sortedSearch = search.sortRules?.length ? search : { ...search, sortRules: [...DEFAULT_SORT_RULES] };

  const [memoizedSearch, setMemoizedSearch] = useState(sortedSearch);

  if (!deepEquals(sortedSearch, memoizedSearch)) {
    setMemoizedSearch(sortedSearch);
  }

  const [state, setState] = useState<SearchControlState>({
    selected: {},
    exportDialogVisible: false,
    fieldEditorVisible: false,
    filterEditorVisible: false,
    filterDialogVisible: false,
  });
  const [activeRowId, setActiveRowId] = useState<string>();

  const total = memoizedSearch.total ?? 'accurate';

  const loadResults = useCallback(
    (options?: RequestInit) => {
      setOutcome(undefined);
      medplum
        .requestSchema(memoizedSearch.resourceType)
        .then(() =>
          medplum.search(
            memoizedSearch.resourceType,
            formatSearchQuery({ ...memoizedSearch, total, fields: undefined }),
            options
          )
        )
        .then((response) => {
          setState((s) => ({ ...s, searchResponse: response }));
          if (onLoad) {
            onLoad(new SearchLoadEvent(response));
          }
        })
        .catch((reason) => {
          setState((s) => ({ ...s, searchResponse: undefined }));
          setOutcome(normalizeOperationOutcome(reason));
        });
    },
    [medplum, memoizedSearch, total, onLoad]
  );

  const refreshResults = useCallback(() => {
    setState((s) => ({ ...s, searchResponse: undefined }));
    loadResults({ cache: 'reload' });
  }, [loadResults]);

  useEffect(() => {
    loadResults();
  }, [loadResults]);

  /**
   * Checks or unchecks a row.
   * @param id - The row's resource ID.
   * @param checked - The new checked state; toggles the row when omitted.
   */
  function setRowSelected(id: string, checked?: boolean): void {
    setState((s) => {
      const newSelected = { ...s.selected };
      if (checked ?? !s.selected[id]) {
        newSelected[id] = true;
      } else {
        delete newSelected[id];
      }
      return { ...s, selected: newSelected };
    });
  }

  function setAllSelected(checked: boolean): void {
    setState((s) => {
      const newSelected = {} as { [id: string]: boolean };
      if (checked && s.searchResponse?.entry) {
        s.searchResponse.entry.forEach((entry) => {
          if (entry.resource?.id) {
            newSelected[entry.resource.id] = true;
          }
        });
      }
      return { ...s, selected: newSelected };
    });
  }

  function emitSearchChange(newSearch: SearchRequest): void {
    if (props.onChange) {
      props.onChange(new SearchChangeEvent(newSearch));
    }
  }

  function handleRowClick(e: MouseEvent, resource: Resource): void {
    if (isCheckboxCell(e.target as Element) || e.button === 2) {
      return;
    }

    killEvent(e);

    const isAux = isAuxClick(e);

    if (!isAux && props.onClick) {
      props.onClick(new SearchClickEvent(resource, e));
    }

    if (isAux && props.onAuxClick) {
      props.onAuxClick(new SearchClickEvent(resource, e));
    }
  }

  /**
   * Keyboard support for a focused row: arrows and Home/End move between rows, Enter clicks the row
   * (Ctrl/Cmd+Enter as an auxiliary click) and Space toggles its checkbox.
   * @param e - The keydown event.
   * @param resource - The row's resource.
   */
  function handleRowKeyDown(e: KeyboardEvent<HTMLTableRowElement>, resource: Resource): void {
    if (e.target !== e.currentTarget) {
      return;
    }
    const row = e.currentTarget;
    let nextRow: Element | null | undefined;
    if (e.key === 'ArrowDown') {
      nextRow = row.nextElementSibling;
    } else if (e.key === 'ArrowUp') {
      nextRow = row.previousElementSibling;
    } else if (e.key === 'Home') {
      nextRow = row.parentElement?.firstElementChild;
    } else if (e.key === 'End') {
      nextRow = row.parentElement?.lastElementChild;
    } else if (e.key === 'Enter') {
      killEvent(e);
      row.dispatchEvent(
        new window.MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: e.ctrlKey, metaKey: e.metaKey })
      );
      return;
    } else if (e.key === ' ' && checkboxColumn) {
      killEvent(e);
      setRowSelected(resource.id as string);
      return;
    } else {
      return;
    }
    killEvent(e);
    (nextRow as HTMLElement | null | undefined)?.focus();
  }

  async function runDelete(): Promise<void> {
    const ids = Object.keys(state.selected);
    setState((s) => ({ ...s, deleting: true }));
    try {
      await props.onDelete?.(ids);
      setState((s) => ({ ...s, selected: {}, deleting: false, deleteConfirmVisible: false }));
      loadResults({ cache: 'reload' });
    } catch {
      setState((s) => ({ ...s, deleting: false }));
    }
  }

  function closeDeleteConfirm(): void {
    setState((s) => ({ ...s, deleteConfirmVisible: false }));
  }

  if (outcome) {
    return <OperationOutcomeAlert outcome={outcome} />;
  }

  if (!isDataTypeLoaded(memoizedSearch.resourceType)) {
    return (
      <Center style={{ width: '100%', height: '100%' }}>
        <Loader />
      </Center>
    );
  }

  const checkboxColumn = props.checkboxesEnabled;
  const fields = getFieldDefinitions(memoizedSearch);
  const resourceType = memoizedSearch.resourceType;
  const lastResult = state.searchResponse;
  const entries = lastResult?.entry;
  const resources = entries?.map((e) => e.resource);

  const selectedIds = Object.keys(state.selected);
  const allSelected = !!entries?.length && entries.every((e) => !e.resource?.id || state.selected[e.resource.id]);
  const showExport = !!(props.onExport ?? props.onExportCsv ?? props.onExportTransactionBundle);
  const showDelete = !!props.onDelete;
  const showBulk = !!props.onBulk;

  const focusableRowId =
    activeRowId && resources?.some((r) => r?.id === activeRowId) ? activeRowId : resources?.find(Boolean)?.id;

  return (
    <div className={classes.root} data-testid="search-control">
      {!props.hideToolbar && (
        <Group justify="space-between" pb="md" className={classes.toolbar}>
          <Group gap="xs">
            <Button
              className={classes.toolbarButton}
              size="compact-md"
              variant="subtle"
              color="gray"
              leftSection={<IconColumns size={16} />}
              onClick={() => setState((s) => ({ ...s, fieldEditorVisible: true, dialogOpenTime: Date.now() }))}
            >
              Fields
            </Button>
            <Button
              className={classes.toolbarButton}
              size="compact-md"
              variant="subtle"
              color="gray"
              leftSection={<IconFilter size={16} />}
              onClick={() => setState((s) => ({ ...s, filterEditorVisible: true, dialogOpenTime: Date.now() }))}
            >
              Filters
            </Button>
            <SearchSortEditor search={memoizedSearch} onChange={emitSearchChange} />
            {lastResult && (
              <Text size="xs" fw={500} c="dimmed" ml={4} data-testid="count-display">
                {getStart(memoizedSearch, lastResult).toLocaleString()}-
                {getEnd(memoizedSearch, lastResult).toLocaleString()}
                {lastResult.total !== undefined &&
                  ` of ${memoizedSearch.total === 'estimate' ? '~' : ''}${lastResult.total?.toLocaleString()}`}
              </Text>
            )}
          </Group>
          <Group gap="xs">
            <Tooltip label="Refresh" position="bottom" openDelay={500}>
              <ActionIcon
                className={classes.actionIcon}
                variant="transparent"
                color="gray"
                size={32}
                radius="xl"
                aria-label="Refresh"
                title="Refresh"
                onClick={refreshResults}
              >
                <IconReload size={16} />
              </ActionIcon>
            </Tooltip>
            {(showExport || showBulk || showDelete) && (
              <Menu shadow="md" width={200} radius="md" position="bottom-end">
                <Menu.Target>
                  <ActionIcon
                    className={classes.actionIcon}
                    variant="transparent"
                    color="gray"
                    size={32}
                    radius="xl"
                    aria-label="Actions"
                  >
                    <IconDots size={16} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown className={classes.menuDropdown}>
                  {showExport && (
                    <Menu.Item
                      leftSection={<IconTableExport size={16} />}
                      onClick={
                        props.onExport ??
                        (() => setState((s) => ({ ...s, exportDialogVisible: true, dialogOpenTime: Date.now() })))
                      }
                    >
                      Export
                    </Menu.Item>
                  )}
                  {showBulk && (
                    <Menu.Item leftSection={<IconLibraryPlus size={16} />} onClick={() => props.onBulk?.(selectedIds)}>
                      Bulk Apply
                    </Menu.Item>
                  )}
                  {showDelete && (
                    <Menu.Item
                      leftSection={<IconTrash size={16} />}
                      disabled={selectedIds.length === 0}
                      onClick={() => setState((s) => ({ ...s, deleteConfirmVisible: true }))}
                    >
                      Delete
                    </Menu.Item>
                  )}
                </Menu.Dropdown>
              </Menu>
            )}
            {props.onNew && (
              <Tooltip label={`New ${resourceType}`} position="bottom" openDelay={500}>
                <ActionIcon
                  variant="filled"
                  color="blue"
                  size={32}
                  radius="xl"
                  aria-label={`New ${resourceType}`}
                  onClick={props.onNew}
                >
                  <IconPlus size={16} />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>
        </Group>
      )}
      <div className={classes.tableScroll}>
        <Table className={classes.table}>
          <Table.Thead>
            <Table.Tr>
              {checkboxColumn && (
                <Table.Th
                  className={classes.checkboxCell}
                  data-checkbox-cell
                  data-testid="all-checkbox-cell"
                  onClick={(e) => handleCheckboxCellClick(e, () => setAllSelected(!allSelected))}
                  onAuxClick={(e) => e.stopPropagation()}
                >
                  <div className={classes.checkboxWrap}>
                    <Checkbox
                      size="xs"
                      aria-label="Select all rows"
                      data-testid="all-checkbox"
                      checked={allSelected}
                      onChange={(e) => setAllSelected(e.currentTarget.checked)}
                    />
                  </div>
                </Table.Th>
              )}
              {fields.map((field) => {
                const sortCode = field.searchParams?.[0]?.code;
                const sortRule = sortCode ? memoizedSearch.sortRules?.find((r) => r.code === sortCode) : undefined;
                return (
                  <Table.Th key={field.name} aria-sort={sortRule && (sortRule.descending ? 'descending' : 'ascending')}>
                    {field.searchParams ? (
                      <Menu shadow="md" radius="md" position="bottom-start">
                        <Menu.Target>
                          <UnstyledButton className={classes.control}>
                            <Group gap={4} wrap="nowrap">
                              <ColumnTitle>{buildFieldNameString(field.name)}</ColumnTitle>
                              {sortRule &&
                                (sortRule.descending ? (
                                  <IconArrowDown size={12} stroke={2} aria-hidden />
                                ) : (
                                  <IconArrowUp size={12} stroke={2} aria-hidden />
                                ))}
                            </Group>
                          </UnstyledButton>
                        </Menu.Target>
                        <SearchPopupMenu
                          search={memoizedSearch}
                          searchParams={field.searchParams}
                          onChange={emitSearchChange}
                          onPrompt={(searchParam, filter) =>
                            setState((s) => ({
                              ...s,
                              filterDialogVisible: true,
                              filterDialogSearchParam: searchParam,
                              filterDialogFilter: filter,
                              dialogOpenTime: Date.now(),
                            }))
                          }
                        />
                      </Menu>
                    ) : (
                      <ColumnTitle className={classes.staticColumnTitle}>
                        {buildFieldNameString(field.name)}
                      </ColumnTitle>
                    )}
                  </Table.Th>
                );
              })}
              {props.additionalColumns?.map((col) => (
                <Table.Th key={col.name}>
                  <ColumnTitle className={classes.staticColumnTitle}>{col.name}</ColumnTitle>
                </Table.Th>
              ))}
            </Table.Tr>
            {!props.hideFilters && (
              <Table.Tr>
                {checkboxColumn && <Table.Th />}
                {fields.map((field) => (
                  <Table.Th key={field.name}>
                    {field.searchParams && (
                      <FilterDescription
                        resourceType={resourceType}
                        searchParams={field.searchParams}
                        filters={memoizedSearch.filters}
                      />
                    )}
                  </Table.Th>
                ))}
                {props.additionalColumns?.map((col) => (
                  <Table.Th key={col.name} />
                ))}
              </Table.Tr>
            )}
          </Table.Thead>
          <Table.Tbody>
            {resources?.map(
              (resource) =>
                resource && (
                  <Table.Tr
                    key={resource.id}
                    className={classes.tr}
                    data-testid="search-control-row"
                    tabIndex={resource.id === focusableRowId ? 0 : -1}
                    onFocus={(e) => {
                      if (e.target === e.currentTarget) {
                        setActiveRowId(resource.id);
                      }
                    }}
                    onKeyDown={(e) => handleRowKeyDown(e, resource)}
                    onClick={(e) => handleRowClick(e, resource)}
                    onAuxClick={(e) => handleRowClick(e, resource)}
                  >
                    {checkboxColumn && (
                      <Table.Td
                        className={classes.checkboxCell}
                        data-checkbox-cell
                        data-testid="row-checkbox-cell"
                        onClick={(e) => handleCheckboxCellClick(e, () => setRowSelected(resource.id as string))}
                        onAuxClick={(e) => e.stopPropagation()}
                      >
                        <div className={classes.checkboxWrap}>
                          <Checkbox
                            size="xs"
                            data-testid="row-checkbox"
                            aria-label={`Checkbox for ${resource.id}`}
                            checked={!!state.selected[resource.id as string]}
                            onChange={(e) => setRowSelected(resource.id as string, e.currentTarget.checked)}
                          />
                        </div>
                      </Table.Td>
                    )}
                    {fields.map((field) => (
                      <Table.Td key={field.name}>{renderValue(resource, field)}</Table.Td>
                    ))}
                    {props.additionalColumns?.map((col) => (
                      <Table.Td key={col.name}>{col.renderCell(resource)}</Table.Td>
                    ))}
                  </Table.Tr>
                )
            )}
          </Table.Tbody>
        </Table>
      </div>
      {!resources?.length && (
        <Container>
          <Center style={{ height: 150 }}>
            <Text className={classes.mutedText} size="xl">
              No results
            </Text>
          </Center>
        </Container>
      )}
      {lastResult && (
        <Center m={0} p="md" pb={0}>
          <Pagination
            value={getPage(memoizedSearch)}
            total={getTotalPages(memoizedSearch, lastResult)}
            onChange={(newPage) => emitSearchChange(setPage(memoizedSearch, newPage))}
            getControlProps={getPaginationControlProps}
          />
        </Center>
      )}
      <SearchFieldEditor
        key={`search-field-editor-${state.dialogOpenTime}`}
        search={memoizedSearch}
        visible={state.fieldEditorVisible}
        onOk={(result) => {
          emitSearchChange(result);
          setState((s) => ({ ...s, fieldEditorVisible: false }));
        }}
        onCancel={() => setState((s) => ({ ...s, fieldEditorVisible: false }))}
      />
      <SearchFilterEditor
        key={`search-filter-editor-${state.dialogOpenTime}`}
        search={memoizedSearch}
        visible={state.filterEditorVisible}
        onOk={(result) => {
          emitSearchChange(result);
          setState((s) => ({ ...s, filterEditorVisible: false }));
        }}
        onCancel={() => setState((s) => ({ ...s, filterEditorVisible: false }))}
      />
      <SearchExportDialog
        key={`search-export-dialog-${state.dialogOpenTime}`}
        visible={state.exportDialogVisible}
        exportCsv={props.onExportCsv}
        exportTransactionBundle={props.onExportTransactionBundle}
        onCancel={() => {
          setState((s) => ({ ...s, exportDialogVisible: false }));
        }}
      />
      <SearchFilterValueDialog
        key={`search-filter-dialog-${state.dialogOpenTime}`}
        visible={state.filterDialogVisible}
        title={state.filterDialogSearchParam?.code ? buildFieldNameString(state.filterDialogSearchParam.code) : ''}
        resourceType={resourceType}
        searchParam={state.filterDialogSearchParam}
        filter={state.filterDialogFilter}
        defaultValue=""
        onOk={(filter) => {
          emitSearchChange(addFilter(memoizedSearch, filter.code, filter.operator, filter.value));
          setState((s) => ({ ...s, filterDialogVisible: false }));
        }}
        onCancel={() => setState((s) => ({ ...s, filterDialogVisible: false }))}
      />
      <Modal
        opened={!!state.deleteConfirmVisible}
        onClose={state.deleting ? () => undefined : closeDeleteConfirm}
        title={`Delete selected ${buildFieldNameString(resourceType)} resources?`}
        actions={
          <>
            <Button color="red" w="100%" loading={!!state.deleting} onClick={runDelete}>
              Delete
            </Button>
            <Button variant="outline" w="100%" disabled={!!state.deleting} onClick={closeDeleteConfirm}>
              Cancel
            </Button>
          </>
        }
      >
        <Text>This action cannot be undone.</Text>
      </Modal>
    </div>
  );
}

function ColumnTitle(props: { readonly children: ReactNode; readonly className?: string }): JSX.Element {
  return (
    <Text className={`${classes.mutedText} ${props.className ?? ''}`} size="xs" fw={500} lh="sm">
      {props.children}
    </Text>
  );
}

interface FilterDescriptionProps {
  readonly resourceType: string;
  readonly searchParams: SearchParameter[];
  readonly filters?: Filter[];
}

function FilterDescription(props: FilterDescriptionProps): JSX.Element {
  const filters = (props.filters ?? []).filter((f) => props.searchParams.find((p) => p.code === f.code));
  if (filters.length === 0) {
    return (
      <Text className={classes.mutedText} size="xs" lh="sm">
        no filters
      </Text>
    );
  }

  return (
    <>
      {filters.map((filter: Filter) => (
        <Text key={`filter-${filter.code}-${filter.operator}-${filter.value}`} size="xs" lh="sm">
          {getOpString(filter.operator)}
          &nbsp;
          <SearchFilterValueDisplay resourceType={props.resourceType} filter={filter} />
        </Text>
      ))}
    </>
  );
}

/**
 * Makes the whole checkbox cell a hit target; clicks on the input itself are left to its own handler.
 * @param e - The click event on the cell.
 * @param toggle - Toggles the cell's checkbox.
 */
function handleCheckboxCellClick(e: MouseEvent, toggle: () => void): void {
  e.stopPropagation();
  if ((e.target as Element).closest('input, label')) {
    return;
  }
  toggle();
}

function getPage(search: SearchRequest): number {
  return Math.floor((search.offset ?? 0) / (search.count ?? DEFAULT_SEARCH_COUNT)) + 1;
}

function getTotalPages(search: SearchRequest, lastResult: Bundle): number {
  const pageSize = search.count ?? DEFAULT_SEARCH_COUNT;
  const total = getTotal(search, lastResult);
  return Math.ceil(total / pageSize);
}

function getStart(search: SearchRequest, lastResult: Bundle): number {
  return Math.min(getTotal(search, lastResult), (search.offset ?? 0) + 1);
}

function getEnd(search: SearchRequest, lastResult: Bundle): number {
  return Math.max(getStart(search, lastResult) + (lastResult.entry?.length ?? 0) - 1, 0);
}

function getTotal(search: SearchRequest, lastResult: Bundle): number {
  let total = lastResult.total;
  if (total === undefined) {
    // If the total is not specified, then we have to estimate it
    total =
      (search.offset ?? 0) +
      (lastResult.entry?.length ?? 0) +
      (lastResult.link?.some((l) => l.relation === 'next') ? 1 : 0);
  }
  return total;
}
