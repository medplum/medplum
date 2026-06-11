// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
// @ts-nocheck -- embedded architecture diagram: self-contained generated figure with
// inline styling and ref-measured SVG connectors; types intentionally skipped here.
import { useEffect, useRef, useState } from 'react';
import { FOUNDATIONS } from '../../data/platform-content';
import styles from './PlatformDiagram.module.css';

/* Foundation number map — numbering comes from the FOUNDATIONS array order, so the
   badges in the diagram always match the numbered nav pills above it. */
const NUM = Object.fromEntries(FOUNDATIONS.map((f, i) => [f.name, i + 1]));

/* ───────────────────────── Tokens ─────────────────────────
   Colors resolve to CSS custom properties (defined in PlatformDiagram.module.css)
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
};

const CATS = {
  medplum: {
    bg: C.purpleBg,
    border: C.purple,
    borderW: 2,
    iconColor: C.purple,
    iconBg: C.chipBg,
    iconBorder: C.purpleSoft,
  },
  extensible: {
    bg: C.purpleStripe,
    border: C.purple,
    borderW: 2,
    iconColor: C.purple,
    iconBg: C.chipBg,
    iconBorder: C.purpleSoft,
  },
  customer: {
    bg: C.bgGray,
    border: C.border,
    borderW: 1.5,
    iconColor: C.muted,
    iconBg: C.chipBg,
    iconBorder: C.border,
  },
  partner: {
    bg: C.panel,
    border: C.border,
    borderW: 1.5,
    iconColor: C.muted,
    iconBg: C.chipBg,
    iconBorder: C.border,
  },
};

/* ───────────────────────── Icon set ─────────────────────────
   Tabler-style 24x24, stroke 2, round caps/joins.
   Each returns the inner shape only — wrapper supplies size + color. */

const I = {
  apps: (
    <>
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <rect x="14" y="14" width="6" height="6" rx="1" />
    </>
  ),

  stethoscope: (
    <>
      <path d="M6 4v6a4 4 0 0 0 8 0V4" />
      <path d="M6 4h2" />
      <path d="M12 4h2" />
      <path d="M10 14v3a4 4 0 0 0 8 0v-2" />
      <circle cx="18" cy="13" r="2" />
    </>
  ),

  appWindow: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 9h18" />
      <circle cx="6" cy="7" r="0.5" fill="currentColor" />
      <circle cx="8" cy="7" r="0.5" fill="currentColor" />
    </>
  ),

  code: (
    <>
      <path d="M8 8l-4 4 4 4" />
      <path d="M16 8l4 4-4 4" />
      <path d="M14 4l-4 16" />
    </>
  ),

  layers: (
    <>
      <path d="M12 4l8 4-8 4-8-4 8-4z" />
      <path d="M4 12l8 4 8-4" />
      <path d="M4 16l8 4 8-4" />
    </>
  ),

  key: (
    <>
      <circle cx="8" cy="15" r="3" />
      <path d="M10.5 13l8-8" />
      <path d="M16 7l3 3" />
      <path d="M14 9l3 3" />
    </>
  ),

  lock: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),

  shield: (
    <>
      <path d="M12 3l8 3v5c0 5-4 9-8 10-4-1-8-5-8-10V6l8-3z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),

  api: (
    <>
      <path d="M4 7h7" />
      <path d="M13 7h7" />
      <path d="M4 12h16" />
      <path d="M4 17h7" />
      <path d="M13 17h7" />
      <circle cx="11.5" cy="7" r="1.2" />
      <circle cx="11.5" cy="17" r="1.2" />
    </>
  ),

  bell: (
    <>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </>
  ),

  robot: (
    <>
      <rect x="4" y="7" width="16" height="12" rx="2" />
      <path d="M12 4v3" />
      <circle cx="12" cy="4" r="1" />
      <circle cx="9" cy="13" r="1" fill="currentColor" />
      <circle cx="15" cy="13" r="1" fill="currentColor" />
      <path d="M9 17h6" />
    </>
  ),

  database: (
    <>
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
      <path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
    </>
  ),

  fileTransfer: (
    <>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M14 3v6h6" />
      <path d="M8 14l3-3 3 3" />
      <path d="M11 17v-6" />
    </>
  ),

  link: (
    <>
      <path d="M9 15l6-6" />
      <path d="M10.5 6.5l1.5-1.5a4 4 0 0 1 5.6 5.6l-1.5 1.5" />
      <path d="M13.5 17.5l-1.5 1.5a4 4 0 0 1-5.6-5.6l1.5-1.5" />
    </>
  ),

  tag: (
    <>
      <path d="M3 7v5l8 8 6-6-8-8H3z" />
      <circle cx="7" cy="11" r="1.4" fill="currentColor" />
    </>
  ),
};

