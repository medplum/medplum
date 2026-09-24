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
import type { SearchRequest } from '@medplum/core';
import {
  DEFAULT_SEARCH_COUNT,
  deepEquals,
  formatSearchQuery,
  isDataTypeLoaded,
  normalizeOperationOutcome,
} from '@medplum/core';
import type { Bundle, OperationOutcome, Resource } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import {
  IconArrowDown,
  IconArrowUp,
  IconDots,
  IconLibraryPlus,
  IconPlus,
  IconRefresh,
  IconTableExport,
  IconTrash,
} from '@tabler/icons-react';
import type { ChangeEvent, JSX, MouseEvent, ReactNode } from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Container } from '../Container/Container';
import { Modal } from '../Modal/Modal';
import { OperationOutcomeAlert } from '../OperationOutcomeAlert/OperationOutcomeAlert';
import { SearchColumnEditor } from '../SearchColumnEditor/SearchColumnEditor';
import { SearchExportDialog } from '../SearchExportDialog/SearchExportDialog';
import { SearchFilterPopover } from '../SearchFilterEditor/SearchFilterPopover';
import { SearchPopupMenu } from '../SearchPopupMenu/SearchPopupMenu';
import { SearchSortEditor } from '../SearchSortEditor/SearchSortEditor';
import { isAuxClick, isCheckboxCell, killEvent } from '../utils/dom';
import { getPaginationControlProps } from '../utils/pagination';
import type { ResourceContextMenuTarget, SearchControlContextMenuOptions } from './ResourceContextMenu';
import { useResourceContextMenuController } from './ResourceContextMenu';
import classes from './SearchControl.module.css';
import { getFieldDefinitions } from './SearchControlField';
import { buildFieldNameString, renderValue, setPage } from './SearchUtils';

