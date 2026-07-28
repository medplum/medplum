// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { useEffect, useRef, useState, type JSX } from 'react';
import styles from './ProductsCapabilities.module.css';

/* Theme-aware palette — CSS variables on .bentoImageClip (light UI in light mode, dark mini-app in dark mode). */
const CAP = {
  bg: 'var(--cap-preview-bg)',
  fg: 'var(--cap-preview-fg)',
  body: 'var(--cap-preview-body)',
  muted: 'var(--cap-preview-muted)',
  border: 'var(--cap-preview-border)',
  grid: 'var(--cap-preview-grid)',
  input: 'var(--cap-preview-input)',
  segBg: 'var(--cap-preview-seg-bg)',
  segText: 'var(--cap-preview-seg-text)',
  highlight: 'var(--cap-preview-highlight)',
  bubble: 'var(--cap-preview-bubble)',
  badgeBg: 'var(--cap-preview-badge-bg)',
  badgeFg: 'var(--cap-preview-badge-fg)',
  rxBg: 'var(--cap-preview-rx-bg)',
  rxFg: 'var(--cap-preview-rx-fg)',
  blue: 'var(--cap-preview-blue)',
  accent: 'var(--cap-preview-accent)',
  red: 'var(--cap-preview-red)',
  greenBg: 'var(--cap-preview-green-bg)',
  greenFg: 'var(--cap-preview-green-fg)',
  yellowBg: 'var(--cap-preview-yellow-bg)',
  yellowFg: 'var(--cap-preview-yellow-fg)',
  pillBg: 'var(--cap-preview-pill-bg)',
  onAccent: 'var(--cap-preview-on-accent)',
} as const;

function IntakeFormPreview(): JSX.Element {
  const f = 'system-ui,-apple-system,sans-serif';

  return (
    <svg
      className={styles.bentoPreviewCard}
      viewBox="0 0 300 300"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="0" y="0" width="300" height="300" fill={CAP.bg} />

      {/* Demographics heading */}
      <text x="20" y="34" fontFamily={f} fontSize="16" fontWeight="700" fill={CAP.fg}>
        Demographics
      </text>

      {/* First Name * */}
      <text x="20" y="60" fontFamily={f} fontSize="12" fontWeight="500" fill={CAP.fg}>
        First Name
        <tspan dx="4" fill={CAP.red}>
          *
        </tspan>
      </text>
      <rect x="20" y="66" width="260" height="32" rx="4" fill={CAP.input} stroke={CAP.border} strokeWidth="1.5" />
      <text x="30" y="86" fontFamily={f} fontSize="13" fill={CAP.fg}>
        Sarah
      </text>

      {/* Middle Name */}
      <text x="20" y="122" fontFamily={f} fontSize="12" fontWeight="500" fill={CAP.fg}>
        Middle Name
      </text>
      <rect x="20" y="128" width="260" height="32" rx="4" fill={CAP.input} stroke={CAP.border} strokeWidth="1.5" />

      {/* Last Name * */}
      <text x="20" y="184" fontFamily={f} fontSize="12" fontWeight="500" fill={CAP.fg}>
        Last Name
        <tspan dx="4" fill={CAP.red}>
          *
        </tspan>
      </text>
      <rect x="20" y="190" width="260" height="32" rx="4" fill={CAP.input} stroke={CAP.border} strokeWidth="1.5" />
      <text x="30" y="210" fontFamily={f} fontSize="13" fill={CAP.fg}>
        Mitchell
      </text>

      {/* Date of Birth * */}
      <text x="20" y="246" fontFamily={f} fontSize="12" fontWeight="500" fill={CAP.fg}>
        Date of Birth
        <tspan dx="4" fill={CAP.red}>
          *
        </tspan>
      </text>
      <rect x="20" y="252" width="260" height="32" rx="4" fill={CAP.input} stroke={CAP.border} strokeWidth="1.5" />
      <text x="30" y="272" fontFamily={f} fontSize="13" fill={CAP.fg}>
        04/12/1988
      </text>
    </svg>
  );
}

