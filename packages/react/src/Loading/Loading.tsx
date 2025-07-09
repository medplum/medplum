import { Center, Loader, LoaderProps } from '@mantine/core';
import { JSX } from 'react';

export function Loading(props: LoaderProps): JSX.Element {
  const { color, ...rest } = props;
  return (
    <Center style={{ width: '100%', height: '100vh' }}>
      <Loader color={color ?? 'grape'} {...rest} />
    </Center>
  );
}
