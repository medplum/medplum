import { Button, Loader, Table } from '@mantine/core';
import { normalizeOperationOutcome } from '@medplum/core';
import { OperationOutcome, Resource } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { ChangeEvent, MouseEvent, memo, useEffect, useRef, useState } from 'react';
import { FhirPathDisplay } from '../FhirPathDisplay/FhirPathDisplay';
import { SearchClickEvent } from '../SearchControl/SearchControl';
import { isCheckboxCell, killEvent } from '../utils/dom';

export interface FhirPathTableField {
  readonly propertyType: string;
  readonly name: string;
  readonly fhirPath: string;
}

export interface FhirPathTableProps {
  readonly resourceType: string;
  readonly query: string;
  readonly fields: FhirPathTableField[];
  readonly checkboxesEnabled?: boolean;
  readonly onClick?: (e: SearchClickEvent) => void;
  readonly onAuxClick?: (e: SearchClickEvent) => void;
  readonly onBulk?: (ids: string[]) => void;
}

export interface SmartSearchResponse {
  readonly data: {
    ResourceList: Resource[];
  };
}

/**
 * The FhirPathTable component represents the embeddable search table control.
 * @param props - FhirPathTable React props.
 * @returns FhirPathTable React node.
 */
export function FhirPathTable(props: FhirPathTableProps): JSX.Element {
  const medplum = useMedplum();
  const [schemaLoaded, setSchemaLoaded] = useState(false);
  const [outcome, setOutcome] = useState<OperationOutcome | undefined>();
  const { query, fields } = props;
  const [response, setResponse] = useState<SmartSearchResponse | undefined>();
  const [selected, setSelected] = useState<{ [id: string]: boolean }>({});

  const responseRef = useRef<SmartSearchResponse>();
  responseRef.current = response;

  const selectedRef = useRef<{ [id: string]: boolean }>({});
  selectedRef.current = selected;

  useEffect(() => {
    setOutcome(undefined);
    medplum
      .graphql(query)
      .then(setResponse)
      .catch((err) => setOutcome(normalizeOperationOutcome(err)));
  }, [medplum, query]);

  function handleSingleCheckboxClick(e: ChangeEvent, id: string): void {
    e.stopPropagation();

    const el = e.target as HTMLInputElement;
    const checked = el.checked;
    const newSelected = { ...selectedRef.current };
    if (checked) {
      newSelected[id] = true;
    } else {
      delete newSelected[id];
    }
    setSelected(newSelected);
  }

  function handleAllCheckboxClick(e: ChangeEvent): void {
    e.stopPropagation();

    const el = e.target as HTMLInputElement;
    const checked = el.checked;
    const newSelected = {} as { [id: string]: boolean };
    const resources = responseRef.current?.data.ResourceList;
    if (checked && resources) {
      resources.forEach((resource) => {
        if (resource.id) {
          newSelected[resource.id] = true;
        }
      });
    }
    setSelected(newSelected);
  }

  function isAllSelected(): boolean {
    const resources = responseRef.current?.data.ResourceList;
    if (!resources || resources.length === 0) {
      return false;
    }
    for (const resource of resources) {
      if (resource.id && !selectedRef.current[resource.id]) {
        return false;
      }
    }
    return true;
  }

  function handleRowClick(e: MouseEvent, resource: Resource): void {
    if (isCheckboxCell(e.target as Element)) {
      // Ignore clicks on checkboxes
      return;
    }

    killEvent(e);

    if (e.button !== 1 && props.onClick) {
      props.onClick(new SearchClickEvent(resource, e));
    }

    if (e.button === 1 && props.onAuxClick) {
      props.onAuxClick(new SearchClickEvent(resource, e));
    }
  }

  useEffect(() => {
    medplum
      .requestSchema(props.resourceType)
      .then(() => setSchemaLoaded(true))
      .catch(console.log);
  }, [medplum, props.resourceType]);

  if (!schemaLoaded) {
    return <Loader />;
  }

  const checkboxColumn = props.checkboxesEnabled;

  return (
    <div onContextMenu={(e) => killEvent(e)} data-testid="search-control">
      <Table>
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
              <Table.Th key={field.name}>{field.name}</Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {response?.data.ResourceList.map(
            (resource) =>
              resource && (
                <Table.Tr
                  key={resource.id}
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
                        checked={!!selected[resource.id as string]}
                        onChange={(e) => handleSingleCheckboxClick(e, resource.id as string)}
                      />
                    </Table.Td>
                  )}
                  {fields.map((field) => {
                    return (
                      <Table.Td key={field.name}>
                        <FhirPathDisplay propertyType={field.propertyType} path={field.fhirPath} resource={resource} />
                      </Table.Td>
                    );
                  })}
                </Table.Tr>
              )
          )}
        </Table.Tbody>
      </Table>
      {response?.data.ResourceList.length === 0 && <div data-testid="empty-search">No results</div>}
      {outcome && (
        <div data-testid="search-error">
          <pre style={{ textAlign: 'left' }}>{JSON.stringify(outcome, undefined, 2)}</pre>
        </div>
      )}
      {props.onBulk && (
        <Button onClick={() => (props.onBulk as (ids: string[]) => any)(Object.keys(selectedRef.current))}>
          Bulk...
        </Button>
      )}
    </div>
  );
}

export const MemoizedFhirPathTable = memo(FhirPathTable);
