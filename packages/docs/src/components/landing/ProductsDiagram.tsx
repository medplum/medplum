// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
// @ts-nocheck -- embedded architecture diagram: self-contained generated figure with
// inline styling; types intentionally skipped here.
import {
  IconApi,
  IconApps,
  IconAppWindow,
  IconArrowsTransferUpDown,
  IconBell,
  IconBuildings,
  IconCode,
  IconComponents,
  IconDatabase,
  IconHistory,
  IconLock,
  IconPuzzle,
  IconRobot,
  IconShieldCheck,
  IconStack2,
  IconStethoscope,
  IconUserKey,
} from '@tabler/icons-react';
import { FOUNDATIONS } from '../../data/products-content';
import styles from './ProductsDiagram.module.css';

/* Foundation → 1-based index (matches FOUNDATIONS order in products-content). */
export const FOUNDATION_NUMBER = Object.fromEntries(FOUNDATIONS.map((f, i) => [f.name, i + 1]));

/* Foundation → diagram icon glyph. Each nav chip in ProductsHowItWorks renders the same
   glyph its region uses here, so the selector and the figure read as the same set without
   needing numbered badges. Keys match the names in products-content's FOUNDATIONS. */
export const FOUNDATION_ICON = {
  'FHIR Data Store & API': 'database',
  'TypeScript / JavaScript SDK': 'code',
  'Medplum Component Library': 'components',
  Bots: 'robot',
  Subscriptions: 'bell',
  'Medplum Bridge': 'arrowsTransferUpDown',
  'Medplum Auth': 'lock',
  'Access Control': 'shield',
  'Multi-Tenancy': 'buildings',
  'Audit Logging': 'history',
};

/* ───────────────────────── Tokens ─────────────────────────
   Colors resolve to CSS custom properties (defined in ProductsDiagram.module.css)
   so the whole figure follows the light/dark theme. */

const C = {
  purple: 'var(--dg-purple)',
  purpleSoft: 'var(--dg-purple-soft)',
  purpleBg: 'var(--dg-purple-bg)',
  purpleStripe: 'var(--dg-stripe)',

  border: 'var(--dg-border)',
  bgGray: 'var(--dg-bg-gray)',
  bgPage: 'var(--dg-bg)',

  text: 'var(--dg-text)',
  muted: 'var(--dg-muted)',
  sub: 'var(--dg-sub)',

  line: 'var(--dg-line)',
  dotFill: 'var(--dg-dot-fill)',
  dotStroke: 'var(--dg-dot-stroke)',

  dashed: 'var(--dg-dashed)',
  hostedBg: 'var(--dg-hosted-bg)',
  panel: 'var(--dg-panel)',
  chipBg: 'var(--dg-chip-bg)',
  intBg: 'var(--dg-int-bg)',
  intPillBg: 'var(--dg-int-pill-bg)',
  intPillBorder: 'var(--dg-int-pill-border)',
  panelSoft: 'var(--dg-panel-soft)',

  /* Tonal fills (see ProductsDiagram.module.css) — used in place of borders/stripes. */
  fillPlatform: 'var(--dg-fill-platform)',
  fillBuild: 'var(--dg-fill-build)',
  fillCore: 'var(--dg-fill-core)',
  fillUser: 'var(--dg-fill-user)',
  fillUserSoft: 'var(--dg-fill-user-soft)',
  iconCore: 'var(--dg-icon-core)',
  iconBuild: 'var(--dg-icon-build)',
  iconUser: 'var(--dg-icon-user)',
};

/* Only TWO tones now: one grape for everything Medplum-managed, one tone for everything
   user-managed. Extensibility is marked with a black code-icon circle instead of a
   separate fill shade, so the legend stays short. */
const CATS = {
  medplum: {
    bg: C.fillBuild,
    iconColor: C.iconBuild,
    iconBg: C.chipBg,
  },
  extensible: {
    bg: C.fillBuild,
    iconColor: C.iconBuild,
    iconBg: C.chipBg,
  },
  customer: {
    bg: C.fillUser,
    iconColor: C.iconUser,
    iconBg: C.chipBg,
  },
  partner: {
    bg: C.fillUser,
    iconColor: C.iconUser,
    iconBg: C.chipBg,
  },
};

/* ───────────────────────── Icon set ─────────────────────────
   Tabler icons (@tabler/icons-react) — keys match diagram call sites and FOUNDATION_ICON. */

const ICONS = {
  apps: IconApps,
  components: IconComponents,
  puzzle: IconPuzzle,
  stethoscope: IconStethoscope,
  appWindow: IconAppWindow,
  code: IconCode,
  layers: IconStack2,
  lock: IconLock,
  shield: IconShieldCheck,
  api: IconApi,
  bell: IconBell,
  robot: IconRobot,
  database: IconDatabase,
  arrowsTransferUpDown: IconArrowsTransferUpDown,
  buildings: IconBuildings,
  history: IconHistory,
  userKey: IconUserKey,
};

