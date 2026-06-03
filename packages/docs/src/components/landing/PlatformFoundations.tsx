// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { IconAntenna, IconCode, IconDatabase, IconRobot, IconWebhook } from '@tabler/icons-react';
import type { ComponentType, JSX } from 'react';
import { useState } from 'react';
import type { FoundationItem } from '../../data/platform-content';
import { FOUNDATIONS } from '../../data/platform-content';
import styles from './PlatformFoundations.module.css';

const FOUNDATION_ICONS: Record<string, ComponentType<{ size?: number }>> = {
  IconDatabase,
  IconCode,
  IconRobot,
  IconWebhook,
  IconAntenna,
};

function PrimitiveCard({
  item,
  selected,
  onSelect,
}: {
  item: FoundationItem;
  selected: boolean;
  onSelect: () => void;
}): JSX.Element {
  const Icon = FOUNDATION_ICONS[item.icon];
  return (
    <button
      onClick={onSelect}
      className={`${styles.primitiveCard} ${selected ? styles.primitiveCardSelected : ''}`}
    >
      <div className={`${styles.iconTile} ${selected ? styles.iconTileSelected : ''}`}>
        {Icon && <Icon size={24} />}
      </div>
      <div className={styles.cardInfo}>
        <div className={styles.cardName}>{item.name}</div>
        <div className={styles.cardShort}>{item.short}</div>
      </div>
    </button>
  );
}

function FoundationDetail({
  item,
  items,
  onSelect,
}: {
  item: FoundationItem;
  items: FoundationItem[];
  onSelect: (name: string) => void;
}): JSX.Element {
  const Icon = FOUNDATION_ICONS[item.icon];
  const idx = items.findIndex((x) => x.name === item.name);
  return (
    <div className={styles.detailPanel}>
      <div className={styles.detailContent}>
        <div className={styles.detailIconTile}>{Icon && <Icon size={24} />}</div>
        <div className={styles.detailMeta}>
          <div className={styles.detailNameRow}>
            <span className={styles.detailName}>{item.name}</span>
          </div>
          <p className={styles.detailBody}>{item.body}</p>
        </div>
      </div>
      <div className={styles.navButtons}>
        <button
          className={styles.navButton}
          onClick={() => onSelect(items[(idx - 1 + items.length) % items.length].name)}
          aria-label="Previous"
        >
          ←
        </button>
        <button
          className={styles.navButton}
          onClick={() => onSelect(items[(idx + 1) % items.length].name)}
          aria-label="Next"
        >
          →
        </button>
      </div>
    </div>
  );
}

export function PlatformFoundations(): JSX.Element {
  const [activeName, setActiveName] = useState(FOUNDATIONS[0].name);
  const active = FOUNDATIONS.find((f) => f.name === activeName) ?? FOUNDATIONS[0];
  const activeIdx = FOUNDATIONS.findIndex((f) => f.name === activeName);

  return (
    <div id="foundations" className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionHeadline}>Foundations</h2>
        <p className={styles.sectionLead}>
          The primitives that make the rest possible: a FHIR-native datastore, a TypeScript SDK, a serverless Bot
          runtime, FHIR Subscriptions, and an on-prem Agent for legacy system interop. Everything you build sits on
          these.
        </p>
      </div>

      <div className={styles.cardGrid}>
        {FOUNDATIONS.map((f) => (
          <PrimitiveCard
            key={f.name}
            item={f}
            selected={f.name === activeName}
            onSelect={() => setActiveName(f.name)}
          />
        ))}
      </div>

      <div className={styles.caretRow}>
        {FOUNDATIONS.map((f, i) => (
          <div key={f.name} className={styles.caretCell}>
            {i === activeIdx && <div className={styles.caret} />}
          </div>
        ))}
      </div>

      <FoundationDetail item={active} items={FOUNDATIONS} onSelect={setActiveName} />
    </div>
  );
}
