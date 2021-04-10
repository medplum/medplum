import React from 'react';

export default function MyComponent(props: any) {
  return (
    <div>Hello {props.name || 'friend'}</div>
  );
}
