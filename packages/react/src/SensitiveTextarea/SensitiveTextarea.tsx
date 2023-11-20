import React, { useRef, useState } from 'react';
import { ActionIcon, Flex, Textarea, TextareaProps } from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { IconCopy, IconEye, IconEyeClosed } from '@tabler/icons-react';
import { showNotification } from '@mantine/notifications';

interface SensitiveTextareaProps extends TextareaProps, React.RefAttributes<HTMLTextAreaElement> {}

export function SensitiveTextarea(props: Omit<SensitiveTextareaProps, 'ref'>): JSX.Element {
  const [revealed, setRevealed] = useState(false);
  const clipboard = useClipboard();
  const ref = useRef<HTMLTextAreaElement | null>(null);

  const styles: SensitiveTextareaProps['styles'] = {
    ...props.styles,
  };
  if (!revealed) {
    if (!styles.input) {
      styles.input = {};
    }

    styles.input['-webkit-text-security'] = 'disc';
  }

  return (
    <Flex>
      <Textarea
        {...props}
        styles={{
          ...styles,
          root: {
            ...(styles.root ?? {}),
            flexGrow: 1,
          },
        }}
        ref={ref}
      />
      <Flex direction="column" justify="space-between">
        <ActionIcon title={revealed ? 'Conceal secret' : 'Reveal secret'} onClick={() => setRevealed((r) => !r)}>
          {revealed ? <IconEyeClosed /> : <IconEye />}
        </ActionIcon>
        <ActionIcon
          title="Copy secret"
          onClick={() => {
            clipboard.copy(ref.current?.value);
            showNotification({ color: 'green', message: 'Copied' });
          }}
        >
          <IconCopy />
        </ActionIcon>
      </Flex>
    </Flex>
  );
}