export function Icon({ name, color = '#9CA3AF', size = 20, strokeWidth = 1.8, rotate = 0 }) {
  const TablerIcon = ICONS[name] ?? ICONS.apps;
  return (
    <TablerIcon
      size={size}
      color={color}
      stroke={strokeWidth}
      style={rotate ? { transform: `rotate(${rotate}deg)` } : undefined}
    />
  );
}

function IconChip({ kind, icon, number, size = 44, iconRotate = 0 }) {
  const k = CATS[kind] || CATS.partner;
  return (
    <div
      className={styles.iconChip}
      style={{
        width: size,
        height: size,
      }}
    >
      {number != null ? (
        <span className={styles.numberMark} style={{ color: k.iconColor }}>
          {number}
        </span>
      ) : (
        <Icon name={icon} color={k.iconColor} size={Math.round(size * 0.5)} rotate={iconRotate} />
      )}
    </div>
  );
}

/* ───────────────────────── Card ─────────────────────────
   Extra DOM props (className/onClick/role/tabIndex/onKeyDown/aria-pressed) are spread
   onto the root so a card can be made an interactive foundation region. */

function Card({
  nodeRef,
  kind = 'medplum',
  icon = 'apps',
  number,
  name,
  sub,
  extensible = false,
  compact = false,
  iconRotate = 0,
  style = {},
  className = '',
  ...rest
}) {
  const k = CATS[kind] || CATS.medplum;
  /* All cards share the same icon tile size and padding — the compact prop is kept for
     call-site compatibility but no longer changes sizing. */
  const shadowClass = kind === 'partner' ? styles.cardShadowDeep : styles.cardShadow;
  const managedClass = kind === 'customer' || kind === 'partner' ? styles.userManaged : styles.medplumManaged;
  return (
    <div
      ref={nodeRef}
      className={`${shadowClass} ${managedClass} ${className}`}
      {...rest}
      style={{
        borderRadius: 12,
        padding: '8px 12px 8px 8px',
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        ...style,
      }}
    >
      <IconChip kind={kind} icon={icon} number={number} size={32} iconRotate={iconRotate} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className={styles.cardName}>{name}</div>
        {sub && <div className={styles.cardSub}>{sub}</div>}
      </div>
      {extensible && <ExtensibleMark />}
    </div>
  );
}

/* Black circle + white code icon — marks extensible / forkable surfaces. */
function ExtensibleMark() {
  return (
    <span className={styles.extensibleMark} aria-label="Extensible">
      <Icon name="code" color="#fff" size={12} strokeWidth={2} />
    </span>
  );
}

/* ───────────────────────── Legend ───────────────────────── */

function LegendSwatch({ kind, label }) {
  const k = CATS[kind];
  return (
    <div className={styles.legendItem}>
      <div className={styles.legendMarker}>
        <div className={styles.legendSwatch} style={{ background: k.bg }} />
      </div>
      <span className={styles.legendLabel}>{label}</span>
    </div>
  );
}

function LegendExtensible({ label }) {
  return (
    <div className={styles.legendItem}>
      <div className={styles.legendMarker}>
        <ExtensibleMark />
      </div>
      <span className={styles.legendLabel}>{label}</span>
    </div>
  );
}

/* ───────────────────────── Connector primitives ───────────────────────── */

/* ───────────────────────── Diagram ───────────────────────── */

