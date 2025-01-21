import { useState } from 'react';
import { Table, Button } from '@mantine/core';
import { ResourcePropertyDisplay } from '../ResourcePropertyDisplay/ResourcePropertyDisplay';
import { InternalSchemaElement, TypedValue } from '@medplum/core';
import classes from './ResourceDiffRow.module.css';

export interface ResourceDiffRowProps {
  name: string;
  path: string;
  property: InternalSchemaElement | undefined;
  originalValue: TypedValue | undefined;
  revisedValue: TypedValue | undefined;
  shouldToggleDisplay: boolean;
}

export function ResourceDiffRow(props: ResourceDiffRowProps): JSX.Element {
  const { name, path, property, originalValue, revisedValue, shouldToggleDisplay } = props;
  const [isCollapsed, setIsCollapsed] = useState(true);
  const toggleCollapse = (): void => setIsCollapsed((prev) => !prev);

  return (
    <>
      {(shouldToggleDisplay && !isCollapsed) || !shouldToggleDisplay ? (
        <>
          <Table.Tr>
            <Table.Td>{name}</Table.Td>
            <Table.Td className={classes.removed}>
              {originalValue && (
                <ResourcePropertyDisplay
                  path={path}
                  property={property}
                  propertyType={originalValue.type}
                  value={originalValue.value}
                  ignoreMissingValues={true}
                />
              )}
            </Table.Td>
            <Table.Td className={classes.added}>
              {revisedValue && (
                <ResourcePropertyDisplay
                  path={path}
                  property={property}
                  propertyType={revisedValue.type}
                  value={revisedValue.value}
                  ignoreMissingValues={true}
                />
              )}
            </Table.Td>
          </Table.Tr>
          {shouldToggleDisplay && (
            <Table.Tr>
              <Table.Td></Table.Td>
              <Table.Td colSpan={2} style={{ textAlign: 'right' }}>
                <Button onClick={toggleCollapse} variant="light">
                  Collapse
                </Button>
              </Table.Td>
            </Table.Tr>
          )}
        </>
      ) : (
        <Table.Tr className={classes.nobordertop}>
          <Table.Td>{name}</Table.Td>
          <Table.Td colSpan={2} style={{ textAlign: 'right' }}>
            <Button onClick={toggleCollapse} variant="light">
              Expand
            </Button>
          </Table.Td>
        </Table.Tr>
      )}
    </>
  );
}
