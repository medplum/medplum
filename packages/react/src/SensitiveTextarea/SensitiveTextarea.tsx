import { ActionIcon, Flex, Textarea, TextareaProps } from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { IconCopy } from '@tabler/icons-react';
import { RefAttributes, useRef, useState } from 'react';

export interface SensitiveTextareaProps extends TextareaProps, RefAttributes<HTMLTextAreaElement> {}

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

    (styles.input as Record<string, string>)['WebkitTextSecurity'] = 'disc';
  }

  return (
    <Flex gap="xs">
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
        autosize
        minRows={1}
        onFocus={() => setRevealed(true)}
        onBlur={() => setRevealed(false)}
      />
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
  );
}
