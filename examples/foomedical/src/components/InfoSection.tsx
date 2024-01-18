import { Card, CloseButton, Title } from '@mantine/core';
import { ReactNode } from 'react';
import classes from './InfoSection.module.css';

interface InfoSectionProps {
  title?: string | JSX.Element;
  children: ReactNode;
  onButtonClick?: (id: string) => void;
  resourceType?: string;
  id?: string;
}

export function InfoSection({ title, children, onButtonClick, id = '' }: InfoSectionProps): JSX.Element {
  return (
    <Card withBorder radius="md" shadow="sm" p="xl" mb="xl" w="100%">
      {title && (
        <Card.Section className={classes.titleSection}>
          <Title order={4} className={classes.title}>
            {title}
          </Title>
          {onButtonClick && <CloseButton onClick={() => onButtonClick(id)} />}
        </Card.Section>
      )}
      {children}
    </Card>
  );
}
