import { createStyles, Group, UnstyledButton } from '@mantine/core';

const useStyles = createStyles((theme) => ({
  button: {
    color: theme.colorScheme === 'dark' ? theme.colors.dark[1] : theme.colors.gray[7],
    padding: `${theme.spacing.md} ${theme.spacing.md}`,

    '&:not(:last-child)': {
      borderBottom: `1px solid ${theme.colorScheme === 'dark' ? theme.colors.dark[1] : theme.colors.gray[3]}`,
    },

    '&:hover': {
      backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[6] : theme.colors.gray[0],
      color: theme.colorScheme === 'dark' ? theme.white : theme.black,
    },
  },
}));

export interface InfoButtonProps {
  onClick?: () => void;
  children: React.ReactNode;
}

export function InfoButton(props: InfoButtonProps): JSX.Element {
  const { classes } = useStyles();

  return (
    <UnstyledButton className={classes.button} onClick={props.onClick}>
      <Group position="apart">{props.children}</Group>
    </UnstyledButton>
  );
}
