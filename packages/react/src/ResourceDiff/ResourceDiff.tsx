import { createStyles } from '@mantine/core';
import { stringify } from '@medplum/core';
import { Resource } from '@medplum/fhirtypes';
import React from 'react';
import { Delta, diff } from '../utils/diff';

const useStyles = createStyles((theme) => ({
  removed: {
    color: theme.colors.red[7],
    textDecoration: 'line-through',
  },

  added: {
    color: theme.colors.green[7],
  },
}));

export interface ResourceDiffProps {
  original: Resource;
  revised: Resource;
  ignoreMeta?: boolean;
}

export function ResourceDiff(props: ResourceDiffProps): JSX.Element {
  let originalResource = props.original;
  let revisedResource = props.revised;

  if (props.ignoreMeta) {
    originalResource = { ...originalResource, meta: undefined };
    revisedResource = { ...revisedResource, meta: undefined };
  }

  const original = stringify(originalResource, true).match(/[^\r\n]+/g) as string[];
  const revised = stringify(revisedResource, true).match(/[^\r\n]+/g) as string[];
  const deltas = diff(original, revised);
  return (
    <pre style={{ color: 'gray' }}>
      {deltas.map((delta, index) => (
        <ChangeDiff key={'delta' + index} delta={delta} />
      ))}
    </pre>
  );
}

function ChangeDiff(props: { delta: Delta }): JSX.Element {
  const { classes } = useStyles();
  return (
    <>
      ...
      <br />
      {props.delta.original.lines.length > 0 && (
        <div className={classes.removed}>{props.delta.original.lines.join('\n')}</div>
      )}
      {props.delta.revised.lines.length > 0 && (
        <div className={classes.added}>{props.delta.revised.lines.join('\n')}</div>
      )}
      ...
      <br />
    </>
  );
}
