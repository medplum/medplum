import { createStyles, Paper, PaperProps, useComponentDefaultProps } from '@mantine/core';
import React from 'react';

export interface PanelStylesParams {
  width?: number;
}

const useStyles = createStyles((theme, { width }: PanelStylesParams) => ({
  paper: {
    maxWidth: width,
    margin: `${theme.spacing.xl}px auto`,
    padding: theme.spacing.lg,
    '@media (max-width: 800px)': {
      paddingLeft: 8,
      paddingRight: 8,
    },
  },
}));

export interface PanelProps extends PaperProps {
  width?: number;
}

const defaultProps: Partial<PanelProps> = {
  shadow: 'xs',
  radius: 'md',
  withBorder: true,
};

export function Panel(props: PanelProps): JSX.Element {
  const { className, children, width, unstyled, ...others } = useComponentDefaultProps('Panel', defaultProps, props);
  const { classes, cx } = useStyles({ width }, { name: 'Panel', unstyled });

  return (
    <Paper className={cx(classes.paper, className)} {...others}>
      {children}
    </Paper>
  );
}