function SchedulingPreview(): JSX.Element {
  const f = 'system-ui,-apple-system,sans-serif';
  const gutterW = 50;
  const gutterPad = 10; // right inset for the time labels within the gutter

  // Horizontal hour lines + their gutter labels (top of each hour slot).
  const hours = [
    { y: 122, label: '9 AM' },
    { y: 158, label: '10 AM' },
    { y: 194, label: '11 AM' },
    { y: 230, label: '12 PM' },
    { y: 266, label: '1 PM' },
  ];

  return (
    <svg
      className={styles.bentoPreviewCard}
      viewBox="0 0 300 300"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="0" y="0" width="300" height="300" fill={CAP.bg} />

      {/* Month / Week / Day segmented control */}
      <rect x="96" y="12" width="150" height="26" rx="7" fill={CAP.segBg} />
      <rect x="149" y="15" width="44" height="20" rx="5" fill={CAP.input} />
      <text x="121" y="29" fontFamily={f} fontSize="11" fill={CAP.segText} textAnchor="middle">
        Month
      </text>
      <text x="171" y="29" fontFamily={f} fontSize="11" fontWeight="600" fill={CAP.fg} textAnchor="middle">
        Week
      </text>
      <text x="221" y="29" fontFamily={f} fontSize="11" fill={CAP.segText} textAnchor="middle">
        Day
      </text>

      {/* Grid frame: top border, two day columns + a time gutter */}
      <line x1="0" y1="54" x2="300" y2="54" stroke={CAP.grid} strokeWidth="1.5" />
      <line x1={gutterW} y1="54" x2={gutterW} y2="300" stroke={CAP.grid} strokeWidth="1.5" />
      <line x1="167" y1="54" x2="167" y2="300" stroke={CAP.grid} strokeWidth="1.5" />

      {/* Day headers */}
      <text
        x={(gutterW + 167) / 2}
        y="74"
        fontFamily={f}
        fontSize="12"
        fontWeight="700"
        fill={CAP.fg}
        textAnchor="middle"
      >
        01 Fri
      </text>
      <text x="233" y="74" fontFamily={f} fontSize="12" fontWeight="700" fill={CAP.fg} textAnchor="middle">
        02 Sat
      </text>
      <line x1="0" y1="86" x2="300" y2="86" stroke={CAP.grid} strokeWidth="1.5" />

      {/* Hour rows + gutter labels */}
      {hours.map((h) => (
        <g key={h.label}>
          <line x1={gutterW} y1={h.y} x2="300" y2={h.y} stroke={CAP.grid} strokeWidth="1" />
          <text x={gutterW - gutterPad} y={h.y + 4} fontFamily={f} fontSize="9" fill={CAP.muted} textAnchor="end">
            {h.label}
          </text>
        </g>
      ))}

      {/* Appointment block — aligned to the 10–11 AM slot; same patient as the intake form */}
      <rect x={gutterW + 6} y="158" width="112" height="36" rx="5" fill={CAP.blue} />
      <text x={gutterW + 14} y="174" fontFamily={f} fontSize="9" fill={CAP.onAccent} fillOpacity="0.9">
        10:00 – 11:00 AM
      </text>
      <text x={gutterW + 14} y="189" fontFamily={f} fontSize="11" fontWeight="600" fill={CAP.onAccent}>
        Sarah Mitchell
      </text>
    </svg>
  );
}

function ChartingPreview(): JSX.Element {
  const f = 'system-ui,-apple-system,sans-serif';

  // SOAP note sections.
  const sections = [
    { label: 'Subjective', y: 82, text: 'Mild headache ×3 days, improving.' },
    { label: 'Objective', y: 124, text: 'BP 118/76 · HR 72 · Temp 98.6°F' },
    { label: 'Assessment', y: 166, text: 'Tension-type headache, resolving' },
    { label: 'Plan', y: 208, text: 'Hydration; follow-up in 2 weeks' },
  ];

  return (
    <svg
      className={styles.bentoPreviewCard}
      viewBox="0 0 300 300"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="0" y="0" width="300" height="300" fill={CAP.bg} />

      {/* Note header */}
      <text x="20" y="32" fontFamily={f} fontSize="16" fontWeight="700" fill={CAP.fg}>
        Progress Note
      </text>
      <text x="20" y="50" fontFamily={f} fontSize="10" fill={CAP.muted}>
        Dr. A. Nguyen · Mar 1, 2025
      </text>
      <line x1="20" y1="62" x2="280" y2="62" stroke={CAP.grid} strokeWidth="1.5" />

      {sections.map((s) => (
        <g key={s.label}>
          <text x="20" y={s.y} fontFamily={f} fontSize="11" fontWeight="700" fill={CAP.fg}>
            {s.label}
          </text>
          <text x="20" y={s.y + 16} fontFamily={f} fontSize="11" fill={CAP.body}>
            {s.text}
          </text>
        </g>
      ))}
    </svg>
  );
}

