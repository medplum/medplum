import { ActionIcon } from '@mantine/core';
import { useMedplumProfile } from '@medplum/react-hooks';
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import { ReactNode, useEffect, useState } from 'react';
import classes from './ChatModal.module.css';

export interface ChatModalProps {
  readonly open?: boolean;
  readonly children: ReactNode;
}

export function ChatModal(props: ChatModalProps): JSX.Element | null {
  const { open, children } = props;
  const profile = useMedplumProfile();
  const [opened, setOpened] = useState(open ?? false);

  useEffect(() => {
    setOpened((prevVal) => open ?? prevVal);
  }, [open]);

  if (!profile) {
    return null;
  }

  return (
    <>
      {opened && <div className={classes.chatModalContainer}>{children}</div>}
      {opened ? (
        <div className={classes.iconContainer}>
          <ActionIcon
            className={classes.icon}
            color="blue"
            size="lg"
            radius="xl"
            variant="outline"
            onClick={() => setOpened(false)}
            aria-label="Close chat"
          >
            <IconChevronDown size="1.625rem" />
          </ActionIcon>
        </div>
      ) : (
        <div className={classes.iconContainer}>
          <ActionIcon
            className={classes.icon}
            color="blue"
            size="lg"
            radius="xl"
            variant="outline"
            onClick={() => setOpened(true)}
            aria-label="Open chat"
          >
            <IconChevronUp size="1.625rem" />
          </ActionIcon>
        </div>
      )}
    </>
  );
}
