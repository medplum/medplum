import {
  ActionIcon,
  Button,
  Center,
  Group,
  Loader,
  Menu,
  Pagination,
  Table,
  Text,
  UnstyledButton,
} from '@mantine/core';
import {
  DEFAULT_SEARCH_COUNT,
  Filter,
  SearchRequest,
  deepEquals,
  formatSearchQuery,
  isDataTypeLoaded,
  normalizeOperationOutcome,
} from '@medplum/core';
import { Bundle, OperationOutcome, Resource, ResourceType, SearchParameter } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import {
  IconAdjustmentsHorizontal,
  IconBoxMultiple,
  IconColumns,
  IconFilePlus,
  IconFilter,
  IconRefresh,
  IconTableExport,
  IconTrash,
} from '@tabler/icons-react';
import { ChangeEvent, MouseEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Container } from '../Container/Container';
import { OperationOutcomeAlert } from '../OperationOutcomeAlert/OperationOutcomeAlert';
import { SearchExportDialog } from '../SearchExportDialog/SearchExportDialog';
import { SearchFieldEditor } from '../SearchFieldEditor/SearchFieldEditor';
import { SearchFilterEditor } from '../SearchFilterEditor/SearchFilterEditor';
import { SearchFilterValueDialog } from '../SearchFilterValueDialog/SearchFilterValueDialog';
import { SearchFilterValueDisplay } from '../SearchFilterValueDisplay/SearchFilterValueDisplay';
import { SearchPopupMenu } from '../SearchPopupMenu/SearchPopupMenu';
import { isCheckboxCell, killEvent } from '../utils/dom';
import classes from './SearchControl.module.css';
import { getFieldDefinitions } from './SearchControlField';
import { addFilter, buildFieldNameString, getOpString, renderValue, setPage } from './SearchUtils';

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

export interface SearchControlProps {
  readonly search: SearchRequest;
  readonly checkboxesEnabled?: boolean;
  readonly hideToolbar?: boolean;
  readonly hideFilters?: boolean;
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
}

