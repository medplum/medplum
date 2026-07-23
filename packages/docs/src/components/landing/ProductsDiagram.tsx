// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
// @ts-nocheck -- embedded architecture diagram: self-contained figure with inline
// styling and ref-measured SVG connectors; types intentionally skipped here.
import {
  IconApps,
  IconAppWindow,
  IconArrowsUpDown,
  IconBell,
  IconBox,
  IconBuildings,
  IconCode,
  IconComponents,
  IconDatabase,
  IconFlame,
  IconHistory,
  IconLock,
  IconPuzzle,
  IconReportSearch,
  IconRobot,
  IconShieldCheck,
  IconStack2,
  IconStethoscope,
  IconTerminal2,
  IconUserKey,
} from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import styles from './ProductsDiagram.module.css';

/* ───────────────────────── Tokens ─────────────────────────
   Colors resolve to CSS custom properties (defined in ProductsDiagram.module.css)
   so the whole figure follows the light/dark theme. */

const C = {
  purple: 'var(--dg-purple)',
  purpleSoft: 'var(--dg-purple-soft)',
  purpleBg: 'var(--dg-purple-bg)',

  border: 'var(--dg-border)',
  bgGray: 'var(--dg-bg-gray)',
  bgPage: 'var(--dg-bg)',

  text: 'var(--dg-text)',
  muted: 'var(--dg-muted)',
  sub: 'var(--dg-sub)',

  line: 'var(--oc-gray-5)',
  dotFill: 'var(--dg-dot-fill)',
  dotStroke: 'var(--oc-gray-5)',

  dashed: 'var(--dg-dashed)',
  hostedBg: 'var(--dg-hosted-bg)',
  panel: 'var(--dg-panel)',
  chipBg: 'var(--dg-chip-bg)',
  intBg: 'var(--dg-int-bg)',
  intPillBg: 'var(--dg-int-pill-bg)',
  intPillBorder: 'var(--dg-int-pill-border)',
  panelSoft: 'var(--dg-panel-soft)',

  /* Tonal fills / borders / icon colors. */
  fillBuild: 'var(--dg-fill-build)',
  fillUser: 'var(--dg-fill-user)',
  iconBuild: 'var(--dg-icon-build)',
  iconUser: 'var(--dg-icon-user)',
  borderBuild: 'var(--dg-border-build)',
  borderUser: 'var(--dg-border-user)',
};

/* Gray section-wrapper box + its label. */
const SECTION_WRAP = {
  borderRadius: 16,
  background: 'var(--dg-section-wrap-bg)',
  border: '1px solid var(--dg-section-wrap-border)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--dg-inner-gap)',
  padding: 'var(--dg-inner-gap)',
};

/* Shared row geometry — icon tile (--dg-chip) + vertical padding = row height. */
const ROW_STYLE = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--dg-row-gap)',
  padding: 'var(--dg-row-pad)',
  boxSizing: 'border-box',
};

/* Freestanding platform block — fully rounded, same grape fill as cards. */
const platformBlock = (extra = {}) => ({
  border: `1px solid ${C.borderBuild}`,
  borderRadius: 12,
  background: C.fillBuild,
  overflow: 'hidden',
  ...extra,
});

/* Platform interior rows — same geometry as cards. */
const PLATFORM_ROW = ROW_STYLE;

/* Two tones: grape = Medplum-managed, red = user-managed. Extensibility is no longer a
   separate fill — it's marked with the code-icon circle (see ExtensibleMark). */
const CATS = {
  medplum: { bg: C.fillBuild, border: C.borderBuild, iconColor: C.iconBuild },
  extensible: { bg: C.fillBuild, border: C.borderBuild, iconColor: C.iconBuild },
  customer: { bg: C.fillUser, border: C.borderUser, iconColor: C.iconUser },
  partner: { bg: C.fillUser, border: C.borderUser, iconColor: C.iconUser },
};

