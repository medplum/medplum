import { Tooltip } from '@mantine/core';
import { JSX } from 'react';

export const READ_ONLY_TOOLTIP_TEXT = 'Read Only';

export function maybeWrapWithTooltip(tooltipText: string | undefined, children: JSX.Element): JSX.Element {
  return tooltipText ? <Tooltip.Floating label={tooltipText}>{children}</Tooltip.Floating> : children;
}
