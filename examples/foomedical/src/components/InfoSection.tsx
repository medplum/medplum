import { Card, CloseButton, Title } from '@mantine/core';
import { ReactNode } from 'react';
import classes from './InfoSection.module.css';

interface InfoSectionProps {
  readonly title?: string | JSX.Element;
  readonly children: ReactNode;
  readonly onButtonClick?: (id: string) => void;
  readonly resourceType?: string;
  readonly id?: string;
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
