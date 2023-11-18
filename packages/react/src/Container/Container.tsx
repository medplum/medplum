import { Container as MantineContainer, ContainerProps, createStyles } from '@mantine/core';

const useStyles = createStyles(() => ({
  root: {
    '@media (max-width: 800px)': {
      paddingLeft: 4,
      paddingRight: 4,
    },
  },
}));

export function Container(props: ContainerProps): JSX.Element {
  const { children, ...others } = props;
  const { classes } = useStyles();

  return (
    <MantineContainer className={classes.root} {...others}>
      {children}
    </MantineContainer>
  );
}
