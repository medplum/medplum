import { ContainerProps, Container as MantineContainer } from '@mantine/core';
import classes from './Container.module.css';

export function Container(props: ContainerProps): JSX.Element {
  const { children, ...others } = props;

  return (
    <MantineContainer className={classes.root} {...others}>
      {children}
    </MantineContainer>
  );
}