function Icon({ name, color = '#9CA3AF', size = 20 }) {
  const inner = I[name] || I.apps;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {inner}
    </svg>
  );
}

function IconChip({ kind, icon, size = 44 }) {
  const k = CATS[kind] || CATS.partner;
  return (
    <div
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        background: k.iconBg,
        border: `1px solid ${k.iconBorder}`,
        borderRadius: 10,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name={icon} color={k.iconColor} size={Math.round(size * 0.5)} />
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
  name,
  sub,
  dashed = false,
  compact = false,
  badge = null,
  style = {},
  className = '',
  ...rest
}) {
  const k = CATS[kind] || CATS.medplum;
  const chipSize = compact ? 32 : 44;
  /* Base shadow comes from a class (not inline) so the highlight ring's box-shadow
     in the stylesheet can take effect on clickable cards. */
  const shadowClass = kind === 'partner' ? styles.cardShadowDeep : styles.cardShadow;
  return (
    <div
      ref={nodeRef}
      className={`${shadowClass} ${className}`}
      {...rest}
      style={{
        background: k.bg,
        /* Border color reads through --hl-border so the highlight rules in the
         stylesheet can recolor THIS border (same shape, radius, and dash). */
        border: dashed
          ? `2.5px dashed var(--hl-border, ${C.dashed})`
          : `${k.borderW}px solid var(--hl-border, ${k.border})`,
        borderRadius: 12,
        padding: compact ? '7px 10px 7px 7px' : '10px 14px 10px 10px',
        display: 'flex',
        alignItems: 'center',
        gap: compact ? 7 : 11,
        ...style,
      }}
    >
      {badge != null && <span className={styles.numBadge}>{badge}</span>}
      <IconChip kind={kind} icon={icon} size={chipSize} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: compact ? 12.5 : 14.5,
            color: C.text,
            fontWeight: 500,
            lineHeight: 1.2,
            whiteSpace: 'pre-line',
          }}
        >
          {name}
        </div>
        {sub && (
          <div style={{ fontSize: compact ? 10 : 11.5, color: C.sub, marginTop: 2, lineHeight: 1.25 }}>{sub}</div>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── Legend ───────────────────────── */

function LegendSwatch({ kind, dashed = false, label }) {
  const k = CATS[kind];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div
        style={{
          width: 34,
          height: 22,
          borderRadius: 5,
          background: k.bg,
          border: dashed ? `2.5px dashed ${C.dashed}` : `${k.borderW}px solid ${k.border}`,
          flexShrink: 0,
        }}
      />
      <span style={{ fontSize: 13, color: C.text }}>{label}</span>
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

/* Orthogonal polyline through a list of points. Renders a page-colored halo
   underneath the colored stroke so the line stays visible where it crosses
   the Medplum Platform's purple border. */
function Elbow({ points, color = C.line, dashed = false, w = 2 }) {
  if (!points || points.length < 2) return null;
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  return (
    <>
      <path d={d} fill="none" stroke={C.bgPage} strokeWidth={w + 4} strokeLinecap="round" strokeLinejoin="round" />
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={w}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={dashed ? '5 4' : undefined}
      />
    </>
  );
}

function Straight({ from, to, color = C.line, dashed = false, w = 2 }) {
  if (!from || !to) return null;
  return (
    <>
      <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={C.bgPage} strokeWidth={w + 4} strokeLinecap="round" />
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
    </>
  );
}

/* ───────────────────────── Diagram ───────────────────────── */

function MedplumDiagram({ active = null, peek = null, onSelect }) {
  const rootRef = useRef(null);
  const [R, setR] = useState({});

  /* Interactive-foundation wiring. A region passes its foundation name (matching the
     names in platform-content's FOUNDATIONS) so the parent tracker can show its copy.
     Several regions can share a name (e.g. all three SDK boxes) — they all highlight
     together when active. Focus uses a SPOTLIGHT: when a foundation is selected, all
     other elements (foundations and context alike) dim, so the active region(s) read
     as the single lit cluster. `peek` mirrors the hover state (driven by hovering the
     nav pills above the diagram). Context elements (apps, external IdP, integrations)
     are not interactive: they only ever dim. */
  const isActive = (name) => active === name;
  const pick = (name) => onSelect && onSelect(name);
  /* opts.band: platform-interior bands have partial borders, so they highlight with
     an inset ring instead of a border recolor (see PlatformDiagram.module.css). */
  const clk = (name, opts = {}) => ({
    className: [
      styles.clickable,
      styles.dimmable,
      opts.band ? styles.regionBand : '',
      isActive(name) ? styles.active : '',
      active && !isActive(name) ? styles.dimmed : '',
      peek === name ? styles.peeked : '',
    ].join(' '),
    onClick: () => pick(name),
    role: 'button',
    tabIndex: 0,
    'aria-pressed': isActive(name),
    onKeyDown: (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        pick(name);
      }
    },
  });
  /* Non-interactive context: dims whenever any foundation is in focus. */
  const ctxClass = `${styles.dimmable} ${active ? styles.dimmed : ''}`;
  /* SVG overlays (connectors) can't take the class treatment per-line; dim wholesale.
     Kept high so the wiring stays solid-looking even in spotlight mode. */
  const svgDim = { opacity: active ? 0.75 : 1, transition: 'opacity 200ms ease' };

  const refs = {
    customApps: useRef(null),
    medplumProv: useRef(null),
    medplumApp: useRef(null),
    sdkCustom: useRef(null),
    sdkProv: useRef(null),
    sdkApp: useRef(null),
    byoIdp: useRef(null),
    bridge: useRef(null),
    medplumIdp: useRef(null),
    rbac: useRef(null),
    fhirApi: useRef(null),
    subs: useRef(null),
    bot: useRef(null),
    datastore: useRef(null),
    intBox: useRef(null),
    platformBox: useRef(null),
    rightCol: useRef(null),
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
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  const bottom = (r) => r && { x: r.x + r.w / 2, y: r.y + r.h };
  const top = (r) => r && { x: r.x + r.w / 2, y: r.y };
  const right = (r) => r && { x: r.x + r.w, y: r.y + r.h / 2 };
  const left = (r) => r && { x: r.x, y: r.y + r.h / 2 };

  const svgH = R.datastore ? R.datastore.y + R.datastore.h + 60 : 1000;

  /* Shift the right column (BYO IDP + Integrations) down so the BYO IDP card's vertical
     center lines up with the Auth API band — that lets the BYO IDP ↔ Auth API connector
     run as a single straight horizontal line. */
  const [colShift, setColShift] = useState(0);
  useEffect(() => {
    if (!R.medplumIdp || !R.byoIdp) return;
    const authCenter = R.medplumIdp.y + R.medplumIdp.h / 2;
    const idpCenter = R.byoIdp.y + R.byoIdp.h / 2;
    const delta = authCenter - idpCenter;
    if (Math.abs(delta) > 0.5) {
      setColShift((s) => s + delta);
    }
  }, [R.medplumIdp && R.medplumIdp.y, R.medplumIdp && R.medplumIdp.h, R.byoIdp && R.byoIdp.y, R.byoIdp && R.byoIdp.h]);

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
      <div ref={rootRef} style={{ maxWidth: 1180, margin: '0 auto', position: 'relative' }}>
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
            ...svgDim,
          }}
        >
          {/* SDK boxes → FHIR REST API */}
          {R.fhirApi &&
            (() => {
              const target = top(R.fhirApi);
              const boxes = [R.sdkCustom, R.sdkProv, R.sdkApp].filter(Boolean);
              if (!boxes.length) return null;
              const bottoms = boxes.map(bottom);
              const lowestY = Math.max(...bottoms.map((p) => p.y));
              const trunkY = (lowestY + R.fhirApi.y) / 2;
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

          {/* Custom Apps → FHIR REST API (direct, routed out to the left margin). */}
          {R.customApps &&
            R.fhirApi &&
            (() => {
              const from = left(R.customApps);
              const apiMidY = R.fhirApi.y + R.fhirApi.h / 2;
              const apiEntry = { x: R.fhirApi.x, y: apiMidY };
              const baseX = R.platformBox ? Math.min(R.platformBox.x, R.customApps.x) : R.customApps.x;
              const laneX = baseX - 24;
              return (
                <>
                  <Elbow points={[from, { x: laneX, y: from.y }, { x: laneX, y: apiMidY }, apiEntry]} />
                  <Dot p={from} />
                  <Dot p={apiEntry} />
                </>
              );
            })()}

          {/* BYO IDP ↔ Auth API (Medplum IDP): single straight horizontal line. */}
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
            R.platformBox &&
            R.bridge &&
            (() => {
              const subsR = right(R.subs);
              const botR = right(R.bot);
              const innerTrunkX = Math.max(subsR.x, botR.x) + 14;
              const trunkMidY = (subsR.y + botR.y) / 2;
              const platRightX = R.platformBox.x + R.platformBox.w;
              const laneX = platRightX + 12;

              const bridgeP = left(R.bridge);
              const intEntryY = R.intBox.y + R.intBox.h / 2;
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

        {/* ═══════════════════ TOP ROW (apps) + directly-attached SDK boxes ═══════════════════ */}
        <div
          style={{
            position: 'relative',
            zIndex: 2,
            marginBottom: 56,
            display: 'grid',
            gridTemplateColumns: '1fr 240px',
            gap: 24,
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', columnGap: 14, rowGap: 0 }}>
            {/* Row 1 — app headers (context, not clickable) */}
            <Card
              nodeRef={refs.customApps}
              className={ctxClass}
              kind="customer"
              icon="apps"
              name="Custom Apps"
              style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottomWidth: 0 }}
            />
            <Card
              nodeRef={refs.medplumProv}
              className={ctxClass}
              kind="extensible"
              icon="stethoscope"
              name="Medplum Provider"
              sub="Example EHR"
              style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}
            />
            <Card
              nodeRef={refs.medplumApp}
              className={ctxClass}
              kind="extensible"
              icon="appWindow"
              name="Medplum App"
              sub="Admin / Dev Console"
              style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}
            />

            {/* Row 2 — React Storybook (foundation, clickable; badge on the middle copy) */}
            <Card
              {...clk('React Storybook')}
              kind="customer"
              dashed
              icon="layers"
              name="React Storybook"
              compact
              style={{ borderRadius: 0, borderBottomWidth: 0 }}
            />
            <Card
              {...clk('React Storybook')}
              badge={NUM['React Storybook']}
              kind="extensible"
              icon="layers"
              name="React Storybook"
              compact
              style={{ borderRadius: 0, borderTopWidth: 0 }}
            />
            <Card
              {...clk('React Storybook')}
              kind="extensible"
              icon="layers"
              name="React Storybook"
              compact
              style={{ borderRadius: 0, borderTopWidth: 0 }}
            />

            {/* Row 3 — TypeScript / JavaScript SDK (foundation, clickable; badge on the middle copy) */}
            <Card
              nodeRef={refs.sdkCustom}
              {...clk('TypeScript / JavaScript SDK')}
              kind="customer"
              dashed
              icon="code"
              name="TypeScript / JavaScript SDK"
              compact
              style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0 }}
            />
            <Card
              nodeRef={refs.sdkProv}
              {...clk('TypeScript / JavaScript SDK')}
              badge={NUM['TypeScript / JavaScript SDK']}
              kind="extensible"
              icon="code"
              name="TypeScript / JavaScript SDK"
              compact
              style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0, borderTopWidth: 0 }}
            />
            <Card
              nodeRef={refs.sdkApp}
              {...clk('TypeScript / JavaScript SDK')}
              kind="extensible"
              icon="code"
              name="TypeScript / JavaScript SDK"
              compact
              style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0, borderTopWidth: 0 }}
            />
          </div>
          <div />
        </div>

        {/* ═══════════════════ MAIN ROW ═══════════════════ */}
        <div
          style={{
            position: 'relative',
            zIndex: 2,
            display: 'grid',
            gridTemplateColumns: '1fr 240px',
            gap: 24,
            alignItems: 'start',
          }}
        >
          {/* CENTER: Medplum Platform */}
          <div style={{ position: 'relative' }} ref={refs.platformBox}>
            <div
              className={ctxClass}
              style={{
                position: 'absolute',
                top: -12,
                right: 22,
                background: C.hostedBg,
                color: 'white',
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.08em',
                padding: '4px 12px',
                borderRadius: 6,
                zIndex: 3,
              }}
            >
              MEDPLUM HOSTED PLATFORM*
            </div>

            <div
              style={{
                border: `2px solid ${C.purple}`,
                borderRadius: 18,
                background: C.purpleBg,
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'stretch',
              }}
            >
              {/* Left vertical band — Access Control (RBAC), foundation, clickable */}
              <div
                ref={refs.rbac}
                {...clk('Access Control & Tenancy', { band: true })}
                style={{
                  background: C.purpleStripe,
                  borderRight: `2px solid ${C.purple}`,
                  /* Matches the visible shape created by the platform box's rounded
                 clipping (18px container radius − 2px border), so the highlight
                 ring follows the rounded corners. */
                  borderRadius: '16px 0 0 16px',
                  padding: '14px 10px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 14,
                  flexShrink: 0,
                }}
              >
                <span className={`${styles.numBadge} ${styles.numBadgeInset}`}>{NUM['Access Control & Tenancy']}</span>
                <IconChip kind="medplum" icon="shield" />
                <div
                  style={{
                    fontSize: 14.5,
                    fontWeight: 500,
                    color: C.text,
                    letterSpacing: '0.04em',
                    writingMode: 'horizontal-tb',
                    textAlign: 'center',
                  }}
                >
                  Access
                  <br />
                  Control
                </div>
              </div>

              {/* Right side — stacked bands */}
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                {/* Top band — FHIR REST API (left) + Auth API / Medplum IDP (right) */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    alignItems: 'stretch',
                  }}
                >
                  <div
                    ref={refs.fhirApi}
                    {...clk('FHIR Data Store & API', { band: true })}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 11,
                      padding: '16px 22px',
                      borderBottom: `2px solid ${C.purple}`,
                      minWidth: 0,
                    }}
                  >
                    <span className={`${styles.numBadge} ${styles.numBadgeInset}`}>{NUM['FHIR Data Store & API']}</span>
                    <IconChip kind="medplum" icon="api" />
                    <div style={{ fontSize: 14.5, fontWeight: 500, color: C.text, whiteSpace: 'nowrap' }}>
                      FHIR REST API
                    </div>
                  </div>
                  <div
                    ref={refs.medplumIdp}
                    {...clk('Medplum Auth', { band: true })}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 11,
                      padding: '16px 22px',
                      borderLeft: `2.5px dashed ${C.purple}`,
                      borderBottom: `2.5px dashed ${C.purple}`,
                      /* Rounded to match the platform box's clipped top-right corner. */
                      borderRadius: '0 16px 0 0',
                      position: 'relative',
                      minWidth: 0,
                    }}
                  >
                    <span className={`${styles.numBadge} ${styles.numBadgeInset}`}>{NUM['Medplum Auth']}</span>
                    <IconChip kind="medplum" icon="lock" />
                    <div style={{ fontSize: 14.5, fontWeight: 500, color: C.text, lineHeight: 1.25 }}>
                      Auth API <span style={{ color: C.sub, fontWeight: 400 }}>(Medplum Identity Provider)</span>
                    </div>
                  </div>
                </div>

                {/* Middle band — extensible cards on a lighter interior */}
                <div
                  style={{
                    borderBottom: `2px solid ${C.purple}`,
                    padding: 22,
                    background: C.panel,
                    flex: 1,
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <Card
                      nodeRef={refs.subs}
                      {...clk('Subscriptions')}
                      badge={NUM['Subscriptions']}
                      kind="extensible"
                      icon="bell"
                      name={'Webhook / WebSocket\nSubscriptions'}
                    />
                    <Card
                      nodeRef={refs.bot}
                      {...clk('Bots')}
                      badge={NUM['Bots']}
                      kind="extensible"
                      icon="robot"
                      name="Bots"
                    />
                  </div>
                </div>

                {/* Bottom band — FHIR Datastore (with nested Terminology sub-pill) */}
                <div
                  ref={refs.datastore}
                  {...clk('FHIR Data Store & API', { band: true })}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 11,
                    padding: '16px 22px',
                    /* Rounded to match the platform box's clipped bottom-right corner. */
                    borderRadius: '0 0 16px 0',
                  }}
                >
                  <span className={`${styles.numBadge} ${styles.numBadgeInset}`}>{NUM['FHIR Data Store & API']}</span>
                  <IconChip kind="medplum" icon="database" />
                  <div style={{ fontSize: 14.5, fontWeight: 500, color: C.text, whiteSpace: 'nowrap' }}>
                    FHIR Datastore
                  </div>
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      marginLeft: 18,
                      flexShrink: 0,
                      background: C.panel,
                      border: `1.5px solid ${C.purpleSoft}`,
                      borderRadius: 10,
                      padding: '8px 15px 8px 12px',
                    }}
                  >
                    <Icon name="tag" color={C.purple} size={16} />
                    <span style={{ fontSize: 12.5, fontWeight: 500, color: C.text, whiteSpace: 'nowrap' }}>
                      Terminology
                    </span>
                    <span style={{ fontSize: 11.5, color: C.sub, whiteSpace: 'nowrap' }}>SNOMED · ICD-10 · LOINC</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Auth API dashed L-segment overlay */}
            {(() => {
              if (!R.platformBox || !R.medplumIdp) return null;
              const PL = R.platformBox;
              const w = PL.w,
                h = PL.h;
              const inset = 1,
                r = 18 - inset;
              const Tx = inset,
                Rx = w - inset;
              const dx = R.medplumIdp.x - PL.x;
              const ay = R.medplumIdp.y - PL.y + R.medplumIdp.h;
              const path = `M ${dx} ${Tx} L ${Rx - r} ${Tx} A ${r} ${r} 0 0 1 ${Rx} ${Tx + r} L ${Rx} ${ay}`;
              return (
                <svg
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    width: w,
                    height: h,
                    zIndex: 2,
                    pointerEvents: 'none',
                    overflow: 'visible',
                    opacity: active && active !== 'Medplum Auth' ? 0.75 : 1,
                    transition: 'opacity 200ms ease',
                  }}
                >
                  <path d={path} fill="none" stroke={C.bgPage} strokeWidth="3" strokeLinecap="butt" />
                  <path
                    d={path}
                    fill="none"
                    stroke={C.purple}
                    strokeWidth="2.5"
                    strokeDasharray="6 4"
                    strokeLinecap="butt"
                  />
                </svg>
              );
            })()}
          </div>

          {/* RIGHT: External IDP (context) → Medplum Bridge (foundation, clickable) →
             Integrations box (context). */}
          <div
            ref={refs.rightCol}
            style={{
              display: 'flex',
              flexDirection: 'column',
              marginTop: colShift,
            }}
          >
            <div style={{ marginBottom: 22 }}>
              <Card
                nodeRef={refs.byoIdp}
                className={ctxClass}
                kind="customer"
                icon="key"
                dashed
                name="External Identity Provider"
                sub="Optional"
              />
            </div>

            {/* Medplum Bridge — Medplum software that runs on-prem, so it lives OUTSIDE the
               hosted-platform boundary but is styled Medplum-managed (purple). Clickable. */}
            <div style={{ marginBottom: 28 }}>
              <Card
                nodeRef={refs.bridge}
                {...clk('Medplum Bridge')}
                badge={NUM['Medplum Bridge']}
                kind="extensible"
                icon="fileTransfer"
                name="Medplum Bridge"
                sub="On-prem · HL7 / DICOM"
              />
            </div>

            <div
              ref={refs.intBox}
              className={ctxClass}
              style={{
                border: `1.5px solid ${C.border}`,
                borderRadius: 16,
                padding: '20px 14px 14px',
                background: C.intBg,
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                gap: 9,
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: -12,
                  left: 22,
                  background: C.intPillBg,
                  color: C.text,
                  border: `1px solid ${C.intPillBorder}`,
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  padding: '4px 12px',
                  borderRadius: 6,
                }}
              >
                INTEGRATIONS
              </div>

              {/* Two buckets, split by who maintains the connector (context, not clickable). */}
              <Card kind="extensible" icon="link" name="First-party" compact />
              <Card kind="customer" icon="link" name="Third-party" compact />
            </div>
          </div>
        </div>

        {/* ═══════════════════ LEGEND (horizontal, full-width) ═══════════════════ */}
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: C.text, marginBottom: 12 }}>Legend</div>
          <div
            style={{
              background: C.panelSoft,
              border: `1.5px solid ${C.border}`,
              borderRadius: 10,
              padding: '12px 20px',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 18,
            }}
          >
            <LegendSwatch kind="medplum" label="Medplum-Managed" />
            <LegendSwatch kind="extensible" label="Medplum-Managed, With Extensibility" />
            <LegendSwatch kind="customer" label="User-Managed" />
            <LegendSwatch kind="customer" dashed label="User-Managed (Optional)" />
          </div>
          <div
            style={{
              marginTop: 10,
              fontSize: 12,
              color: C.muted,
              fontStyle: 'italic',
            }}
          >
            *The Medplum Platform is hosted by default. It can also be self-hosted.
          </div>
        </div>
      </div>
    </div>
  );
}

export { MedplumDiagram };
