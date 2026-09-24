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

import type { SearchControlMenuAction, SearchControlToolbarAction } from './SearchControlActions';
import { SearchControlMenuActionItem, SearchControlToolbarActionButton } from './SearchControlActions';

export type { SearchControlContextMenuOptions } from './ResourceContextMenu';
export type { SearchControlAction, SearchControlMenuAction, SearchControlToolbarAction } from './SearchControlActions';

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

/** Custom copy for the SearchControl delete confirmation modal. */
export interface SearchControlDeleteConfirmation {
  /** Modal title, or a function of the selected count. Default "Delete 3 Medication Requests?". */
  readonly title?: string | ((count: number) => string);
  /** Modal body, or a function of the selected count. Default "This action cannot be undone." */
  readonly message?: ReactNode | ((count: number) => ReactNode);
  /** Confirm button label. Default "Delete". */
  readonly confirmLabel?: string;
}

export interface SearchControlProps {
  readonly search: SearchRequest;
  readonly checkboxesEnabled?: boolean;
  /** Additional computed columns rendered after the search-result columns. */
  readonly additionalColumns?: readonly SearchControlAdditionalColumn[];
  /**
   * Custom action buttons rendered at the left of the right-anchored toolbar cluster. Hidden below
   * 768px, like the built-in Export, Bulk Apply and Delete actions.
   */
  readonly toolbarActions?: readonly SearchControlToolbarAction[];
  /**
   * Custom items in the "…" actions menu, after the built-in items and before Delete. Hidden below
   * 768px, like the built-in Export, Bulk Apply and Delete actions.
   */
  readonly menuActions?: readonly SearchControlMenuAction[];
  /** Hide the "…" actions menu button, whatever it would contain. */
  readonly hideActionsMenu?: boolean;
  readonly hideToolbar?: boolean;
  /**
   * @deprecated No longer has any effect: the per-column filter summary row it hid was removed.
   * Filters are edited from the toolbar's Filters popover. Will be removed in the next major version.
   */
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
  /**
   * Deletes the checked rows. If it returns a Promise, the confirm button shows a loading state and
   * the modal stays open until it settles; a rejection keeps the modal open for the caller to report
   * the error. The deleted IDs are cleared from the selection once the delete finishes.
   */
  readonly onDelete?: (ids: string[]) => void | Promise<void>;
  /**
   * Asks for confirmation before calling `onDelete` (default true). Pass false to call `onDelete`
   * straight from the menu - e.g. when the caller runs its own confirmation - or an object to change
   * the modal copy.
   */
  readonly confirmDelete?: boolean | SearchControlDeleteConfirmation;
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
  /** True while an async `onDelete` is pending. */
  readonly deleting?: boolean;
  readonly dialogOpenTime?: number;
  /** External request to open the Filters popover with a column's field preselected. */
  readonly requestFilterField?: { readonly code: string; readonly nonce: number };
}

