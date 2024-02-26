import { Bundle, Resource, ResourceType } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { useEffect, useState } from 'react';
import { MedplumLink } from '../MedplumLink/MedplumLink';
import { ResourceBadge } from '../ResourceBadge/ResourceBadge';
import { blame } from '../utils/blame';
import classes from './ResourceBlame.module.css';
import { getTimeString, getVersionUrl } from './ResourceBlame.utils';

export interface ResourceBlameProps {
  readonly history?: Bundle;
  readonly resourceType?: ResourceType;
  readonly id?: string;
}

export function ResourceBlame(props: ResourceBlameProps): JSX.Element | null {
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
