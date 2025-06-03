import { DefaultResourceTimeline } from '@medplum/react';
import { JSX } from 'react';
import { useParams } from 'react-router';

/*
 * The Timeline component displays relevant events related to the resource
 */
export function Timeline(): JSX.Element {
  const { id } = useParams();
  return <DefaultResourceTimeline resource={{ reference: `Patient/${id}` }} />;
}