export type { SearchControlContextMenuOptions } from './ResourceContextMenu';

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
 * An additional, computed column appended after the search-result columns.
 *
 * Unlike the columns derived from {@link SearchControlProps.search} fields, an
 * additional column is not backed by a search parameter and has no sort/filter
 * menu: it renders arbitrary content per row. Use it for values that must be
 * computed or fetched separately from the searched resource (e.g. a related
 * resource's status).
 */
export interface SearchControlAdditionalColumn {
  /** The column header text. */
  readonly name: string;
  /** Renders the cell contents for the given row resource. */
  readonly renderCell: (resource: Resource) => ReactNode;
}

/**
 * A custom action button rendered in the right-anchored toolbar cluster, styled to match the
 * built-in Refresh and New buttons. Use it to add or replace right-side actions - e.g. a "Sync"
 * button when embedding {@link SearchControl} in a medications view.
 */
export interface SearchControlToolbarAction {
  /** Stable React key and aria fallback. */
  readonly key: string;
  /** Tooltip text and aria-label. */
  readonly label: string;
  /** Icon element, e.g. `<IconRefresh size={16} />` (use size 16 to match the built-in buttons). */
  readonly icon: ReactNode;
  readonly onClick: () => void;
  /** 'outline' (default) is a transparent bordered gray button like Refresh; 'filled' is solid like the New "+". */
  readonly variant?: 'outline' | 'filled';
  /** Color for the 'filled' variant (default 'blue'); ignored for 'outline'. */
  readonly color?: string;
  readonly disabled?: boolean;
}

export interface SearchControlProps {
  readonly search: SearchRequest;
  readonly checkboxesEnabled?: boolean;
  /** Additional computed columns rendered after the search-result columns. */
  readonly additionalColumns?: readonly SearchControlAdditionalColumn[];
  /** Custom action buttons rendered at the left of the right-anchored toolbar cluster. */
  readonly toolbarActions?: readonly SearchControlToolbarAction[];
  readonly hideToolbar?: boolean;
  readonly hideFilters?: boolean;
  /** Hide the built-in Refresh button (e.g. to replace it with a custom {@link SearchControlToolbarAction}). */
  readonly hideRefresh?: boolean;
  readonly onLoad?: (e: SearchLoadEvent) => void;
  readonly onChange?: (e: SearchChangeEvent) => void;
  readonly onClick?: (e: SearchClickEvent) => void;
  readonly onAuxClick?: (e: SearchClickEvent) => void;
  readonly onNew?: () => void;
  readonly onExport?: () => void;
  readonly onExportCsv?: () => void;
  readonly onExportTransactionBundle?: () => void;
  readonly onDelete?: (ids: string[]) => void;
  readonly onBulk?: (ids: string[]) => void;
  /**
   * Configures the right-click menu on rows and reference cells, or false to turn it off and leave
   * the browser's own menu. See {@link SearchControlContextMenuOptions}.
   */
  readonly rowContextMenu?: false | SearchControlContextMenuOptions;
}

interface SearchControlState {
  readonly searchResponse?: Bundle;
  readonly selected: { [id: string]: boolean };
  readonly exportDialogVisible: boolean;
  readonly deleteConfirmVisible?: boolean;
  readonly dialogOpenTime?: number;
  /** External request to open the Filters popover with a column's field preselected. */
  readonly requestFilterField?: { readonly code: string; readonly nonce: number };
}

/**
 * The SearchControl component represents the embeddable search table control.
 * It includes the table, rows, headers, sorting, etc.
 * It does not include the field editor, filter editor, pagination buttons.
 * @param props - The SearchControl React props.
 * @returns The SearchControl React node.
 */
export function SearchControl(props: SearchControlProps): JSX.Element {
  const medplum = useMedplum();
  const [outcome, setOutcome] = useState<OperationOutcome | undefined>();
  const { search, onLoad } = props;

  const [memoizedSearch, setMemoizedSearch] = useState(search);

  if (!deepEquals(search, memoizedSearch)) {
    setMemoizedSearch(search);
  }

  const [state, setState] = useState<SearchControlState>({
    selected: {},
    exportDialogVisible: false,
  });

  const stateRef = useRef(state);
  useLayoutEffect(() => {
    stateRef.current = state;
  });

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
          setState({ ...stateRef.current, searchResponse: response });
          if (onLoad) {
            onLoad(new SearchLoadEvent(response));
          }
        })
        .catch((reason) => {
          setState({ ...stateRef.current, searchResponse: undefined });
          setOutcome(normalizeOperationOutcome(reason));
        });
    },
    [medplum, memoizedSearch, total, onLoad]
  );

  const refreshResults = useCallback(() => {
    setState({ ...stateRef.current, searchResponse: undefined });
    loadResults({ cache: 'reload' });
  }, [loadResults]);

  useEffect(() => {
    loadResults();
  }, [loadResults]);

  const { ContextMenuProvider, openContextMenu, contextMenu } = useResourceContextMenuController(props.rowContextMenu);

  /**
   * Builds the context menu target for a row. The link comes from `getResourceHref` when set, else
   * `/${resourceType}/${id}` unless an `onClick` handler owns navigation; without a link, Open and
   * Open in a New Tab fall back to the click handlers.
   * @param e - The contextmenu event.
   * @param resource - The row's resource.
   * @returns The context menu target.
   */
  function getRowContextMenuTarget(e: MouseEvent, resource: Resource): ResourceContextMenuTarget {
    const { rowContextMenu, onClick, onAuxClick } = props;
    let href: string | undefined;
    if (rowContextMenu && rowContextMenu.getResourceHref) {
      href = rowContextMenu.getResourceHref(resource);
    } else if (!onClick) {
      href = `/${resource.resourceType}/${resource.id}`;
    }
    return {
      label: resource.resourceType,
      href,
      onOpen: onClick && (() => onClick(new SearchClickEvent(resource, e))),
      onOpenInNewTab: onAuxClick && (() => onAuxClick(new SearchClickEvent(resource, e))),
    };
  }

  function handleSingleCheckboxClick(e: ChangeEvent, id: string): void {
    e.stopPropagation();

    const el = e.target as HTMLInputElement;
    const checked = el.checked;
    const newSelected = { ...stateRef.current.selected };
    if (checked) {
      newSelected[id] = true;
    } else {
      delete newSelected[id];
    }
    setState({ ...stateRef.current, selected: newSelected });
  }

  function handleAllCheckboxClick(e: ChangeEvent): void {
    e.stopPropagation();

    const el = e.target as HTMLInputElement;
    const checked = el.checked;
    const newSelected = {} as { [id: string]: boolean };
    const searchResponse = stateRef.current.searchResponse;
    if (checked && searchResponse?.entry) {
      searchResponse.entry.forEach((entry) => {
        if (entry.resource?.id) {
          newSelected[entry.resource.id] = true;
        }
      });
    }
    setState({ ...stateRef.current, selected: newSelected });
  }

  function isAllSelected(): boolean {
    if (!state.searchResponse?.entry || state.searchResponse.entry.length === 0) {
      return false;
    }
    for (const e of state.searchResponse.entry) {
      if (e.resource?.id && !state.selected[e.resource.id]) {
        return false;
      }
    }
    return true;
  }

  /**
   * Emits a change event to the optional change listener.
   * @param newSearch - The new search definition.
   */
  function emitSearchChange(newSearch: SearchRequest): void {
    if (props.onChange) {
      props.onChange(new SearchChangeEvent(newSearch));
    }
  }

  /**
   * Handles a click on a order row.
   * @param e - The click event.
   * @param resource - The FHIR resource.
   */
  function handleRowClick(e: MouseEvent, resource: Resource): void {
    if (isCheckboxCell(e.target as Element)) {
      // Ignore clicks on checkboxes
      return;
    }

    if (e.button === 2) {
      // Ignore right clicks
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

  function isExportPassed(): boolean {
    return !!(props.onExport ?? props.onExportCsv ?? props.onExportTransactionBundle);
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

  const buttonVariant = 'subtle';
  const buttonColor = 'gray';
  const iconSize = 16;
  const isMobile = window.innerWidth < 768;

  const selectedCount = Object.keys(state.selected).length;
  const showExport = !isMobile && isExportPassed();
  const showDelete = !isMobile && !!props.onDelete;
  const showBulk = !isMobile && !!props.onBulk;
  const showRefresh = !props.hideRefresh;
  const showActionsMenu = showExport || showDelete || showBulk || showRefresh;

  return (
    <ContextMenuProvider>
      <div className={classes.root} data-testid="search-control">
        {!props.hideToolbar && (
          <Group justify="space-between" pb="md" className={classes.toolbar}>
            <Group gap="xs">
              <SearchColumnEditor
                search={memoizedSearch}
                onChange={emitSearchChange}
                buttonVariant={buttonVariant}
                buttonColor={buttonColor}
                buttonClassName={classes.toolbarButton}
                iconSize={iconSize}
              />
              <SearchFilterPopover
                search={memoizedSearch}
                onChange={emitSearchChange}
                buttonVariant={buttonVariant}
                buttonColor={buttonColor}
                buttonClassName={classes.toolbarButton}
                iconSize={iconSize}
                requestFilterField={state.requestFilterField}
              />
              <SearchSortEditor
                search={memoizedSearch}
                onChange={emitSearchChange}
                buttonVariant={buttonVariant}
                buttonColor={buttonColor}
                buttonClassName={classes.toolbarButton}
                iconSize={iconSize}
              />
              {lastResult && (
                <Text size="xs" c="dimmed" ml={4} data-testid="count-display">
                  {getStart(memoizedSearch, lastResult).toLocaleString()}-
                  {getEnd(memoizedSearch, lastResult).toLocaleString()}
                  {lastResult.total !== undefined &&
                    ` of ${memoizedSearch.total === 'estimate' ? '~' : ''}${lastResult.total?.toLocaleString()}`}
                </Text>
              )}
            </Group>
            <Group gap="xs">
              {props.toolbarActions?.map((action) => (
                <Tooltip key={action.key} label={action.label} position="bottom" openDelay={500}>
                  <ActionIcon
                    className={action.variant === 'filled' ? undefined : classes.actionIcon}
                    variant={action.variant === 'filled' ? 'filled' : 'transparent'}
                    color={action.variant === 'filled' ? (action.color ?? 'blue') : 'gray'}
                    size={32}
                    radius="xl"
                    aria-label={action.label}
                    disabled={action.disabled}
                    onClick={action.onClick}
                  >
                    {action.icon}
                  </ActionIcon>
                </Tooltip>
              ))}
              {showActionsMenu && (
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
                  <Menu.Dropdown className={classes.actionsMenu}>
                    {showRefresh && (
                      <Menu.Item
                        leftSection={<IconRefresh size={16} color="var(--mantine-color-dimmed)" />}
                        onClick={refreshResults}
                      >
                        <Text size="sm">Refresh</Text>
                      </Menu.Item>
                    )}
                    {showExport && (
                      <Menu.Item
                        leftSection={<IconTableExport size={16} color="var(--mantine-color-dimmed)" />}
                        onClick={
                          props.onExport
                            ? props.onExport
                            : () =>
                                setState({ ...stateRef.current, exportDialogVisible: true, dialogOpenTime: Date.now() })
                        }
                      >
                        <Text size="sm">Export</Text>
                      </Menu.Item>
                    )}
                    {showBulk && (
                      <Menu.Item
                        leftSection={<IconLibraryPlus size={16} color="var(--mantine-color-dimmed)" />}
                        onClick={() => (props.onBulk as (ids: string[]) => any)(Object.keys(state.selected))}
                      >
                        <Text size="sm">Bulk Apply</Text>
                      </Menu.Item>
                    )}
                    {showDelete && (
                      <Menu.Item
                        leftSection={<IconTrash size={16} color="var(--mantine-color-dimmed)" />}
                        disabled={selectedCount === 0}
                        onClick={() => setState({ ...stateRef.current, deleteConfirmVisible: true })}
                      >
                        <Text size="sm">Delete</Text>
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
                  <Table.Th className={classes.checkboxCell}>
                    <div className={classes.checkboxWrap}>
                      <Checkbox
                        size="xs"
                        aria-label="all-checkbox"
                        data-testid="all-checkbox"
                        checked={isAllSelected()}
                        onChange={(e) => handleAllCheckboxClick(e)}
                      />
                    </div>
                  </Table.Th>
                )}
                {fields.map((field) => {
                  const sortCode = field.searchParams?.[0]?.code;
                  const sortRule = sortCode ? memoizedSearch.sortRules?.find((r) => r.code === sortCode) : undefined;
                  const label = (
                    <UnstyledButton className={classes.control}>
                      <Group gap={4} wrap="nowrap">
                        <Text size="xs" fw={500} c="gray.6">
                          {buildFieldNameString(field.name)}
                        </Text>
                        {sortRule &&
                          (sortRule.descending ? (
                            <IconArrowDown size={12} stroke={2} aria-label={`sorted-desc-${field.name}`} />
                          ) : (
                            <IconArrowUp size={12} stroke={2} aria-label={`sorted-asc-${field.name}`} />
                          ))}
                      </Group>
                    </UnstyledButton>
                  );
                  return (
                    <Table.Th key={field.name}>
                      {field.searchParams ? (
                        <Menu shadow="md" radius="md" position="bottom-start">
                          <Menu.Target>{label}</Menu.Target>
                          <SearchPopupMenu
                            search={memoizedSearch}
                            searchParams={field.searchParams}
                            onChange={(result) => emitSearchChange(result)}
                            onFilterByColumn={(searchParam) =>
                              setState({
                                ...stateRef.current,
                                requestFilterField: { code: searchParam.code, nonce: Date.now() },
                              })
                            }
                          />
                        </Menu>
                      ) : (
                        <Text className={classes.staticColumnTitle} size="xs" fw={500} c="gray.6">
                          {buildFieldNameString(field.name)}
                        </Text>
                      )}
                    </Table.Th>
                  );
                })}
                {props.additionalColumns?.map((col) => (
                  <Table.Th key={col.name}>
                    <Text fw={500} c="black" p={2}>
                      {col.name}
                    </Text>
                  </Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {resources?.map(
                (resource) =>
                  resource && (
                    <Table.Tr
                      key={resource.id}
                      className={classes.tr}
                      data-testid="search-control-row"
                      onClick={(e) => handleRowClick(e, resource)}
                      onAuxClick={(e) => handleRowClick(e, resource)}
                      onContextMenu={(e) => {
                        if (isCheckboxCell(e.target as Element)) {
                          return;
                        }
                        openContextMenu(e, getRowContextMenuTarget(e, resource));
                      }}
                    >
                      {checkboxColumn && (
                        <Table.Td className={classes.checkboxCell}>
                          <div className={classes.checkboxWrap}>
                            <Checkbox
                              size="xs"
                              data-testid="row-checkbox"
                              aria-label={`Checkbox for ${resource.id}`}
                              checked={!!state.selected[resource.id as string]}
                              onChange={(e) => handleSingleCheckboxClick(e, resource.id as string)}
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
              <Text size="xl" c="dimmed">
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
        <SearchExportDialog
          key={`search-export-dialog-${state.dialogOpenTime}`}
          visible={state.exportDialogVisible}
          exportCsv={props.onExportCsv}
          exportTransactionBundle={props.onExportTransactionBundle}
          onCancel={() => {
            setState({
              ...stateRef.current,
              exportDialogVisible: false,
            });
          }}
        />
        <Modal
          opened={!!state.deleteConfirmVisible}
          onClose={() => setState({ ...stateRef.current, deleteConfirmVisible: false })}
          title={`Delete ${resourceType}${selectedCount === 1 ? '' : 's'}`}
          actions={
            <>
              <Button
                color="red"
                w="100%"
                onClick={() => {
                  setState({ ...stateRef.current, deleteConfirmVisible: false });
                  (props.onDelete as (ids: string[]) => any)(Object.keys(stateRef.current.selected));
                }}
              >
                Delete
              </Button>
              <Button
                variant="outline"
                w="100%"
                onClick={() => setState({ ...stateRef.current, deleteConfirmVisible: false })}
              >
                Cancel
              </Button>
            </>
          }
        >
          <Text>
            Are you sure you want to delete {selectedCount === 1 ? 'this' : 'these'} {selectedCount}{' '}
            {resourceType.toLowerCase()}
            {selectedCount === 1 ? '' : 's'}? This action cannot be undone.
          </Text>
        </Modal>
        {contextMenu}
      </div>
    </ContextMenuProvider>
  );
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
