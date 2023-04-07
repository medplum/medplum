import { createStyles } from '@mantine/core';
import React from 'react';

const useStyles = createStyles((theme) => ({
  root: {
    display: 'grid',
    gridTemplateColumns: '30% 70%',
    margin: 0,

    '& > dt, & > dd': {
      padding: `${theme.spacing.sm} ${theme.spacing.sm}`,
      borderTop: `0.1px solid ${theme.colors.gray[3]}`,
      margin: 0,
    },
  },

  compact: {
    gridTemplateColumns: '20% 80%',

    '& > dt, & > dd': {
      padding: `0 ${theme.spacing.xs} ${theme.spacing.xs} 0`,
      border: 0,
    },
  },
}));

export interface DescriptionListProps {
  children: React.ReactNode;
  compact?: boolean;
}

export function DescriptionList(props: DescriptionListProps): JSX.Element {
  const { children, compact } = props;
  const { classes, cx } = useStyles();
  return <dl className={cx(classes.root, { [classes.compact]: compact })}>{children}</dl>;
}

export interface DescriptionListEntryProps {
  term: string;
  children: React.ReactNode;
}

export function DescriptionListEntry(props: DescriptionListEntryProps): JSX.Element {
  return (
    <>
      <dt>{props.term}</dt>
      <dd>{props.children}</dd>
    </>
  );
}
