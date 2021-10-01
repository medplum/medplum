import { Bundle } from '@medplum/core';
import React, { useEffect, useState } from 'react';
import { Avatar } from './Avatar';
import { useMedplum } from './MedplumProvider';
import { ResourceName } from './ResourceName';
import { blame } from './utils/blame';
import { formatDateTime } from './utils/format';
import './ResourceBlame.css';

export interface ResourceBlameProps {
  history?: Bundle;
  resourceType?: string;
  id?: string;
}

export function ResourceBlame(props: ResourceBlameProps) {
  const medplum = useMedplum();
  const [value, setValue] = useState<Bundle | undefined>(props.history);

  useEffect(() => {
    if (!props.history && props.resourceType && props.id) {
      medplum.readHistory(props.resourceType, props.id).then(result => setValue(result));
    }

  }, [props.history, props.resourceType, props.id]);

  if (!value) {
    return <div>Loading...</div>
  }

  const table = blame(value);
  return (
    <table className="medplum-blame">
      <tbody>
        {
          table.map((row, index) => (
            <tr key={'row-' + index} className={row.span > 0 ? "start-row" : 'normal-row'} >
              {
                row.span > 0 && (
                  <td className="details" rowSpan={row.span} >
                    <Avatar size="xsmall" value={row.meta.author} />
                    <ResourceName value={row.meta.author} link={true} />
                    <br />
                    {formatDateTime(row.meta.lastUpdated as string)}
                    <br />
                    <span>{row.meta.versionId}</span>
                  </td>
                )
              }
              <td className="line-number">{index + 1}</td>
              <td className="line"><pre className="line-pre">{row.value}</pre></td>
            </tr>
          ))}
      </tbody>
    </table>
  );
}
