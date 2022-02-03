import { stringify } from '@medplum/core';
import { Resource } from '@medplum/fhirtypes';
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
    <pre style={{ color: 'gray' }}>
      {deltas.map((delta, index) => (
        <ChangeDiff key={'delta' + index} delta={delta} />
      ))}
    </pre>
  );
}

function ChangeDiff(props: { delta: Delta }): JSX.Element {
  return (
    <>
      ...
      <br />
      {props.delta.original.lines.length > 0 && (
        <div style={{ color: 'red' }}>{props.delta.original.lines.join('\n')}</div>
      )}
      {props.delta.revised.lines.length > 0 && (
        <div style={{ color: 'green' }}>{props.delta.revised.lines.join('\n')}</div>
      )}
      ...
      <br />
    </>
  );
}
