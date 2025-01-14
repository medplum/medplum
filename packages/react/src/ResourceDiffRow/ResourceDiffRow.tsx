import { useState } from 'react';
import { Table, Button, Stack } from '@mantine/core';
import { ResourcePropertyDisplay } from '../ResourcePropertyDisplay/ResourcePropertyDisplay';
import { InternalSchemaElement, TypedValue } from '@medplum/core';
import classes from './ResourceDiffRow.module.css';

export interface ResourceDiffRowProps {
  key: string;
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

  console.log(props);

  return (
    <>
      <Table.Tr>
        <Table.Td>
          <Stack>
            <span>{name}</span>
          </Stack>
        </Table.Td>
        {(shouldToggleDisplay && !isCollapsed) || !shouldToggleDisplay ? (
          <>
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
          </>
        ) : (
          <>
            <Table.Td />
            <Table.Td />
          </>
        )}
      </Table.Tr>
      {shouldToggleDisplay && (
        <Table.Tr>
          <Table.Td colSpan={3} style={{ textAlign: 'right' }}>
            <Button onClick={toggleCollapse} variant="light">
              {isCollapsed ? 'Expand' : 'Collapse'}
            </Button>
          </Table.Td>
        </Table.Tr>
      )}
    </>
  );
}
