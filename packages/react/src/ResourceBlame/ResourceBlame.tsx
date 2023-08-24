import { createStyles } from '@mantine/core';
import { Bundle, Resource, ResourceType } from '@medplum/fhirtypes';
import React, { useEffect, useState } from 'react';
import { MedplumLink } from '../MedplumLink/MedplumLink';
import { useMedplum } from '../MedplumProvider/MedplumProvider';
import { ResourceBadge } from '../ResourceBadge/ResourceBadge';
import { blame } from '../utils/blame';

const useStyles = createStyles((theme) => ({
  container: {
    overflowX: 'auto',
  },

  root: {
    border: `0.1px solid ${theme.colors.gray[3]}`,
    borderCollapse: 'collapse',
    borderRadius: theme.radius.sm,
    borderSpacing: 0,
    fontSize: theme.fontSizes.xs,
    width: '100%',

    '& td': {
      padding: '2px 4px 0 4px',
      verticalAlign: 'top',
      whiteSpace: 'nowrap',
    },
  },

  startRow: {
    borderTop: `0.1px solid ${theme.colors.gray[3]}`,
  },

  normalRow: {
    borderTop: 0,
  },

  author: {
    lineHeight: '10px',
  },

  dateTime: {
    borderRight: `0.1px solid ${theme.colors.gray[3]}`,
    lineHeight: '20px',
  },

  lineNumber: {
    backgroundColor: theme.colors.gray[1],
    border: 0,
    color: theme.colors.gray[5],
    fontFamily: theme.fontFamilyMonospace,
    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
    textAlign: 'right',
  },

  line: {
    fontFamily: theme.fontFamilyMonospace,
    fontSize: theme.fontSizes.sm,
    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
  },

  pre: {
    margin: 0,
  },
}));

export interface ResourceBlameProps {
  history?: Bundle;
  resourceType?: ResourceType;
  id?: string;
}

export function ResourceBlame(props: ResourceBlameProps): JSX.Element | null {
  const { classes } = useStyles();
  const medplum = useMedplum();
  const [value, setValue] = useState<Bundle | undefined>(props.history);

  useEffect(() => {
    if (!props.history && props.resourceType && props.id) {
      medplum.readHistory(props.resourceType, props.id).then(setValue).catch(console.log);
    }
  }, [medplum, props.history, props.resourceType, props.id]);

  if (!value) {
    return <div>Loading...</div>;
  }

  const resource = value.entry?.[0]?.resource as Resource;

  if (!resource) {
    return null;
  }

  const table = blame(value);

  return (
    <div className={classes.container}>
      <table className={classes.root}>
        <tbody>
          {table.map((row, index) => (
            <tr key={'row-' + index} className={row.span > 0 ? classes.startRow : classes.normalRow}>
              {row.span > 0 && (
                <>
                  <td className={classes.author} rowSpan={row.span}>
                    <ResourceBadge value={row.meta.author} link={true} />
                  </td>
                  <td className={classes.dateTime} rowSpan={row.span}>
                    <MedplumLink to={getVersionUrl(resource, row.meta.versionId as string)}>
                      {getTimeString(row.meta.lastUpdated as string)}
                    </MedplumLink>
                  </td>
                </>
              )}
              <td className={classes.lineNumber}>{index + 1}</td>
              <td className={classes.line}>
                <pre className={classes.pre}>{row.value}</pre>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function getVersionUrl(resource: Resource, versionId: string): string {
  return `/${resource.resourceType}/${resource.id}/_history/${versionId}`;
}

export function getTimeString(lastUpdated: string): string {
  const seconds = Math.floor((Date.now() - Date.parse(lastUpdated)) / 1000);

  const years = Math.floor(seconds / 31536000);
  if (years > 0) {
    return pluralizeTime(years, 'year');
  }

  const months = Math.floor(seconds / 2592000);
  if (months > 0) {
    return pluralizeTime(months, 'month');
  }

  const days = Math.floor(seconds / 86400);
  if (days > 0) {
    return pluralizeTime(days, 'day');
  }

  const hours = Math.floor(seconds / 3600);
  if (hours > 0) {
    return pluralizeTime(hours, 'hour');
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes > 0) {
    return pluralizeTime(minutes, 'minute');
  }

  return pluralizeTime(seconds, 'second');
}

function pluralizeTime(count: number, noun: string): string {
  return `${count} ${count === 1 ? noun : noun + 's'} ago`;
}