/* ───────────────────────── Icon set ─────────────────────────
   Tabler icons (@tabler/icons-react) — keys match ProductsDiagram call sites. */

const ICONS = {
  apps: IconApps,
  components: IconComponents,
  puzzle: IconPuzzle,
  stethoscope: IconStethoscope,
  appWindow: IconAppWindow,
  terminal: IconTerminal2,
  box: IconBox,
  code: IconCode,
  layers: IconStack2,
  lock: IconLock,
  shield: IconShieldCheck,
  flame: IconFlame,
  bell: IconBell,
  robot: IconRobot,
  database: IconDatabase,
  arrowsUpDown: IconArrowsUpDown,
  buildings: IconBuildings,
  history: IconHistory,
  userKey: IconUserKey,
  reportSearch: IconReportSearch,
};

function Icon({ name, color = '#9CA3AF', size = 20, strokeWidth = 1.8, rotate = 0 }) {
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

/* Light elevated tile holding the card's colored glyph (no border — shade separates it). */
function IconChip({ kind, icon, iconRotate = 0 }) {
  const k = CATS[kind] || CATS.partner;
  return (
    <div className={styles.iconChip}>
      <Icon name={icon} color={k.iconColor} size={18} rotate={iconRotate} />
    </div>
  );
}

/* Grape circle + white code icon — marks extensible / customizable surfaces. */
function ExtensibleMark() {
  return (
    <span className={styles.extensibleMark} aria-label="Extensible">
      <Icon name="code" color="#fff" size={12} strokeWidth={2} />
    </span>
  );
}

/* ───────────────────────── Card ───────────────────────── */

function Card({
  nodeRef,
  kind = 'medplum',
  icon = 'apps',
  name,
  sub,
  compact = false,
  extensible = false,
  nowrap = false,
  iconRotate = 0,
  style = {},
  className = '',
  ...rest
}) {
  const k = CATS[kind] || CATS.medplum;
  return (
    <div
      ref={nodeRef}
      className={className}
      {...rest}
      style={{
        background: k.bg,
        border: `1px solid ${k.border}`,
        borderRadius: 12,
        ...ROW_STYLE,
        ...style,
      }}
    >
      <IconChip kind={kind} icon={icon} iconRotate={iconRotate} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className={nowrap ? styles.labelTextNowrap : styles.labelTextPreline}>{name}</div>
        {sub && <div className={styles.subTextGap}>{sub}</div>}
      </div>
      {extensible && <ExtensibleMark />}
    </div>
  );
}

/* ───────────────────────── Legend ───────────────────────── */

function LegendSwatch({ kind, label }) {
  const k = CATS[kind];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: 5,
          background: k.bg,
          border: `1px solid ${k.border}`,
          flexShrink: 0,
        }}
      />
      <span className={styles.labelText}>{label}</span>
    </div>
  );
}

function LegendExtensible({ label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <ExtensibleMark />
      <span className={styles.labelText}>{label}</span>
    </div>
  );
}

/* ───────────────────────── Connector primitives ───────────────────────── */

function relRect(el, container) {
  if (!el || !container) return null;
  const er = el.getBoundingClientRect();
  const cr = container.getBoundingClientRect();
  return { x: er.left - cr.left, y: er.top - cr.top, w: er.width, h: er.height };
}

function Dot({ p, r = 4.5 }) {
  if (!p) return null;
  return <circle cx={p.x} cy={p.y} r={r} fill={C.dotFill} stroke={C.dotStroke} strokeWidth="1.6" />;
}

/* Orthogonal polyline through a list of points. */
function Elbow({ points, color = C.line, dashed = false, w = 2 }) {
  if (!points || points.length < 2) return null;
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  return (
    <path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={w}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={dashed ? '5 4' : undefined}
    />
  );
}

function Straight({ from, to, color = C.line, dashed = false, w = 2 }) {
  if (!from || !to) return null;
  return (
    <line
      x1={from.x}
      y1={from.y}
      x2={to.x}
      y2={to.y}
      stroke={color}
      strokeWidth={w}
      strokeLinecap="round"
      strokeDasharray={dashed ? '5 4' : undefined}
    />
  );
}