function MedplumDiagram() {
  /* Static figure. Foundation regions keep the `clickable` class purely for its visual
     treatment (a fuller fill than context layers, which use the softer `:not(.clickable)`
     variant), but carry no selection, hover, or keyboard behavior — `clk` supplies only
     the region className, with no event handlers, roles, or spotlight state.

     The figure is a pure CSS stack — relationships are carried by adjacency and layering
     rather than drawn connectors, so there is no ref-measurement or SVG-overlay engine. */
  /* opts.band: platform-interior bands share the managed fill (they have partial borders). */
  const clk = (_name, opts = {}) => ({
    className: opts.band ? `${styles.clickable} ${styles.medplumManaged}` : styles.clickable,
  });
  const ctxClass = '';

  return (
    <div
      className={styles.root}
      style={{
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        background: C.bgPage,
        padding: '8px 0 0',
        color: C.text,
      }}
    >
      {/* 2-col grid: row 1 = Platform + External services; row 2 = Apps + Legend. */}
      <div className={styles.diagramGrid}>
        {/* Row 1 — Hosted Platform */}
        <div className={`${styles.sectionWrap} ${styles.platformSection}`}>
          <div className={`${styles.sectionLabel} ${ctxClass}`}>
            Medplum Hosted Platform
            <span className={styles.footnoteMark}> *</span>
          </div>

          {/* REST API + Auth API */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div
              {...clk('FHIR Data Store & API', { band: true })}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '8px 12px 8px 8px',
                borderRadius: 10,
                minWidth: 0,
              }}
            >
              <IconChip kind="medplum" number={FOUNDATION_NUMBER['FHIR Data Store & API']} size={32} />
              <div className={styles.bandName} style={{ whiteSpace: 'nowrap' }}>
                REST API
              </div>
            </div>
            <div
              {...clk('Medplum Auth', { band: true })}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '8px 12px 8px 8px',
                borderRadius: 10,
                minWidth: 0,
              }}
            >
              <IconChip kind="medplum" number={FOUNDATION_NUMBER['Medplum Auth']} size={32} />
              <div className={styles.bandName}>
                Auth API <span className={styles.subText}>(Medplum Identity Provider)</span>
              </div>
            </div>
          </div>

          {/* FHIR Datastore · Subscriptions · Bots · Governance — 2-col grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div
              {...clk('FHIR Data Store & API', { band: true })}
              style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px 8px 8px', borderRadius: 10 }}
            >
              <IconChip kind="medplum" number={FOUNDATION_NUMBER['FHIR Data Store & API']} size={32} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className={styles.bandName}>FHIR Datastore</div>
                <div className={styles.cardSub}>Terminology: SNOMED · ICD-10 · LOINC</div>
              </div>
            </div>
            <Card
              {...clk('Subscriptions')}
              kind="extensible"
              number={FOUNDATION_NUMBER.Subscriptions}
              name="Webhook / Subscriptions"
              extensible
              compact
            />
            <Card {...clk('Bots')} kind="extensible" number={FOUNDATION_NUMBER.Bots} name="Bots" extensible compact />
            {[{ name: 'Multi-Tenancy' }, { name: 'Access Control' }, { name: 'Audit Logging' }].map((cell) => (
              <div
                key={cell.name}
                {...clk(cell.name, { band: true })}
                style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px 8px 8px', borderRadius: 10 }}
              >
                <IconChip kind="medplum" number={FOUNDATION_NUMBER[cell.name]} size={32} />
                <div className={styles.bandName} style={{ whiteSpace: 'nowrap' }}>
                  {cell.name}
                </div>
                <ExtensibleMark />
              </div>
            ))}
          </div>
          <div className={`${styles.footnoteText} ${ctxClass}`}>
            <span className={styles.footnoteMark}>* </span>
            Hosted by default but can be self-hosted
          </div>
        </div>

        {/* Row 1 — External services (top-aligned with Hosted Platform) */}
        <div className={styles.rightColumn}>
          <div className={styles.sectionWrap}>
            <div className={`${styles.sectionLabel} ${ctxClass}`}>Integrations</div>
            <Card className={ctxClass} kind="extensible" icon="apps" iconRotate={-90} name="First-party" compact />
            <Card className={ctxClass} kind="customer" icon="apps" iconRotate={180} name="Third-party" compact />
          </div>
          <Card
            className={ctxClass}
            kind="partner"
            icon="userKey"
            name="External Identity Provider"
            sub="Optional"
            compact
          />
          <Card
            {...clk('Medplum Bridge')}
            kind="extensible"
            number={FOUNDATION_NUMBER['Medplum Bridge']}
            name="Medplum Bridge"
            sub={'On‑prem · HL7 / DICOM'}
            extensible
            compact
          />
        </div>

        {/* Row 2 — Apps */}
        <div className={styles.appsRow}>
          {/* Your Apps */}
          <div className={styles.sectionWrap}>
            <div className={`${styles.sectionLabel} ${ctxClass}`}>Your Apps</div>
            <Card className={ctxClass} kind="customer" icon="puzzle" name="Custom App" compact />
            <Card
              {...clk('Medplum Component Library')}
              kind="customer"
              number={FOUNDATION_NUMBER['Medplum Component Library']}
              name="Component Library"
              sub="Optional"
              compact
            />
            <Card
              {...clk('TypeScript / JavaScript SDK')}
              kind="customer"
              number={FOUNDATION_NUMBER['TypeScript / JavaScript SDK']}
              name="TypeScript / JS SDK"
              sub="Optional"
              compact
            />
          </div>

          {/* Medplum Apps */}
          <div className={styles.sectionWrap}>
            <div className={`${styles.sectionLabel} ${ctxClass}`}>Medplum Apps</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Card
                className={ctxClass}
                kind="extensible"
                icon="stethoscope"
                name="Medplum Provider"
                sub="Example EHR"
                extensible
                compact
              />
              <Card
                className={ctxClass}
                kind="extensible"
                icon="appWindow"
                name="Medplum App"
                sub="Admin / Dev Console"
                extensible
                compact
              />
            </div>
            <Card
              {...clk('Medplum Component Library')}
              kind="extensible"
              number={FOUNDATION_NUMBER['Medplum Component Library']}
              name="Component Library"
              extensible
              compact
            />
            <Card
              {...clk('TypeScript / JavaScript SDK')}
              kind="extensible"
              number={FOUNDATION_NUMBER['TypeScript / JavaScript SDK']}
              name="TypeScript / JS SDK"
              extensible
              compact
            />
          </div>
        </div>

        {/* Row 2 — Legend (beside Your Apps) */}
        <div className={`${styles.legendRow} ${ctxClass}`}>
          <LegendSwatch kind="medplum" label="Medplum-Managed" />
          <LegendSwatch kind="customer" label="User-Managed" />
          <LegendExtensible label="Extensible & Customizable" />
        </div>
      </div>
    </div>
  );
}

export { MedplumDiagram };
