import React from 'react';
import './Document.css';

export function Document(props: any) {
  return (
    <main>
      <article>
        {props.children}
      </article>
    </main>
  );
}
