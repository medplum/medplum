import { DefaultResourceTimeline } from '@medplum/react';
import { useParams } from 'react-router-dom';

/*
 * The Timeline component displays relevant events related to the resource
 */
export function Timeline(): JSX.Element {
  const { id } = useParams();
  return <DefaultResourceTimeline resource={{ reference: `Patient/${id}` }} />;
}
