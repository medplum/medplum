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
import { DEFAULT_SEARCH_COUNT, Filter, SearchRequest, formatSearchQuery } from '@medplum/core';
import {
  Bundle,
  OperationOutcome,
  Resource,
  ResourceType,
  SearchParameter,
  UserConfiguration,
} from '@medplum/fhirtypes';
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
import { ChangeEvent, MouseEvent, memo, useCallback, useEffect, useRef, useState } from 'react';
import { Container } from '../Container/Container';
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
  search: SearchRequest;
  userConfig?: UserConfiguration;
  checkboxesEnabled?: boolean;
  hideToolbar?: boolean;
  hideFilters?: boolean;
  onLoad?: (e: SearchLoadEvent) => void;
  onChange?: (e: SearchChangeEvent) => void;
  onClick?: (e: SearchClickEvent) => void;
  onAuxClick?: (e: SearchClickEvent) => void;
  onNew?: () => void;
  onExport?: () => void;
  onExportCsv?: () => void;
  onExportTransactionBundle?: () => void;
  onDelete?: (ids: string[]) => void;
  onPatch?: (ids: string[]) => void;
  onBulk?: (ids: string[]) => void;
}

interface SearchControlState {
  searchResponse?: Bundle;
  selected: { [id: string]: boolean };
  fieldEditorVisible: boolean;
  filterEditorVisible: boolean;
  filterDialogVisible: boolean;
  exportDialogVisible: boolean;
  filterDialogFilter?: Filter;
  filterDialogSearchParam?: SearchParameter;
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
  const [schemaLoaded, setSchemaLoaded] = useState(false);
  const [outcome, setOutcome] = useState<OperationOutcome | undefined>();
  const { search, onLoad } = props;

  const [state, setState] = useState<SearchControlState>({
    selected: {},
    fieldEditorVisible: false,
    filterEditorVisible: false,
    exportDialogVisible: false,
    filterDialogVisible: false,
  });

  const stateRef = useRef<SearchControlState>(state);
  stateRef.current = state;

  const totalType = search.total ?? 'accurate';

  const loadResults = useCallback(
    (options?: RequestInit) => {
      setOutcome(undefined);

      medplum
        .search(
          search.resourceType as ResourceType,
          formatSearchQuery({ ...search, total: totalType, fields: undefined }),
          options
        )
        .then((response) => {
          setState({ ...stateRef.current, searchResponse: response });
          if (onLoad) {
            onLoad(new SearchLoadEvent(response));
          }
        })
        .catch((reason) => {
          setState({ ...stateRef.current, searchResponse: undefined });
          setOutcome(reason);
        });
    },
    [medplum, search, totalType, onLoad]
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

  useEffect(() => {
    setSchemaLoaded(false);
    medplum
      .requestSchema(props.search.resourceType as ResourceType)
      .then(() => setSchemaLoaded(true))
      .catch(console.log);
  }, [medplum, props.search.resourceType]);

  if (!schemaLoaded) {
    return (
      <Center style={{ width: '100%', height: '100%' }}>
        <Loader />
      </Center>
    );
  }

  const checkboxColumn = props.checkboxesEnabled;
  const fields = getFieldDefinitions(search);
  const resourceType = search.resourceType;
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
              <Text size="xs" c="dimmed">
                {getStart(search, lastResult.total as number)}-{getEnd(search, lastResult.total as number)} of{' '}
                {`${totalType === 'estimate' ? '~' : ''}${lastResult.total?.toLocaleString()}`}
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
                    search={props.search}
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
                      filters={props.search.filters}
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
      {lastResult?.total !== undefined && lastResult.total > 0 && (
        <Center m="md" p="md">
          <Pagination
            value={getPage(search)}
            total={getTotalPages(search, lastResult.total)}
            onChange={(newPage) => emitSearchChange(setPage(search, newPage))}
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
      {outcome && (
        <div data-testid="search-error">
          <pre style={{ textAlign: 'left' }}>{JSON.stringify(outcome, undefined, 2)}</pre>
        </div>
      )}
      <SearchFieldEditor
        search={props.search}
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
        search={props.search}
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
          emitSearchChange(addFilter(props.search, filter.code, filter.operator, filter.value));
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

export const MemoizedSearchControl = memo(SearchControl);

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

function getTotalPages(search: SearchRequest, total: number): number {
  const pageSize = search.count ?? DEFAULT_SEARCH_COUNT;
  return Math.ceil(total / pageSize);
}

function getStart(search: SearchRequest, total: number): number {
  return Math.min(total, (search.offset ?? 0) + 1);
}

function getEnd(search: SearchRequest, total: number): number {
  return Math.min(total, ((search.offset ?? 0) + 1) * (search.count ?? DEFAULT_SEARCH_COUNT));
}
