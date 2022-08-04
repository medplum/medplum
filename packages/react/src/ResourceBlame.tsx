import { Bundle, Resource, ResourceType } from '@medplum/fhirtypes';
import React, { useEffect, useState } from 'react';
import { InputRow } from './InputRow';
import { MedplumLink } from './MedplumLink';
import { useMedplum } from './MedplumProvider';
import { ResourceBadge } from './ResourceBadge';
import { blame } from './utils/blame';
import './ResourceBlame.css';

export interface ResourceBlameProps {
  history?: Bundle;
  resourceType?: ResourceType;
  id?: string;
}

export function ResourceBlame(props: ResourceBlameProps): JSX.Element {
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
  const table = blame(value);
  return (
    <div className="medplum-blame-container">
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
