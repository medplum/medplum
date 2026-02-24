// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { IconBook, IconChevronDown, IconCopy, IconTerminal2 } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useRef, useState } from 'react';
import styles from './BuildDropdown.module.css';

interface CopyRowProps {
  value: string;
}

function CopyRow({ value }: CopyRowProps): JSX.Element {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [value]);

  return (
    <div
      className={styles.copyContainer}
      onClick={handleCopy}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleCopy().catch(console.error);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Copy "${value}" to clipboard`}
    >
      <code className={styles.copyInput}>{value}</code>
      <span className={styles.copyIcon}>
        <IconCopy size={14} />
      </span>
      {copied && <span className={styles.tooltip}>Copied!</span>}
    </div>
  );
}

export function BuildDropdown(): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setIsOpen(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    closeTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 200);
  }, []);

  return (
    <div className={styles.dropdownWrapper} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <button
        type="button"
        className={`${styles.dropdownTrigger}${isOpen ? ` ${styles.dropdownTriggerActive}` : ''}`}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        Build on the Platform
        <IconChevronDown size={18} className={styles.chevron} />
      </button>

      <div className={`${styles.dropdownMenu}${isOpen ? ` ${styles.dropdownMenuOpen}` : ''}`}>
        <div className={styles.copyItem}>
          <div className={styles.itemHeader}>
            <IconTerminal2 size={16} />
            <span>Start from CLI or GitHub</span>
          </div>
          <CopyRow value="npm init medplum" />
          <CopyRow value="git clone https://github.com/medplum/medplum.git" />
        </div>

        <div className={styles.divider} />

        <button type="button" className={styles.dropdownItem} onClick={() => (window.location.href = '/docs')}>
          <div className={styles.itemHeader}>
            <IconBook size={16} />
            <span>View Our Docs</span>
          </div>
          <p className={styles.itemDescription}>Learn the fundamentals of building with Medplum</p>
        </button>
      </div>
    </div>
  );
}
