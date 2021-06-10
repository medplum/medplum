import React from 'react';
import './Document.css';

export interface DocumentProps {
  width?: number;
  children?: React.ReactNode;
}

export function Document(props: DocumentProps) {
  return (
    <main>
      <article style={{ maxWidth: props.width }}>
        {props.children}
      </article>
    </main>
  );
}
