import { IndexedStructureDefinition, PropertyType } from '@medplum/core';
import { evalFhirPath } from '@medplum/fhirpath';
import { OperationOutcome, Resource } from '@medplum/fhirtypes';
import React, { useEffect, useRef, useState } from 'react';
import { Loading } from './Loading';
import { useMedplum } from './MedplumProvider';
import { ResourcePropertyDisplay } from './ResourcePropertyDisplay';
import { SearchClickEvent, SearchLoadEvent } from './SearchControl';
import './SearchControl.css';
import { killEvent } from './utils/dom';

export interface SmartSearchField {
  readonly propertyType: PropertyType;
  readonly name: string;
  readonly fhirPath: string;
}

export interface SmartSearchControlProps {
  resourceType: string;
  gql: string;
  fields: SmartSearchField[];
  checkboxesEnabled?: boolean;
  onLoad?: (e: SearchLoadEvent) => void;
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
 * The SmartSearchControl component represents the embeddable search table control.
 * It includes the table, rows, headers, sorting, etc.
 * It does not include the field editor, filter editor, pagination buttons.
 */
export function SmartSearchControl(props: SmartSearchControlProps): JSX.Element {
  const medplum = useMedplum();
  const [schema, setSchema] = useState<IndexedStructureDefinition | undefined>();
  const [outcome, setOutcome] = useState<OperationOutcome | undefined>();
  const { gql, fields, onLoad } = props;
  const [response, setResponse] = useState<SmartSearchResponse | undefined>();
  const [selected, setSelected] = useState<{ [id: string]: boolean }>({});

  const responseRef = useRef<SmartSearchResponse>();
  responseRef.current = response;

  const selectedRef = useRef<{ [id: string]: boolean }>({});
  selectedRef.current = selected;

  useEffect(() => {
    setOutcome(undefined);
    medplum
      .graphql(gql)
      .then((response) => {
        setResponse(response);
        if (onLoad) {
          onLoad(new SearchLoadEvent(response));
        }
      })
      .catch((reason) => {
        setResponse(undefined);
        setOutcome(reason);
      });
  }, [medplum, gql, onLoad]);

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
    const resources = responseRef.current?.data?.ResourceList;
    if (checked && resources) {
      resources.forEach((resource) => {
        if (resource?.id) {
          newSelected[resource.id] = true;
        }
      });
    }
    setSelected(newSelected);
  }

  function isAllSelected(): boolean {
    const resources = responseRef.current?.data?.ResourceList;
    if (!resources || resources.length === 0) {
      return false;
    }
    for (const resource of resources) {
      if (resource?.id && !selectedRef.current[resource.id]) {
        return false;
      }
    }
    return true;
  }

  /**
   * Handles a click on a order row.
   *
   * @param e The click event.
   * @param resource The FHIR resource.
   */
  function handleRowClick(e: React.MouseEvent, resource: Resource): void {
    if (e.target instanceof HTMLInputElement && e.target.type === 'checkbox') {
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
    medplum.requestSchema(props.resourceType).then((newSchema) => {
      // The schema could have the same object identity,
      // so need to use the spread operator to kick React re-render.
      setSchema({ ...newSchema });
    });
  }, [medplum, props.resourceType]);

  const typeSchema = schema?.types?.[props.resourceType];
  if (!typeSchema) {
    return <Loading />;
  }

  const checkboxColumn = props.checkboxesEnabled;
  const resources = responseRef.current?.data?.ResourceList;

  return (
    <div className="medplum-search-control" onContextMenu={(e) => killEvent(e)} data-testid="search-control">
      <table>
        <thead>
          <tr>
            {checkboxColumn && (
              <th className="medplum-search-icon-cell">
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
          {resources?.map(
            (resource) =>
              resource && (
                <tr
                  key={resource.id}
                  data-testid="search-control-row"
                  onClick={(e) => handleRowClick(e, resource)}
                  onAuxClick={(e) => handleRowClick(e, resource)}
                >
                  {checkboxColumn && (
                    <td className="medplum-search-icon-cell">
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
                    const values = evalFhirPath(field.fhirPath, resource);
                    const value = values?.[0];
                    return (
                      <td key={field.name}>
                        <ResourcePropertyDisplay schema={schema} propertyType={field.propertyType} value={value} />
                      </td>
                    );
                  })}
                </tr>
              )
          )}
        </tbody>
      </table>
      {resources?.length === 0 && (
        <div data-testid="empty-search" className="medplum-empty-search">
          No results
        </div>
      )}
      {outcome && (
        <div data-testid="search-error" className="medplum-empty-search">
          <pre style={{ textAlign: 'left' }}>{JSON.stringify(outcome, undefined, 2)}</pre>
        </div>
      )}
    </div>
  );
}

export const MemoizedSmartSearchControl = React.memo(SmartSearchControl);