/**
 * Embeddable FHIR search table. Renders a toolbar (column, filter and sort popovers,
 * result count, custom toolbar actions, an overflow actions menu and an optional New button),
 * the results table with sortable/filterable headers, optional row checkboxes and a row
 * context menu, and pagination. The component is controlled: it never mutates `search`;
 * every change is emitted through `onChange` for the caller to apply.
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
    setRowSelected(id, (e.target as HTMLInputElement).checked);
  }

  function setRowSelected(id: string, checked: boolean): void {
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
    setAllSelected((e.target as HTMLInputElement).checked);
  }

  /**
   * Makes the whole checkbox cell a hit target: a click in the cell but outside the input (its
   * padding, the wrapper, the icon) toggles the checkbox. Clicks on the input itself are left to its
   * own change handler, so they are not toggled twice.
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

  function setAllSelected(checked: boolean): void {
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

  const selectedIds = Object.keys(state.selected);
  const selectedCount = selectedIds.length;
  const showExport = !isMobile && isExportPassed();
  const showDelete = !isMobile && !!props.onDelete;
  const showBulk = !isMobile && !!props.onBulk;
  const showRefresh = !props.hideRefresh;
  const menuActions = (!isMobile && props.menuActions) || [];
  const toolbarActions = (!isMobile && props.toolbarActions) || [];
  const deleteCopy = getDeleteCopy(resourceType, selectedCount, props.confirmDelete);

  /**
   * Calls `onDelete` with the checked IDs. A sync handler closes the modal right away; an async one
   * keeps it open with a loading button until it settles, and stays open if it rejects. Either way
   * the deleted IDs are cleared from the selection once the delete finishes.
   */
  function runDelete(): void {
    const onDelete = props.onDelete;
    if (!onDelete || stateRef.current.deleting) {
      return;
    }
    const ids = Object.keys(stateRef.current.selected);
    const finish = (): void => {
      const remaining = { ...stateRef.current.selected };
      for (const id of ids) {
        delete remaining[id];
      }
      setState({ ...stateRef.current, selected: remaining, deleting: false, deleteConfirmVisible: false });
    };
    const result = onDelete(ids);
    if (result instanceof Promise) {
      setState({ ...stateRef.current, deleting: true });
      result.then(finish, () => setState({ ...stateRef.current, deleting: false }));
    } else {
      finish();
    }
  }

  const showActionsMenu =
    !props.hideActionsMenu && (showExport || showDelete || showBulk || showRefresh || menuActions.length > 0);

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
              {toolbarActions.map((action) => (
                <SearchControlToolbarActionButton key={action.key} action={action} selectedIds={selectedIds} />
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
                    {menuActions.map((action) => (
                      <SearchControlMenuActionItem key={action.key} action={action} selectedIds={selectedIds} />
                    ))}
                    {showDelete && (
                      <Menu.Item
                        leftSection={<IconTrash size={16} color="var(--mantine-color-dimmed)" />}
                        disabled={selectedCount === 0}
                        onClick={() => {
                          if (props.confirmDelete === false) {
                            runDelete();
                          } else {
                            setState({ ...stateRef.current, deleteConfirmVisible: true });
                          }
                        }}
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
                  <Table.Th
                    className={classes.checkboxCell}
                    data-checkbox-cell
                    data-testid="all-checkbox-cell"
                    onClick={(e) => handleCheckboxCellClick(e, () => setAllSelected(!isAllSelected()))}
                  >
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
                        <Text size="xs" fw={500} c="dimmed">
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
                        <Text className={classes.staticColumnTitle} size="xs" fw={500} c="dimmed">
                          {buildFieldNameString(field.name)}
                        </Text>
                      )}
                    </Table.Th>
                  );
                })}
                {props.additionalColumns?.map((col) => (
                  <Table.Th key={col.name}>
                    <Text className={classes.staticColumnTitle} size="xs" fw={500} c="dimmed">
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
                        <Table.Td
                          className={classes.checkboxCell}
                          data-checkbox-cell
                          data-testid="row-checkbox-cell"
                          onClick={(e) =>
                            handleCheckboxCellClick(e, () =>
                              setRowSelected(resource.id as string, !stateRef.current.selected[resource.id as string])
                            )
                          }
                        >
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
          onClose={() => {
            if (!stateRef.current.deleting) {
              setState({ ...stateRef.current, deleteConfirmVisible: false });
            }
          }}
          title={deleteCopy.title}
          actions={
            <>
              <Button color="red" w="100%" loading={!!state.deleting} onClick={runDelete}>
                {deleteCopy.confirmLabel}
              </Button>
              <Button
                variant="outline"
                w="100%"
                disabled={!!state.deleting}
                onClick={() => setState({ ...stateRef.current, deleteConfirmVisible: false })}
              >
                Cancel
              </Button>
            </>
          }
        >
          <Text>{deleteCopy.message}</Text>
        </Modal>
        {contextMenu}
      </div>
    </ContextMenuProvider>
  );
}

/**
 * Returns a readable, count-aware label for a resource type, e.g. "Medication Requests".
 * @param resourceType - The FHIR resource type.
 * @param count - The number of resources.
 * @returns The label.
 */
function getResourceTypeLabel(resourceType: string, count: number): string {
  const label = buildFieldNameString(resourceType);
  if (count === 1) {
    return label;
  }
  if (/[^aeiou]y$/i.test(label)) {
    return label.slice(0, -1) + 'ies';
  }
  if (/(s|x|z|ch|sh)$/i.test(label)) {
    return label + 'es';
  }
  return label + 's';
}

/**
 * Resolves the delete confirmation modal copy from the defaults and any caller overrides.
 * @param resourceType - The FHIR resource type.
 * @param count - The number of selected resources.
 * @param confirmDelete - The `confirmDelete` prop.
 * @returns The modal title, message and confirm label.
 */
function getDeleteCopy(
  resourceType: string,
  count: number,
  confirmDelete: SearchControlProps['confirmDelete']
): { title: string; message: ReactNode; confirmLabel: string } {
  const custom = typeof confirmDelete === 'object' ? confirmDelete : {};
  let title = `Delete ${count} ${getResourceTypeLabel(resourceType, count)}?`;
  if (typeof custom.title === 'function') {
    title = custom.title(count);
  } else if (custom.title !== undefined) {
    title = custom.title;
  }
  let message: ReactNode = 'This action cannot be undone.';
  if (typeof custom.message === 'function') {
    message = custom.message(count);
  } else if (custom.message !== undefined) {
    message = custom.message;
  }
  return { title, message, confirmLabel: custom.confirmLabel ?? 'Delete' };
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