interface SearchControlState {
  readonly searchResponse?: Bundle;
  readonly selected: { [id: string]: boolean };
  readonly fieldEditorVisible: boolean;
  readonly filterEditorVisible: boolean;
  readonly filterDialogVisible: boolean;
  readonly exportDialogVisible: boolean;
  readonly filterDialogFilter?: Filter;
  readonly filterDialogSearchParam?: SearchParameter;
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
    fieldEditorVisible: false,
    filterEditorVisible: false,
    exportDialogVisible: false,
    filterDialogVisible: false,
  });

  const stateRef = useRef<SearchControlState>(state);
  stateRef.current = state;

  const total = memoizedSearch.total ?? 'accurate';

  const loadResults = useCallback(
    (options?: RequestInit) => {
      setOutcome(undefined);
      medplum
        .requestSchema(memoizedSearch.resourceType as ResourceType)
        .then(() =>
          medplum.search(
            memoizedSearch.resourceType as ResourceType,
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
    const state = stateRef.current;
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

    const isAux = e.button === 1 || e.ctrlKey || e.metaKey;

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

  return (
    <div className={classes.root} data-testid="search-control">
      {!props.hideToolbar && (
        <Group justify="space-between" mb="xl">
          <Group gap={2}>
            <Button
              size="compact-md"
              variant={buttonVariant}
              color={buttonColor}
              leftSection={<IconColumns size={iconSize} />}
              onClick={() => setState({ ...stateRef.current, fieldEditorVisible: true })}
            >
              Fields
            </Button>
            <Button
              size="compact-md"
              variant={buttonVariant}
              color={buttonColor}
              leftSection={<IconFilter size={iconSize} />}
              onClick={() => setState({ ...stateRef.current, filterEditorVisible: true })}
            >
              Filters
            </Button>
            {props.onNew && (
              <Button
                size="compact-md"
                variant={buttonVariant}
                color={buttonColor}
                leftSection={<IconFilePlus size={iconSize} />}
                onClick={props.onNew}
              >
                New...
              </Button>
            )}
            {!isMobile && isExportPassed() && (
              <Button
                size="compact-md"
                variant={buttonVariant}
                color={buttonColor}
                leftSection={<IconTableExport size={iconSize} />}
                onClick={
                  props.onExport ? props.onExport : () => setState({ ...stateRef.current, exportDialogVisible: true })
                }
              >
                Export...
              </Button>
            )}
            {!isMobile && props.onDelete && (
              <Button
                size="compact-md"
                variant={buttonVariant}
                color={buttonColor}
                leftSection={<IconTrash size={iconSize} />}
                onClick={() => (props.onDelete as (ids: string[]) => any)(Object.keys(state.selected))}
              >
                Delete...
              </Button>
            )}
            {!isMobile && props.onBulk && (
              <Button
                size="compact-md"
                variant={buttonVariant}
                color={buttonColor}
                leftSection={<IconBoxMultiple size={iconSize} />}
                onClick={() => (props.onBulk as (ids: string[]) => any)(Object.keys(state.selected))}
              >
                Bulk...
              </Button>
            )}
          </Group>
          <Group gap={2}>
            {lastResult && (
              <Text size="xs" c="dimmed" data-testid="count-display">
                {getStart(memoizedSearch, lastResult).toLocaleString()}-
                {getEnd(memoizedSearch, lastResult).toLocaleString()}
                {lastResult.total !== undefined &&
                  ` of ${memoizedSearch.total === 'estimate' ? '~' : ''}${lastResult.total?.toLocaleString()}`}
              </Text>
            )}
            <ActionIcon variant={buttonVariant} color={buttonColor} title="Refresh" onClick={refreshResults}>
              <IconRefresh size={iconSize} />
            </ActionIcon>
          </Group>
        </Group>
      )}
      <Table className={classes.table}>
        <Table.Thead>
          <Table.Tr>
            {checkboxColumn && (
              <Table.Th>
                <input
                  type="checkbox"
                  value="checked"
                  aria-label="all-checkbox"
                  data-testid="all-checkbox"
                  checked={isAllSelected()}
                  onChange={(e) => handleAllCheckboxClick(e)}
                />
              </Table.Th>
            )}
            {fields.map((field) => (
              <Table.Th key={field.name}>
                <Menu shadow="md" width={240} position="bottom-end">
                  <Menu.Target>
                    <UnstyledButton className={classes.control} p={2}>
                      <Group justify="space-between" wrap="nowrap">
                        <Text fw={500}>{buildFieldNameString(field.name)}</Text>
                        <Center className={classes.icon}>
                          <IconAdjustmentsHorizontal size={14} stroke={1.5} />
                        </Center>
                      </Group>
                    </UnstyledButton>
                  </Menu.Target>
                  <SearchPopupMenu
                    search={memoizedSearch}
                    searchParams={field.searchParams}
                    onPrompt={(searchParam, filter) => {
                      setState({
                        ...stateRef.current,
                        filterDialogVisible: true,
                        filterDialogSearchParam: searchParam,
                        filterDialogFilter: filter,
                      });
                    }}
                    onChange={(result) => {
                      emitSearchChange(result);
                    }}
                  />
                </Menu>
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
                  onClick={(e) => handleRowClick(e, resource)}
                  onAuxClick={(e) => handleRowClick(e, resource)}
                >
                  {checkboxColumn && (
                    <Table.Td>
                      <input
                        type="checkbox"
                        value="checked"
                        data-testid="row-checkbox"
                        aria-label={`Checkbox for ${resource.id}`}
                        checked={!!state.selected[resource.id as string]}
                        onChange={(e) => handleSingleCheckboxClick(e, resource.id as string)}
                      />
                    </Table.Td>
                  )}
                  {fields.map((field) => (
                    <Table.Td key={field.name}>{renderValue(resource, field)}</Table.Td>
                  ))}
                </Table.Tr>
              )
          )}
        </Table.Tbody>
      </Table>
      {resources?.length === 0 && (
        <Container>
          <Center style={{ height: 150 }}>
            <Text size="xl" c="dimmed">
              No results
            </Text>
          </Center>
        </Container>
      )}
      {lastResult && (
        <Center m="md" p="md">
          <Pagination
            value={getPage(memoizedSearch)}
            total={getTotalPages(memoizedSearch, lastResult)}
            onChange={(newPage) => emitSearchChange(setPage(memoizedSearch, newPage))}
            getControlProps={(control) => {
              switch (control) {
                case 'previous':
                  return { 'aria-label': 'Previous page' };
                case 'next':
                  return { 'aria-label': 'Next page' };
                default:
                  return {};
              }
            }}
          />
        </Center>
      )}
      <SearchFieldEditor
        search={memoizedSearch}
        visible={stateRef.current.fieldEditorVisible}
        onOk={(result) => {
          emitSearchChange(result);
          setState({
            ...stateRef.current,
            fieldEditorVisible: false,
          });
        }}
        onCancel={() => {
          setState({
            ...stateRef.current,
            fieldEditorVisible: false,
          });
        }}
      />
      <SearchFilterEditor
        search={memoizedSearch}
        visible={stateRef.current.filterEditorVisible}
        onOk={(result) => {
          emitSearchChange(result);
          setState({
            ...stateRef.current,
            filterEditorVisible: false,
          });
        }}
        onCancel={() => {
          setState({
            ...stateRef.current,
            filterEditorVisible: false,
          });
        }}
      />
      <SearchExportDialog
        visible={stateRef.current.exportDialogVisible}
        exportCsv={props.onExportCsv}
        exportTransactionBundle={props.onExportTransactionBundle}
        onCancel={() => {
          setState({
            ...stateRef.current,
            exportDialogVisible: false,
          });
        }}
      />
      <SearchFilterValueDialog
        key={state.filterDialogSearchParam?.code}
        visible={stateRef.current.filterDialogVisible}
        title={state.filterDialogSearchParam?.code ? buildFieldNameString(state.filterDialogSearchParam.code) : ''}
        resourceType={resourceType}
        searchParam={state.filterDialogSearchParam}
        filter={state.filterDialogFilter}
        defaultValue=""
        onOk={(filter) => {
          emitSearchChange(addFilter(memoizedSearch, filter.code, filter.operator, filter.value));
          setState({
            ...stateRef.current,
            filterDialogVisible: false,
          });
        }}
        onCancel={() => {
          setState({
            ...stateRef.current,
            filterDialogVisible: false,
          });
        }}
      />
    </div>
  );
}

/**
 * @deprecated
 *
 * The memoization `MemoizedSearchControl` provides has been merged into `SearchControl`. Previously the memoization was done via HOC but
 * it was proven that this wasn't effective for a large number of use cases, especially when:
 * 1. `search` was an inline static object, which would trigger the memo to recompute on every re-render of the parent component
 * 2. Any of the callbacks, such as `onClick` were not memoized via `useCallback`, which would result in the recomputation as well
 *
 * Scenario 1 also retriggered the effect that runs `loadResults` on change of the `search`, which was less than desirable.
 *
 * The memoization is now accomplished via checking deep equality of the incoming `search` prop in the body of the component, and setting a memoized
 * state whenever the incoming and current memoized value are not deeply equal. See: https://github.com/medplum/medplum/pull/5023
 */
export const MemoizedSearchControl = SearchControl;

interface FilterDescriptionProps {
  readonly resourceType: string;
  readonly searchParams: SearchParameter[];
  readonly filters?: Filter[];
}

function FilterDescription(props: FilterDescriptionProps): JSX.Element {
  const filters = (props.filters ?? []).filter((f) => props.searchParams.find((p) => p.code === f.code));
  if (filters.length === 0) {
    return <span>no filters</span>;
  }

  return (
    <>
      {filters.map((filter: Filter) => (
        <div key={`filter-${filter.code}-${filter.operator}-${filter.value}`}>
          {getOpString(filter.operator)}
          &nbsp;
          <SearchFilterValueDisplay resourceType={props.resourceType} filter={filter} />
        </div>
      ))}
    </>
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
