import { Container, Paper } from '@mantine/core';
import React from 'react';

export interface DocumentProps {
  width?: number;
  children?: React.ReactNode;
}

export function Document(props: DocumentProps): JSX.Element {
  let style: React.CSSProperties | undefined = undefined;
  if (props.width) {
    style = { maxWidth: props.width };
  }

  return (
    <Container>
      <Paper style={style} m="lg" p="lg" shadow="xs" radius="sm" withBorder>
        {props.children}
      </Paper>
    </Container>
  );
}
