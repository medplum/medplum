import { createStyles } from '@mantine/core';
import { getDataType, getPropertyDisplayName, stringify, toTypedValue } from '@medplum/core';
import { Resource } from '@medplum/fhirtypes';
import React, { useEffect, useState } from 'react';
import { useMedplum } from '@medplum/react-hooks';
import { ResourcePropertyDisplay } from '../ResourcePropertyDisplay/ResourcePropertyDisplay';
import { getValueAndType } from '../ResourcePropertyDisplay/ResourcePropertyDisplay.utils';

const useStyles = createStyles((theme) => ({
  root: {
    borderCollapse: 'collapse',
    width: '100%',

    '& tr': {
      borderTop: `0.1px solid ${theme.colors.gray[3]}`,
    },

    '& th, & td': {
      padding: `${theme.spacing.sm} ${theme.spacing.sm}`,
      verticalAlign: 'top',
    },
  },

  removed: {
    color: theme.colors.red[7],
    textDecoration: 'line-through',
  },

  added: {
    color: theme.colors.green[7],
  },
}));

export interface ResourceDiffTableProps {
  original: Resource;
  revised: Resource;
}

export function ResourceDiffTable(props: ResourceDiffTableProps): JSX.Element | null {
  const { classes } = useStyles();
  const medplum = useMedplum();
  const [schemaLoaded, setSchemaLoaded] = useState(false);

  useEffect(() => {
    medplum
      .requestSchema(props.original.resourceType)
      .then(() => setSchemaLoaded(true))
      .catch(console.log);
  }, [medplum, props.original.resourceType]);

  if (!schemaLoaded) {
    return null;
  }

  const typeSchema = getDataType(props.original.resourceType);

  return (
    <table className={classes.root}>
      <colgroup>
        <col style={{ width: '30%' }} />
        <col style={{ width: '35%' }} />
        <col style={{ width: '35%' }} />
      </colgroup>
      <thead>
        <tr>
          <th>Property</th>
          <th>Before</th>
          <th>After</th>
        </tr>
      </thead>
      <tbody>
        {Object.entries(typeSchema.elements).map(([key, property]) => {
          if (key === 'id' || key === 'meta') {
            return null;
          }

          const [originalPropertyValue, originalPropertyType] = getValueAndType(toTypedValue(props.original), key);
          const [revisedPropertyValue, revisedPropertyType] = getValueAndType(toTypedValue(props.revised), key);
          if (isEmpty(originalPropertyValue) && isEmpty(revisedPropertyValue)) {
            return null;
          }

          if (stringify(originalPropertyValue) === stringify(revisedPropertyValue)) {
            return null;
          }

          return (
            <tr key={key}>
              <td>{getPropertyDisplayName(key)}</td>
              <td className={classes.removed}>
                <ResourcePropertyDisplay
                  property={property}
                  propertyType={originalPropertyType}
                  value={originalPropertyValue}
                  ignoreMissingValues={true}
                />
              </td>
              <td className={classes.added}>
                <ResourcePropertyDisplay
                  property={property}
                  propertyType={revisedPropertyType}
                  value={revisedPropertyValue}
                  ignoreMissingValues={true}
                />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function isEmpty(value: unknown): boolean {
  return (
    !value ||
    (Array.isArray(value) && value.length === 0) ||
    (typeof value === 'object' && Object.keys(value).length === 0)
  );
}
