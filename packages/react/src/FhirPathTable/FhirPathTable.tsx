import { Button, Loader, Table } from '@mantine/core';
import { normalizeOperationOutcome, PropertyType } from '@medplum/core';
import { OperationOutcome, Resource } from '@medplum/fhirtypes';
import React, { useEffect, useRef, useState } from 'react';
import { FhirPathDisplay } from '../FhirPathDisplay/FhirPathDisplay';
import { useMedplum } from '../MedplumProvider/MedplumProvider';
import { SearchClickEvent } from '../SearchControl/SearchControl';
import { isCheckboxCell, killEvent } from '../utils/dom';

export interface FhirPathTableField {
  readonly propertyType: PropertyType;
  readonly name: string;
  readonly fhirPath: string;
}

export interface FhirPathTableProps {
  resourceType: string;
  query: string;
  fields: FhirPathTableField[];
  checkboxesEnabled?: boolean;
  onClick?: (e: SearchClickEvent) => void;
  onAuxClick?: (e: SearchClickEvent) => void;
  onBulk?: (ids: string[]) => void;
}

export interface SmartSearchResponse {
  data: {
    ResourceList: Resource[];
  };
}

/**
 * The FhirPathTable component represents the embeddable search table control.
 * @param props FhirPathTable React props.
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

  function handleSingleCheckboxClick(e: React.ChangeEvent, id: string): void {
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

  function handleAllCheckboxClick(e: React.ChangeEvent): void {
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

  function handleRowClick(e: React.MouseEvent, resource: Resource): void {
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
        <thead>
          <tr>
            {checkboxColumn && (
              <th>
                <input
                  type="checkbox"
                  value="checked"
                  aria-label="all-checkbox"
                  data-testid="all-checkbox"
                  checked={isAllSelected()}
                  onChange={(e) => handleAllCheckboxClick(e)}
                />
              </th>
            )}
            {fields.map((field) => (
              <th key={field.name}>{field.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {response?.data.ResourceList.map(
            (resource) =>
              resource && (
                <tr
                  key={resource.id}
                  data-testid="search-control-row"
                  onClick={(e) => handleRowClick(e, resource)}
                  onAuxClick={(e) => handleRowClick(e, resource)}
                >
                  {checkboxColumn && (
                    <td>
                      <input
                        type="checkbox"
                        value="checked"
                        data-testid="row-checkbox"
                        aria-label={`Checkbox for ${resource.id}`}
                        checked={!!selected[resource.id as string]}
                        onChange={(e) => handleSingleCheckboxClick(e, resource.id as string)}
                      />
                    </td>
                  )}
                  {fields.map((field) => {
                    return (
                      <td key={field.name}>
                        <FhirPathDisplay propertyType={field.propertyType} path={field.fhirPath} resource={resource} />
                      </td>
                    );
                  })}
                </tr>
              )
          )}
        </tbody>
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

export const MemoizedFhirPathTable = React.memo(FhirPathTable);