function DiagnosticOrdersPreview(): JSX.Element {
  const f = 'system-ui,-apple-system,sans-serif';

  // Lab orders with Mantine-style status badges.
  const green = { bg: CAP.greenBg, fg: CAP.greenFg };
  const yellow = { bg: CAP.yellowBg, fg: CAP.yellowFg };
  const orders = [
    { name: 'CBC with Differential', date: 'Mar 1, 2025', status: 'Final', tone: green },
    { name: 'Lipid Panel', date: 'Feb 28, 2025', status: 'Final', tone: green },
    { name: 'Hemoglobin A1c', date: 'Ordered Mar 2, 2025', status: 'Pending', tone: yellow },
    { name: 'TSH, Serum', date: 'Ordered Mar 2, 2025', status: 'Pending', tone: yellow },
  ];

  // Equal-height row bands so the padding between items stays even; each item's
  // text block and badge are vertically centered within its band.
  const firstDivider = 46;
  const rowH = 51;

  return (
    <svg
      className={styles.bentoPreviewCard}
      viewBox="0 0 300 300"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="0" y="0" width="300" height="300" fill={CAP.bg} />

      <text x="20" y="32" fontFamily={f} fontSize="16" fontWeight="700" fill={CAP.fg}>
        Lab Orders
      </text>

      {orders.map((o, i) => {
        const top = firstDivider + i * rowH;
        const pillW = o.status === 'Pending' ? 58 : 44;
        const pillX = 280 - pillW;
        const nameY = top + 22;
        const dateY = top + 37;
        const pillY = top + (rowH - 20) / 2;
        return (
          <g key={o.name}>
            <line x1="20" y1={top} x2="280" y2={top} stroke={CAP.grid} strokeWidth="1.5" />
            <text x="20" y={nameY} fontFamily={f} fontSize="12" fontWeight="600" fill={CAP.fg}>
              {o.name}
            </text>
            <text x="20" y={dateY} fontFamily={f} fontSize="10" fill={CAP.muted}>
              {o.date}
            </text>
            <rect x={pillX} y={pillY} width={pillW} height="20" rx="10" fill={o.tone.bg} />
            <text
              x={pillX + pillW / 2}
              y={pillY + 14}
              fontFamily={f}
              fontSize="9.5"
              fontWeight="600"
              fill={o.tone.fg}
              textAnchor="middle"
            >
              {o.status}
            </text>
          </g>
        );
      })}
      <line
        x1="20"
        y1={firstDivider + orders.length * rowH}
        x2="280"
        y2={firstDivider + orders.length * rowH}
        stroke={CAP.grid}
        strokeWidth="1.5"
      />
    </svg>
  );
}

function MedicationsPreview(): JSX.Element {
  const f = 'system-ui,-apple-system,sans-serif';

  const meds = [
    { top: 48, name: 'Lisinopril 10 mg', sig: '1 tablet daily · Refills: 3' },
    { top: 104, name: 'Metformin 500 mg', sig: '1 tablet twice daily · Refills: 2' },
    { top: 160, name: 'Atorvastatin 20 mg', sig: '1 tablet nightly · Refills: 5' },
  ];

  return (
    <svg
      className={styles.bentoPreviewCard}
      viewBox="0 0 300 300"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="0" y="0" width="300" height="300" fill={CAP.bg} />

      <text x="20" y="32" fontFamily={f} fontSize="16" fontWeight="700" fill={CAP.fg}>
        Active Medications
      </text>

      {meds.map((m) => {
        const nameY = m.top + 23;
        const sigY = m.top + 38; // tightened gap so the two lines read as one block
        const chipSize = 28;
        // Center the Rx chip on the optical center of the name + sig block.
        const blockCenterY = (nameY - 9 + (sigY + 2)) / 2;
        const chipY = blockCenterY - chipSize / 2;
        return (
          <g key={m.name}>
            <line x1="20" y1={m.top} x2="280" y2={m.top} stroke={CAP.grid} strokeWidth="1.5" />
            <rect x="20" y={chipY} width={chipSize} height={chipSize} rx="6" fill={CAP.rxBg} />
            <text
              x={20 + chipSize / 2}
              y={blockCenterY}
              fontFamily={f}
              fontSize="12"
              fontWeight="700"
              fill={CAP.rxFg}
              textAnchor="middle"
              dominantBaseline="central"
            >
              Rx
            </text>
            <text x="58" y={nameY} fontFamily={f} fontSize="12" fontWeight="600" fill={CAP.fg}>
              {m.name}
            </text>
            <text x="58" y={sigY} fontFamily={f} fontSize="10" fill={CAP.muted}>
              {m.sig}
            </text>
          </g>
        );
      })}
      <line x1="20" y1="216" x2="280" y2="216" stroke={CAP.grid} strokeWidth="1.5" />
    </svg>
  );
}

