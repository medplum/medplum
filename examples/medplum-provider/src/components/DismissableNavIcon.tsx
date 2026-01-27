// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Tooltip } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import type { JSX, MouseEvent } from 'react';
import { useState, useRef, useEffect } from 'react';

interface DismissableNavIconProps {
  icon: JSX.Element;
  onDismiss: () => void;
}

export function DismissableNavIcon({ icon, onDismiss }: DismissableNavIconProps): JSX.Element {
  const [rowHovered, setRowHovered] = useState(false);
  const [xHovered, setXHovered] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const wrapperRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const parentLink = wrapper?.closest('a');

    if (!parentLink) {
      return undefined;
    }

    // Set position relative for absolute positioning of X
    parentLink.style.position = 'relative';

    const handleMouseEnter = (): void => {
      // Check if sidebar is expanded by looking for a span with text content (the label)
      const labelSpan = Array.from(parentLink.querySelectorAll('span')).find(
        (span) => span.textContent && span.textContent.trim().length > 0 && span !== wrapper
      );
      setSidebarExpanded(Boolean(labelSpan));
      setRowHovered(true);
    };
    const handleMouseLeave = (): void => {
      setRowHovered(false);
    };

    parentLink.addEventListener('mouseenter', handleMouseEnter);
    parentLink.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      parentLink.removeEventListener('mouseenter', handleMouseEnter);
      parentLink.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  const handleDismiss = (e: MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    onDismiss();
  };

  const showX = rowHovered && sidebarExpanded;

  return (
    <>
      <span ref={wrapperRef} style={{ display: 'contents' }}>
        {icon}
      </span>
      {showX && (
        <Tooltip label="Dismiss" openDelay={500}>
          <div
            onClick={handleDismiss}
            onMouseEnter={() => setXHovered(true)}
            onMouseLeave={() => setXHovered(false)}
            style={{
              position: 'absolute',
              right: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 4,
              borderRadius: 4,
            }}
          >
            <IconX size={14} color={xHovered ? '#000' : '#868e96'} />
          </div>
        </Tooltip>
      )}
    </>
  );
}
