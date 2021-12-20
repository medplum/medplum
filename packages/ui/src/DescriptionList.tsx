import React from 'react';
import './DescriptionList.css';

export interface DescriptionListProps {
  children: React.ReactNode;
  compact?: boolean;
}

export function DescriptionList(props: DescriptionListProps) {
  return <dl className={'medplum-description-list' + (props.compact ? ' compact' : '')}>{props.children}</dl>;
}

export interface DescriptionListEntryProps {
  term: string;
  children: React.ReactNode;
}

export function DescriptionListEntry(props: DescriptionListEntryProps) {
  return (
    <>
      <dt>{props.term}</dt>
      <dd>{props.children}</dd>
    </>
  );
}