function CareCoordinationPreview(): JSX.Element {
  const f = 'system-ui,-apple-system,sans-serif';
  const padX = 12;
  const badgeH = 18;
  const badgeInset = 7; // gap from badge to card's right edge — mirrors the card's top padding
  const dividerY = 48;
  const lineGap = 15; // baseline-to-baseline within a task
  const blockGap = 30; // gap between tasks (and between the divider and the first task)

  const tasks = [
    {
      title: 'Schedule cardiology follow-up',
      due: 'Due Mar 15, 2025',
      patient: 'Sarah Mitchell',
      assignee: 'Dr. A. Nguyen',
      status: 'Ready',
      badgeW: 44,
      selected: false,
    },
    {
      title: 'Send PT referral',
      due: null,
      patient: 'James Ortiz',
      assignee: 'Care Coordinator',
      status: 'In Progress',
      badgeW: 72,
      selected: true,
    },
    {
      title: 'Review care plan goals',
      due: 'Due Mar 8, 2025',
      patient: 'Sarah Mitchell',
      assignee: 'Dr. A. Nguyen',
      status: 'Requested',
      badgeW: 66,
      selected: false,
    },
  ];

  // Stack tasks sequentially: each task's title baseline sits blockGap below the
  // previous task's last line (and the first sits blockGap below the divider), so
  // the inter-task spacing and the divider-to-first-task spacing are identical.
  let baseline = dividerY;
  const layout = tasks.map((t) => {
    const lines = t.due ? 4 : 3; // title, [due], for, assigned
    const titleY = baseline + blockGap;
    const blockH = (lines - 1) * lineGap;
    baseline = titleY + blockH;
    return { titleY, blockH };
  });

  return (
    <svg
      className={styles.bentoPreviewCard}
      viewBox="0 0 300 300"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="0" y="0" width="300" height="300" fill={CAP.bg} />

      <text x={padX} y="32" fontFamily={f} fontSize="16" fontWeight="700" fill={CAP.fg}>
        My Tasks
      </text>
      <line x1={padX} y1={dividerY} x2={300 - padX} y2={dividerY} stroke={CAP.grid} strokeWidth="1.5" />

      {tasks.map((t, i) => {
        const textX = padX + 8;
        const { titleY, blockH } = layout[i];
        const badgeX = 300 - padX - badgeInset - t.badgeW;
        const badgeY = titleY - 13;
        const dueY = t.due ? titleY + lineGap : titleY;
        const forY = t.due ? titleY + lineGap * 2 : titleY + lineGap;
        const assignY = forY + lineGap;

        return (
          <g key={t.title}>
            {t.selected && (
              <rect x={padX} y={titleY - 20} width={300 - padX * 2} height={blockH + 30} rx="8" fill={CAP.highlight} />
            )}
            <text x={textX} y={titleY} fontFamily={f} fontSize="12" fontWeight="700" fill={CAP.fg}>
              {t.title}
            </text>
            <rect x={badgeX} y={badgeY} width={t.badgeW} height={badgeH} rx="9" fill={CAP.badgeBg} />
            <text
              x={badgeX + t.badgeW / 2}
              y={badgeY + badgeH / 2}
              fontFamily={f}
              fontSize="9"
              fontWeight="600"
              fill={CAP.badgeFg}
              textAnchor="middle"
              dominantBaseline="central"
            >
              {t.status}
            </text>
            {t.due && (
              <text x={textX} y={dueY} fontFamily={f} fontSize="10" fontWeight="500" fill={CAP.muted}>
                {t.due}
              </text>
            )}
            <text x={textX} y={forY} fontFamily={f} fontSize="10" fill={CAP.muted}>
              For: {t.patient}
            </text>
            <text x={textX} y={assignY} fontFamily={f} fontSize="10" fill={CAP.muted}>
              Assigned to {t.assignee}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function MessagingPreview(): JSX.Element {
  const f = 'system-ui,-apple-system,sans-serif';

  const fontSize = 11.5;
  const padX = 13; // horizontal padding inside each bubble
  const charW = 5.4; // fallback advance-width estimate until the text is measured on the client
  const leftX = 20; // left edge of incoming bubbles / left text anchor
  const rightX = 280; // right edge of outgoing bubbles / right text anchor

  const msgs = [
    { top: 58, text: 'Hi — question about my Rx', out: false },
    { top: 102, text: 'Sure, how can I help?', out: true },
    { top: 146, text: 'Can I get a refill on Lisinopril?', out: false },
    { top: 190, text: 'Done! Sent to your pharmacy.', out: true },
  ];

  // The bubble rects hug the text: measure each label's real rendered width once
  // mounted (a char-count estimate can't account for narrow glyphs like i, l, spaces).
  // Text anchors are fixed (incoming left, outgoing right), so only the rects resize.
  const textRefs = useRef<(SVGTextElement | null)[]>([]);
  const [textWidths, setTextWidths] = useState<number[]>([]);
  useEffect(() => {
    setTextWidths(textRefs.current.map((el) => el?.getComputedTextLength() ?? 0));
  }, []);

  return (
    <svg
      className={styles.bentoPreviewCard}
      viewBox="0 0 300 300"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="0" y="0" width="300" height="300" fill={CAP.bg} />

      <text x="20" y="32" fontFamily={f} fontSize="16" fontWeight="700" fill={CAP.fg}>
        Messages
      </text>
      <line x1="20" y1="46" x2="280" y2="46" stroke={CAP.grid} strokeWidth="1.5" />

      {msgs.map((m, i) => {
        const textW = textWidths[i] || m.text.length * charW;
        const w = textW + padX * 2;
        const bubbleX = m.out ? rightX - w : leftX;
        const anchorX = m.out ? rightX - padX : leftX + padX;
        return (
          <g key={m.text}>
            <rect x={bubbleX} y={m.top} width={w} height="30" rx="12" fill={m.out ? CAP.blue : CAP.bubble} />
            <text
              ref={(el) => {
                textRefs.current[i] = el;
              }}
              x={anchorX}
              y={m.top + 20}
              fontFamily={f}
              fontSize={fontSize}
              fill={m.out ? CAP.onAccent : CAP.fg}
              textAnchor={m.out ? 'end' : 'start'}
            >
              {m.text}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function BillingPreview(): JSX.Element {
  const f = 'system-ui,-apple-system,sans-serif';

  const items = [
    { y: 88, label: 'Office Visit (99213)', amount: '$120.00' },
    { y: 116, label: 'Lab — Lipid Panel', amount: '$45.00' },
    { y: 144, label: 'ECG (93000)', amount: '$80.00' },
  ];

  return (
    <svg
      className={styles.bentoPreviewCard}
      viewBox="0 0 300 300"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="0" y="0" width="300" height="300" fill={CAP.bg} />

      {/* Header + status badge */}
      <text x="20" y="32" fontFamily={f} fontSize="16" fontWeight="700" fill={CAP.fg}>
        Claim Summary
      </text>
      <rect x="210" y="18" width="70" height="20" rx="10" fill={CAP.pillBg} />
      <text x="245" y="32" fontFamily={f} fontSize="9.5" fontWeight="600" fill={CAP.accent} textAnchor="middle">
        Submitted
      </text>
      <text x="20" y="52" fontFamily={f} fontSize="10" fill={CAP.muted}>
        Claim #CLM-1043 · Mar 1, 2025
      </text>
      <line x1="20" y1="64" x2="280" y2="64" stroke={CAP.grid} strokeWidth="1.5" />

      {/* Line items */}
      {items.map((it) => (
        <g key={it.label}>
          <text x="20" y={it.y} fontFamily={f} fontSize="11.5" fill={CAP.body}>
            {it.label}
          </text>
          <text x="280" y={it.y} fontFamily={f} fontSize="11.5" fill={CAP.fg} textAnchor="end">
            {it.amount}
          </text>
        </g>
      ))}

      {/* Totals */}
      <line x1="20" y1="162" x2="280" y2="162" stroke={CAP.grid} strokeWidth="1.5" />
      <text x="20" y="188" fontFamily={f} fontSize="12" fontWeight="700" fill={CAP.fg}>
        Total billed
      </text>
      <text x="280" y="188" fontFamily={f} fontSize="12" fontWeight="700" fill={CAP.fg} textAnchor="end">
        $245.00
      </text>
      <text x="20" y="214" fontFamily={f} fontSize="11.5" fill={CAP.body}>
        Patient owes
      </text>
      <text x="280" y="214" fontFamily={f} fontSize="12" fontWeight="700" fill={CAP.accent} textAnchor="end">
        $49.00
      </text>
    </svg>
  );
}

export const CAPABILITY_PREVIEWS: Record<string, () => JSX.Element> = {
  'Intake & Registration': IntakeFormPreview,
  Scheduling: SchedulingPreview,
  Charting: ChartingPreview,
  'Diagnostic Orders': DiagnosticOrdersPreview,
  Medications: MedicationsPreview,
  'Care Coordination': CareCoordinationPreview,
  'Messaging & Communications': MessagingPreview,
  'Billing & Payments': BillingPreview,
};
