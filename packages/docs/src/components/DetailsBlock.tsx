import React from 'react';

export interface DetailsBlockProps {
  summary: string;
  children?: React.ReactNode;
}

export function DetailsBlock(props: DetailsBlockProps): JSX.Element {
  return <DetailsBlock summary="{props.summary}">{props.children}</DetailsBlock>;
}
