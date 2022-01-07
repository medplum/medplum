import { Bundle, Resource } from '@medplum/fhirtypes';
import React, { useEffect, useState } from 'react';
import { InputRow } from './InputRow';
import { MedplumLink } from './MedplumLink';
import { useMedplum } from './MedplumProvider';
import { ResourceBadge } from './ResourceBadge';
import './ResourceBlame.css';
import { blame } from './utils/blame';

export interface ResourceBlameProps {
  history?: Bundle;
  resourceType?: string;
  id?: string;
}

export function ResourceBlame(props: ResourceBlameProps): JSX.Element {
  const medplum = useMedplum();
  const [value, setValue] = useState<Bundle | undefined>(props.history);

  useEffect(() => {
    if (!props.history && props.resourceType && props.id) {
      medplum.readHistory(props.resourceType, props.id).then((result) => setValue(result));
    }
  }, [props.history, props.resourceType, props.id]);

  if (!value) {
    return <div>Loading...</div>;
  }

  const resource = value.entry?.[0]?.resource as Resource;
  const table = blame(value);
  return (
    <table className="medplum-blame">
      <tbody>
        {table.map((row, index) => (
          <tr key={'row-' + index} className={row.span > 0 ? 'start-row' : 'normal-row'}>
            {row.span > 0 && (
              <td className="details" rowSpan={row.span}>
                <InputRow justifyContent="space-between">
                  <ResourceBadge value={row.meta.author} size="xsmall" link={true} />
                  <MedplumLink to={getVersionUrl(resource, row.meta.versionId as string)}>
                    {getTimeString(row.meta.lastUpdated as string)}
                  </MedplumLink>
                </InputRow>
              </td>
            )}
            <td className="line-number">{index + 1}</td>
            <td className="line">
              <pre className="line-pre">{row.value}</pre>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function getVersionUrl(resource: Resource, versionId: string): string {
  return `/${resource.resourceType}/${resource.id}/_history/${versionId}`;
}

function getTimeString(lastUpdated: string): string {
  const seconds = (Date.now() - Date.parse(lastUpdated)) / 1000;

  const years = seconds / 31536000;
  if (years > 1) {
    return Math.floor(years) + ' years ago';
  }

  const months = seconds / 2592000;
  if (months > 1) {
    return Math.floor(months) + ' months ago';
  }

  const days = seconds / 86400;
  if (days > 1) {
    return Math.floor(days) + ' days ago';
  }

  const hours = seconds / 3600;
  if (hours > 1) {
    return Math.floor(hours) + ' hours ago';
  }

  const minutes = seconds / 60;
  if (minutes > 1) {
    return Math.floor(minutes) + ' minutes ago';
  }

  return Math.floor(seconds) + ' seconds ago';
}
