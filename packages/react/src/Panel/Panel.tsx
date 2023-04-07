import { createStyles, Paper, PaperProps, useComponentDefaultProps } from '@mantine/core';
import React from 'react';

export interface PanelStylesParams {
  width?: number;
  fill?: boolean;
}

const useStyles = createStyles((theme, { width, fill }: PanelStylesParams) => ({
  paper: {
    maxWidth: width,
    margin: `${theme.spacing.xl} auto`,
    padding: fill ? 0 : theme.spacing.md,
    '@media (max-width: 800px)': {
      padding: fill ? 0 : 8,
    },
    '& img': {
      width: '100%',
      maxWidth: '100%',
    },
    '& video': {
      width: '100%',
      maxWidth: '100%',
    },
  },
}));

export interface PanelProps extends PaperProps {
  width?: number;
  fill?: boolean;
}

const defaultProps: Partial<PanelProps> = {
  shadow: 'xs',
  radius: 'md',
  withBorder: true,
};

export function Panel(props: PanelProps): JSX.Element {
  const { className, children, width, fill, unstyled, ...others } = useComponentDefaultProps(
    'Panel',
    defaultProps,
    props
  );
  const { classes, cx } = useStyles({ width, fill }, { name: 'Panel', unstyled });

  return (
    <Paper className={cx(classes.paper, className)} {...others}>
      {children}
    </Paper>
  );
}
