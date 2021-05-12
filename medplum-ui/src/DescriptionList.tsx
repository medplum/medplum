import React from 'react';
import './DescriptionList.css';

export interface DescriptionListProps {
  children: React.ReactNode;
}

export function DescriptionList(props: DescriptionListProps) {
  return (
    <dt className="medplum-description-list">
      {props.children}
    </dt>
  );
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
