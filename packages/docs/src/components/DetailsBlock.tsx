import React from 'react';

export interface DetailsBlockProps {
  summary: string;
  children?: React.ReactNode;
}

export default function DetailsBlock(props: DetailsBlockProps): JSX.Element {
  return (
    <details>
      <summary>{props.summary}</summary>
      {props.children}
    </details>
  );
}
