import { Card, CloseButton, createStyles, Title } from '@mantine/core';
import { ReactNode } from 'react';

const useStyles = createStyles((theme) => ({
  titleSection: {
    background: theme.colorScheme === 'dark' ? theme.colors.dark[6] : theme.colors.gray[1],
    border: `1px solid ${theme.colorScheme === 'dark' ? theme.colors.dark[1] : theme.colors.gray[3]}`,
    color: theme.colorScheme === 'dark' ? theme.colors.dark[1] : theme.colors.gray[6],
    padding: `${theme.spacing.md} ${theme.spacing.md}`,
  },

  title: {
    fontWeight: 500,
  },
}));

interface InfoSectionProps {
  title: string | JSX.Element;
  children: ReactNode;
  onButtonClick?: (id: string) => void;
  resourceType?: string;
  id?: string;
}

export function InfoSection({ title, children, onButtonClick, id = '' }: InfoSectionProps): JSX.Element {
  const { classes } = useStyles();
  return (
    <Card withBorder radius="md" shadow="sm" p="xl" mb="xl" style={{ width: '100%' }}>
      <Card.Section className={classes.titleSection}>
        <Title order={4} className={classes.title}>
          {title}
        </Title>
        {onButtonClick && <CloseButton onClick={() => onButtonClick(id)} />}
      </Card.Section>
      <Card.Section>{children}</Card.Section>
    </Card>
  );
}
