import { Resource, stringify } from '@medplum/core';
import React from 'react';
import { Delta, diff } from './utils/diff';

export interface ResourceDiffProps {
  original: Resource;
  revised: Resource;
}

export function ResourceDiff(props: ResourceDiffProps): JSX.Element {
  const original = stringify(props.original, true).match(/[^\r\n]+/g) as string[];
  const revised = stringify(props.revised, true).match(/[^\r\n]+/g) as string[];
  const deltas = diff(original, revised);
  return (
    <>
      {deltas.map((delta, index) => (
        <ChangeDiff key={'delta' + index} delta={delta} />
      ))}
    </>
  );
}

function ChangeDiff(props: { delta: Delta }): JSX.Element {
  return (
    <>
      <pre style={{ color: 'gray' }}>...</pre>
      <pre style={{ color: 'red' }}>{props.delta.original.lines.join('\n')}</pre>
      <pre style={{ color: 'green' }}>{props.delta.revised.lines.join('\n')}</pre>
      <pre style={{ color: 'gray' }}>...</pre>
    </>
  );
}