/* ───────────────────────── Diagram ─────────────────────────
   Static figure: no spotlight, hover, or selection. The only runtime work is measuring
   node rects so the SVG connectors between them stay aligned across resizes. */

const GOVERNANCE_DIVIDER = '1px solid var(--dg-governance-divider)';
const PLATFORM_DIVIDER = GOVERNANCE_DIVIDER;
const GOVERNANCE_PAD = '8px 16px';
const GOVERNANCE_CELL = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--dg-row-gap)',
  padding: GOVERNANCE_PAD,
  minHeight: 0,
  boxSizing: 'border-box',
};
const GOVERNANCE_SIDEBAR = [
  { icon: 'buildings', label: 'Multi-Tenancy' },
  { icon: 'shield', label: 'Access Control' },
  { icon: 'history', label: 'Audit Logging' },
];

function ProductsDiagram() {
  const rootRef = useRef(null);
  const [R, setR] = useState({});

  const refs = {
    medplumProv: useRef(null),
    medplumApp: useRef(null),
    yourAppsBox: useRef(null),
    medplumAppsBox: useRef(null),
    customApps: useRef(null),
    byoIdp: useRef(null),
    bridge: useRef(null),
    medplumIdp: useRef(null),
    fhirApi: useRef(null),
    fhirApiRest: useRef(null),
    subs: useRef(null),
    bot: useRef(null),
    datastore: useRef(null),
    intBox: useRef(null),
    intFirst: useRef(null),
    intThird: useRef(null),
    platformBox: useRef(null),
    appsRow: useRef(null),
  };

  const measure = () => {
    const container = rootRef.current;
    if (!container) return;
    const next = {};
    for (const [k, r] of Object.entries(refs)) next[k] = relRect(r.current, container);
    setR(next);
  };

  useEffect(() => {
    measure();
    const t1 = setTimeout(measure, 60);
    const t2 = setTimeout(measure, 250);
    const ro = new ResizeObserver(measure);
    if (rootRef.current) ro.observe(rootRef.current);
    window.addEventListener('resize', measure);
    const html = document.documentElement;
    const themeObserver = new MutationObserver(() => {
      setColShift(0);
      measure();
      setTimeout(measure, 60);
    });
    themeObserver.observe(html, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      ro.disconnect();
      window.removeEventListener('resize', measure);
      themeObserver.disconnect();
    };
  }, []);

  const bottom = (r) => r && { x: r.x + r.w / 2, y: r.y + r.h };
  const top = (r) => r && { x: r.x + r.w / 2, y: r.y };
  const right = (r) => r && { x: r.x + r.w, y: r.y + r.h / 2 };
  const left = (r) => r && { x: r.x, y: r.y + r.h / 2 };

  const svgH = R.datastore ? R.datastore.y + R.datastore.h + 60 : 1000;

  /* Shift the right column (External IdP + Bridge + Integrations) down so the External
     IdP card's vertical center lines up with the Auth API band — that lets the
     External IdP ↔ Auth API connector run as a single straight horizontal line. */
  const [colShift, setColShift] = useState(0);
  useEffect(() => {
    if (!R.medplumIdp || !R.byoIdp) return;
    const authCenter = R.medplumIdp.y + R.medplumIdp.h / 2;
    const idpCenter = R.byoIdp.y + R.byoIdp.h / 2 - colShift;
    const delta = authCenter - idpCenter;
    if (Math.abs(delta) > 0.5) {
      setColShift(delta);
    }
  }, [R.medplumIdp && R.medplumIdp.y, R.medplumIdp && R.medplumIdp.h, R.byoIdp && R.byoIdp.y, R.byoIdp && R.byoIdp.h]);

  return (
    <div
      className={styles.root}
      style={{
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        background: C.bgPage,
        color: C.text,
      }}
    >
      <div ref={rootRef} style={{ position: 'relative', paddingTop: '1.5rem' }}>
        {/* ─── SVG overlay (above cards, so dots sit on top) ─── */}
        <svg
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: svgH,
            pointerEvents: 'none',
            zIndex: 10,
            overflow: 'visible',
          }}
        >
          {/* Both SDK cards (shared Medplum SDK + Your Apps SDK) → FHIR REST API: apps talk
             to the platform through the SDK. Merge to a shared trunk, then into the API. */}
          {R.fhirApiRest &&
            R.fhirApi &&
            (() => {
              const target = {
                x: R.fhirApiRest.x + R.fhirApiRest.w / 2,
                y: R.fhirApi.y,
              };
              const boxes = [R.yourAppsBox, R.medplumAppsBox].filter(Boolean);
              if (!boxes.length) return null;
              const bottoms = boxes.map(bottom);
              const appsBottom = R.appsRow ? R.appsRow.y + R.appsRow.h : Math.max(...bottoms.map((p) => p.y));
              const platformTop = R.platformBox ? R.platformBox.y : R.fhirApi.y;
              const trunkY = (appsBottom + platformTop) / 2;
              return (
                <>
                  {bottoms.map((from, i) => (
                    <g key={i}>
                      <Elbow points={[from, { x: from.x, y: trunkY }, { x: target.x, y: trunkY }, target]} />
                      <Dot p={from} />
                    </g>
                  ))}
                  <Dot p={target} />
                </>
              );
            })()}

          {/* External IdP ↔ Auth API (Medplum IDP): single straight horizontal line. */}
          {R.byoIdp &&
            R.medplumIdp &&
            (() => {
              const ay = R.medplumIdp.y + R.medplumIdp.h / 2;
              const from = { x: R.medplumIdp.x + R.medplumIdp.w, y: ay };
              const to = { x: R.byoIdp.x, y: ay };
              return (
                <>
                  <Straight from={from} to={to} />
                  <Dot p={from} />
                  <Dot p={to} />
                </>
              );
            })()}

          {/* Subs + Bots are the integration plane: merge to a trunk inside the platform,
             exit onto a vertical bus in the gap, feed BOTH the Bridge (above) and the
             Integrations box (below). */}
          {R.subs &&
            R.bot &&
            R.intBox &&
            R.intFirst &&
            R.intThird &&
            R.platformBox &&
            R.bridge &&
            (() => {
              const subsR = right(R.subs);
              const botR = right(R.bot);
              const innerTrunkX = Math.max(subsR.x, botR.x) + 14;
              const trunkMidY = (subsR.y + botR.y) / 2;
              const platRightX = R.platformBox.x + R.platformBox.w;
              const rightColLeft = R.bridge?.x ?? R.intBox?.x ?? platRightX + 56;
              const laneX = (platRightX + rightColLeft) / 2;

              const bridgeP = left(R.bridge);
              const intEntryY = (R.intFirst.y + R.intFirst.h + R.intThird.y) / 2;
              const intP = { x: R.intBox.x, y: intEntryY };

              const busTopY = Math.min(bridgeP.y, trunkMidY);
              const busBotY = Math.max(intEntryY, trunkMidY);
              return (
                <>
                  <Straight from={subsR} to={{ x: innerTrunkX, y: subsR.y }} />
                  <Straight from={botR} to={{ x: innerTrunkX, y: botR.y }} />
                  <Straight from={{ x: innerTrunkX, y: subsR.y }} to={{ x: innerTrunkX, y: botR.y }} />
                  <Straight from={{ x: innerTrunkX, y: trunkMidY }} to={{ x: laneX, y: trunkMidY }} />
                  <Straight from={{ x: laneX, y: busTopY }} to={{ x: laneX, y: busBotY }} />
                  <Straight from={{ x: laneX, y: bridgeP.y }} to={bridgeP} />
                  <Straight from={{ x: laneX, y: intEntryY }} to={intP} />
                  <Dot p={subsR} />
                  <Dot p={botR} />
                  <Dot p={bridgeP} />
                  <Dot p={intP} />
                </>
              );
            })()}
        </svg>

        {/* ═══════════════════ TOP ROW — Your Apps + Medplum Apps ═══════════════════ */}
        <div
          ref={refs.appsRow}
          style={{
            position: 'relative',
            zIndex: 2,
            marginBottom: 56,
            display: 'grid',
            gridTemplateColumns: '2fr 2fr',
            gap: 56,
            alignItems: 'start',
          }}
        >
          {/* Your Apps — the custom app you build, with optional Medplum front-end libs. */}
          <div ref={refs.yourAppsBox} style={SECTION_WRAP}>
            <div className={styles.sectionLabel}>Your Apps</div>
            <Card
              nodeRef={refs.customApps}
              kind="customer"
              icon="appWindow"
              name="Custom App"
              sub="(EHR, Patient Portal)"
              compact
            />
            <Card kind="customer" icon="components" name="Component Library" sub="Optional" compact />
            <Card kind="customer" icon="box" name="TypeScript / JS SDK" sub="Optional" compact />
          </div>

          {/* Medplum Apps — two apps sharing one Component Library + SDK. */}
          <div ref={refs.medplumAppsBox} style={SECTION_WRAP}>
            <div className={styles.sectionLabel}>Medplum Apps</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--dg-inner-gap)' }}>
              <Card
                nodeRef={refs.medplumProv}
                kind="extensible"
                icon="stethoscope"
                name="Medplum Provider"
                sub="Example EHR"
                extensible
                compact
              />
              <Card
                nodeRef={refs.medplumApp}
                kind="extensible"
                icon="terminal"
                name="Medplum App"
                sub="Admin / Dev Console"
                extensible
                compact
              />
            </div>
            <Card kind="extensible" icon="components" name="Component Library" extensible compact />
            <Card kind="extensible" icon="box" name="TypeScript / JS SDK" extensible compact />
          </div>
        </div>

        {/* ═══════════════════ MAIN ROW — Platform + right column ═══════════════════ */}
        <div
          style={{
            position: 'relative',
            zIndex: 2,
            display: 'grid',
            gridTemplateColumns: '1fr 240px',
            gap: 56,
            alignItems: 'start',
          }}
        >
          {/* Medplum Hosted Platform */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div ref={refs.platformBox} style={SECTION_WRAP}>
              <div className={styles.sectionLabel}>
                Medplum Hosted Platform <span className={styles.sectionLabelNote}>*</span>
              </div>

              <div style={{ display: 'flex', gap: 'var(--dg-inner-gap)', alignItems: 'stretch' }}>
                {/* Governance — own freestanding stack, separated from platform services */}
                <div style={platformBlock({ width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column' })}>
                  {GOVERNANCE_SIDEBAR.flatMap((item, index) => {
                    const nodes = [
                      <div key={item.label} style={GOVERNANCE_CELL}>
                        <IconChip kind="medplum" icon={item.icon} />
                        <div className={styles.labelTextGrow}>{item.label}</div>
                        <ExtensibleMark />
                      </div>,
                    ];
                    if (index < GOVERNANCE_SIDEBAR.length - 1) {
                      nodes.push(
                        <div
                          key={`${item.label}-divider`}
                          style={{
                            marginLeft: GOVERNANCE_PAD,
                            marginRight: GOVERNANCE_PAD,
                            borderBottom: GOVERNANCE_DIVIDER,
                          }}
                        />
                      );
                    }
                    return nodes;
                  })}
                </div>

                {/* Platform services — freestanding blocks with gaps between each row */}
                <div
                  style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--dg-inner-gap)' }}
                >
                  {/* REST API + Auth API — one rounded block, split internally */}
                  <div style={platformBlock({ display: 'flex', alignItems: 'stretch' })}>
                    <div
                      ref={refs.fhirApi}
                      style={{
                        ...PLATFORM_ROW,
                        flex: 1,
                        minWidth: 0,
                      }}
                    >
                      <IconChip kind="medplum" icon="flame" />
                      <div className={styles.labelTextNowrap}>
                        FHIR <span ref={refs.fhirApiRest}>REST</span> API
                      </div>
                    </div>
                    <div style={{ borderLeft: PLATFORM_DIVIDER }} />
                    <div
                      ref={refs.medplumIdp}
                      style={{
                        ...PLATFORM_ROW,
                        flex: 1,
                        minWidth: 0,
                      }}
                    >
                      <IconChip kind="medplum" icon="lock" />
                      <div className={styles.labelText}>
                        Auth API <span className={styles.subText}>(Medplum Identity Provider)</span>
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 'var(--dg-inner-gap)',
                      marginLeft: 16,
                      marginRight: 16,
                    }}
                  >
                    <Card
                      nodeRef={refs.subs}
                      kind="extensible"
                      icon="bell"
                      name="Webhook / WebSocket Subscriptions"
                      nowrap
                      extensible
                      compact
                    />
                    <Card nodeRef={refs.bot} kind="extensible" icon="robot" name="Bots" extensible compact />
                  </div>

                  {/* FHIR Datastore — freestanding, fully rounded */}
                  <div
                    ref={refs.datastore}
                    style={platformBlock({
                      ...PLATFORM_ROW,
                      padding: '8px',
                    })}
                  >
                    <IconChip kind="medplum" icon="database" />
                    <div className={`${styles.labelTextNowrap} ${styles.labelTextGrow}`}>FHIR Datastore</div>
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        flexShrink: 0,
                        marginLeft: 'auto',
                        background: 'var(--dg-term-chip-bg)',
                        border: `1px solid ${C.borderBuild}`,
                        borderRadius: 8,
                        padding: '8px',
                      }}
                    >
                      <Icon name="reportSearch" color={C.iconBuild} size={16} />
                      <span className={styles.labelTextNowrap}>Terminology</span>
                      <span className={styles.subTextNowrap}>(SNOMED · ICD-10 · LOINC)</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className={styles.footnote}>
              <span>* </span>
              Hosted by default but can be self-hosted
            </div>
          </div>

          {/* RIGHT: External IDP → Medplum Agent → Integrations box. */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              marginTop: colShift,
            }}
          >
            <Card
              nodeRef={refs.byoIdp}
              kind="customer"
              icon="userKey"
              name="External Identity Provider"
              sub="Optional"
              compact
            />

            {/* Medplum Agent — Medplum software that runs on-prem, so it lives OUTSIDE the
               hosted-platform boundary but is styled Medplum-managed (grape). */}
            <Card
              nodeRef={refs.bridge}
              kind="extensible"
              icon="arrowsUpDown"
              iconRotate={90}
              name="Medplum Agent"
              sub="On-prem · HL7 / DICOM"
              extensible
              compact
            />

            {/* Integrations (gray section box). */}
            <div ref={refs.intBox} style={SECTION_WRAP}>
              <div className={styles.sectionLabel}>Integrations</div>
              <Card
                nodeRef={refs.intFirst}
                kind="extensible"
                icon="apps"
                iconRotate={-90}
                name="First-party"
                extensible
                compact
              />
              <Card nodeRef={refs.intThird} kind="customer" icon="apps" iconRotate={180} name="Third-party" compact />
            </div>
          </div>
        </div>

        {/* ═══════════════════ LEGEND (horizontal, full-width) ═══════════════════ */}
        <div style={{ marginBottom: '4rem', padding: '0px 10px' }}>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 28,
            }}
          >
            <LegendSwatch kind="medplum" label="Medplum-Managed" />
            <LegendSwatch kind="customer" label="User-Managed" />
            <LegendExtensible label="Extensible & Customizable" />
          </div>
        </div>
      </div>
    </div>
  );
}

export { ProductsDiagram };
