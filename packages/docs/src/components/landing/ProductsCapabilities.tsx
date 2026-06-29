// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JSX } from 'react';
import { CAPABILITIES } from '../../data/products-content';
import styles from './ProductsCapabilities.module.css';

function IntakeFormPreview(): JSX.Element {
  const f = 'system-ui,-apple-system,sans-serif';
  const tc = '#212529';
  const border = '#dee2e6';
  const red = '#fa5252';

  return (
    <svg
      className={styles.bentoPreviewCard}
      viewBox="0 0 300 300"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="0" y="0" width="300" height="300" fill="white" fillOpacity="0.9" />

      {/* Demographics heading */}
      <text x="20" y="34" fontFamily={f} fontSize="16" fontWeight="700" fill={tc}>Demographics</text>

      {/* First Name * */}
      <text x="20" y="60" fontFamily={f} fontSize="12" fontWeight="500" fill={tc}>First Name</text>
      <text x="88" y="60" fontFamily={f} fontSize="12" fontWeight="500" fill={red}>*</text>
      <rect x="20" y="66" width="260" height="32" rx="4" fill="white" stroke={border} strokeWidth="1.5" />
      <text x="30" y="86" fontFamily={f} fontSize="13" fill={tc}>Sarah</text>

      {/* Middle Name */}
      <text x="20" y="122" fontFamily={f} fontSize="12" fontWeight="500" fill={tc}>Middle Name</text>
      <rect x="20" y="128" width="260" height="32" rx="4" fill="white" stroke={border} strokeWidth="1.5" />

      {/* Last Name * */}
      <text x="20" y="184" fontFamily={f} fontSize="12" fontWeight="500" fill={tc}>Last Name</text>
      <text x="80" y="184" fontFamily={f} fontSize="12" fontWeight="500" fill={red}>*</text>
      <rect x="20" y="190" width="260" height="32" rx="4" fill="white" stroke={border} strokeWidth="1.5" />
      <text x="30" y="210" fontFamily={f} fontSize="13" fill={tc}>Mitchell</text>

      {/* Date of Birth * */}
      <text x="20" y="246" fontFamily={f} fontSize="12" fontWeight="500" fill={tc}>Date of Birth</text>
      <text x="101" y="246" fontFamily={f} fontSize="12" fontWeight="500" fill={red}>*</text>
      <rect x="20" y="252" width="260" height="32" rx="4" fill="white" stroke={border} strokeWidth="1.5" />
      <text x="30" y="272" fontFamily={f} fontSize="13" fill={tc}>04/12/1988</text>
    </svg>
  );
}

function SchedulingPreview(): JSX.Element {
  const f = 'system-ui,-apple-system,sans-serif';
  const tc = '#212529';
  const muted = '#868e96';
  const grid = '#e9ecef';
  const segBg = '#f1f3f5';
  const segText = '#495057';
  const blue = '#228be6';

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
      <rect x="0" y="0" width="300" height="300" fill="white" fillOpacity="0.9" />

      {/* Month / Week / Day segmented control */}
      <rect x="96" y="12" width="150" height="26" rx="7" fill={segBg} />
      <rect x="149" y="15" width="44" height="20" rx="5" fill="white" />
      <text x="121" y="29" fontFamily={f} fontSize="11" fill={segText} textAnchor="middle">Month</text>
      <text x="171" y="29" fontFamily={f} fontSize="11" fontWeight="600" fill={tc} textAnchor="middle">Week</text>
      <text x="221" y="29" fontFamily={f} fontSize="11" fill={segText} textAnchor="middle">Day</text>

      {/* Grid frame: top border, two day columns + a time gutter */}
      <line x1="0" y1="54" x2="300" y2="54" stroke={grid} strokeWidth="1.5" />
      <line x1="34" y1="54" x2="34" y2="300" stroke={grid} strokeWidth="1.5" />
      <line x1="167" y1="54" x2="167" y2="300" stroke={grid} strokeWidth="1.5" />

      {/* Day headers */}
      <text x="100" y="74" fontFamily={f} fontSize="12" fontWeight="700" fill={tc} textAnchor="middle">01 Fri</text>
      <text x="233" y="74" fontFamily={f} fontSize="12" fontWeight="700" fill={tc} textAnchor="middle">02 Sat</text>
      <line x1="0" y1="86" x2="300" y2="86" stroke={grid} strokeWidth="1.5" />

      {/* Hour rows + gutter labels */}
      {hours.map((h) => (
        <g key={h.label}>
          <line x1="34" y1={h.y} x2="300" y2={h.y} stroke={grid} strokeWidth="1" />
          <text x="29" y={h.y + 4} fontFamily={f} fontSize="9" fill={muted} textAnchor="end">
            {h.label}
          </text>
        </g>
      ))}

      {/* Appointment block — aligned to the 10–11 AM slot; same patient as the intake form */}
      <rect x="40" y="158" width="120" height="36" rx="5" fill={blue} />
      <text x="48" y="174" fontFamily={f} fontSize="9" fill="white" fillOpacity="0.9">10:00 – 11:00 AM</text>
      <text x="48" y="189" fontFamily={f} fontSize="11" fontWeight="600" fill="white">Sarah Mitchell</text>
    </svg>
  );
}

// Per-capability illustration. Capabilities without an entry fall back to the placeholder.
const CAPABILITY_PREVIEWS: Record<string, () => JSX.Element> = {
  'Intake & Registration': IntakeFormPreview,
  Scheduling: SchedulingPreview,
  Charting: ChartingPreview,
  'Diagnostic Orders': DiagnosticOrdersPreview,
  Medications: MedicationsPreview,
  'Care Coordination': CareCoordinationPreview,
  'Messaging & Communications': MessagingPreview,
  'Billing & Payments': BillingPreview,
};

function ChartingPreview(): JSX.Element {
  const f = 'system-ui,-apple-system,sans-serif';
  const tc = '#212529';
  const body = '#495057';
  const muted = '#868e96';
  const grid = '#e9ecef';

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
      <rect x="0" y="0" width="300" height="300" fill="white" fillOpacity="0.9" />

      {/* Note header */}
      <text x="20" y="32" fontFamily={f} fontSize="16" fontWeight="700" fill={tc}>Progress Note</text>
      <text x="20" y="50" fontFamily={f} fontSize="10" fill={muted}>Dr. A. Nguyen · Mar 1, 2025</text>
      <line x1="20" y1="62" x2="280" y2="62" stroke={grid} strokeWidth="1.5" />

      {sections.map((s) => (
        <g key={s.label}>
          <text x="20" y={s.y} fontFamily={f} fontSize="11" fontWeight="700" fill={tc}>
            {s.label}
          </text>
          <text x="20" y={s.y + 16} fontFamily={f} fontSize="11" fill={body}>
            {s.text}
          </text>
        </g>
      ))}
    </svg>
  );
}

function DiagnosticOrdersPreview(): JSX.Element {
  const f = 'system-ui,-apple-system,sans-serif';
  const tc = '#212529';
  const grid = '#e9ecef';

  // Lab orders with Mantine-style status badges.
  const green = { bg: '#d3f9d8', fg: '#2f9e44' };
  const yellow = { bg: '#fff3bf', fg: '#f08c00' };
  const orders = [
    { top: 48, name: 'CBC with Differential', status: 'Final', tone: green },
    { top: 92, name: 'Lipid Panel', status: 'Final', tone: green },
    { top: 136, name: 'Hemoglobin A1c', status: 'Pending', tone: yellow },
    { top: 180, name: 'TSH, Serum', status: 'Pending', tone: yellow },
  ];

  return (
    <svg
      className={styles.bentoPreviewCard}
      viewBox="0 0 300 300"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="0" y="0" width="300" height="300" fill="white" fillOpacity="0.9" />

      <text x="20" y="32" fontFamily={f} fontSize="16" fontWeight="700" fill={tc}>Lab Orders</text>

      {orders.map((o) => {
        const pillW = o.status === 'Pending' ? 58 : 44;
        const pillX = 280 - pillW;
        return (
          <g key={o.name}>
            <line x1="20" y1={o.top} x2="280" y2={o.top} stroke={grid} strokeWidth="1.5" />
            <text x="20" y={o.top + 26} fontFamily={f} fontSize="12" fontWeight="600" fill={tc}>
              {o.name}
            </text>
            <rect x={pillX} y={o.top + 12} width={pillW} height="20" rx="10" fill={o.tone.bg} />
            <text
              x={pillX + pillW / 2}
              y={o.top + 26}
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
      <line x1="20" y1="224" x2="280" y2="224" stroke={grid} strokeWidth="1.5" />
    </svg>
  );
}

function MedicationsPreview(): JSX.Element {
  const f = 'system-ui,-apple-system,sans-serif';
  const tc = '#212529';
  const muted = '#868e96';
  const grid = '#e9ecef';
  const rxBg = '#e7f5ff';
  const rxFg = '#1971c2';

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
      <rect x="0" y="0" width="300" height="300" fill="white" fillOpacity="0.9" />

      <text x="20" y="32" fontFamily={f} fontSize="16" fontWeight="700" fill={tc}>Active Medications</text>

      {meds.map((m) => (
        <g key={m.name}>
          <line x1="20" y1={m.top} x2="280" y2={m.top} stroke={grid} strokeWidth="1.5" />
          <rect x="20" y={m.top + 15} width="26" height="26" rx="6" fill={rxBg} />
          <text x="33" y={m.top + 32} fontFamily={f} fontSize="12" fontWeight="700" fill={rxFg} textAnchor="middle">
            Rx
          </text>
          <text x="58" y={m.top + 26} fontFamily={f} fontSize="12" fontWeight="600" fill={tc}>
            {m.name}
          </text>
          <text x="58" y={m.top + 42} fontFamily={f} fontSize="10" fill={muted}>
            {m.sig}
          </text>
        </g>
      ))}
      <line x1="20" y1="216" x2="280" y2="216" stroke={grid} strokeWidth="1.5" />
    </svg>
  );
}

function CareCoordinationPreview(): JSX.Element {
  const f = 'system-ui,-apple-system,sans-serif';
  const tc = '#212529';
  const muted = '#868e96';
  const blue = '#228be6';
  const boxBorder = '#ced4da';

  const tasks = [
    { top: 52, label: 'Schedule follow-up visit', done: true, chip: null },
    { top: 96, label: 'Send referral to Cardiology', done: true, chip: null },
    { top: 140, label: 'Review lab results', done: false, chip: { text: 'Today', bg: '#ffe3e3', fg: '#e03131', w: 48 } },
    { top: 184, label: 'Call patient re: meds', done: false, chip: { text: 'Tomorrow', bg: '#e7f5ff', fg: '#1971c2', w: 66 } },
  ];

  return (
    <svg
      className={styles.bentoPreviewCard}
      viewBox="0 0 300 300"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="0" y="0" width="300" height="300" fill="white" fillOpacity="0.9" />

      <text x="20" y="32" fontFamily={f} fontSize="16" fontWeight="700" fill={tc}>Care Tasks</text>

      {tasks.map((t) => (
        <g key={t.label}>
          {t.done ? (
            <>
              <rect x="20" y={t.top} width="16" height="16" rx="4" fill={blue} />
              <path
                d={`M24 ${t.top + 8} L27 ${t.top + 11} L32 ${t.top + 4}`}
                stroke="white"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          ) : (
            <rect x="20" y={t.top} width="16" height="16" rx="4" fill="white" stroke={boxBorder} strokeWidth="1.5" />
          )}
          <text
            x="46"
            y={t.top + 13}
            fontFamily={f}
            fontSize="12"
            fill={t.done ? muted : tc}
            textDecoration={t.done ? 'line-through' : undefined}
          >
            {t.label}
          </text>
          {t.chip && (
            <>
              <rect x={280 - t.chip.w} y={t.top - 1} width={t.chip.w} height="18" rx="9" fill={t.chip.bg} />
              <text
                x={280 - t.chip.w / 2}
                y={t.top + 12}
                fontFamily={f}
                fontSize="9.5"
                fontWeight="600"
                fill={t.chip.fg}
                textAnchor="middle"
              >
                {t.chip.text}
              </text>
            </>
          )}
        </g>
      ))}
    </svg>
  );
}

function MessagingPreview(): JSX.Element {
  const f = 'system-ui,-apple-system,sans-serif';
  const tc = '#212529';
  const grayBubble = '#f1f3f5';
  const blue = '#228be6';

  const msgs = [
    { top: 50, w: 186, text: 'Hi — question about my Rx', out: false },
    { top: 94, w: 158, text: 'Sure, how can I help?', out: true },
    { top: 138, w: 232, text: 'Can I get a refill on Lisinopril?', out: false },
    { top: 182, w: 204, text: 'Done! Sent to your pharmacy.', out: true },
  ];

  return (
    <svg
      className={styles.bentoPreviewCard}
      viewBox="0 0 300 300"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="0" y="0" width="300" height="300" fill="white" fillOpacity="0.9" />

      <text x="20" y="32" fontFamily={f} fontSize="16" fontWeight="700" fill={tc}>Messages</text>

      {msgs.map((m) => {
        const x = m.out ? 280 - m.w : 20;
        return (
          <g key={m.text}>
            <rect x={x} y={m.top} width={m.w} height="30" rx="12" fill={m.out ? blue : grayBubble} />
            <text x={x + 14} y={m.top + 20} fontFamily={f} fontSize="11.5" fill={m.out ? 'white' : tc}>
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
  const tc = '#212529';
  const body = '#495057';
  const muted = '#868e96';
  const grid = '#e9ecef';
  const blue = '#1971c2';

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
      <rect x="0" y="0" width="300" height="300" fill="white" fillOpacity="0.9" />

      {/* Header + status badge */}
      <text x="20" y="32" fontFamily={f} fontSize="16" fontWeight="700" fill={tc}>Claim Summary</text>
      <rect x="210" y="18" width="70" height="20" rx="10" fill="#e7f5ff" />
      <text x="245" y="32" fontFamily={f} fontSize="9.5" fontWeight="600" fill={blue} textAnchor="middle">Submitted</text>
      <text x="20" y="52" fontFamily={f} fontSize="10" fill={muted}>Claim #CLM-1043 · Mar 1, 2025</text>
      <line x1="20" y1="64" x2="280" y2="64" stroke={grid} strokeWidth="1.5" />

      {/* Line items */}
      {items.map((it) => (
        <g key={it.label}>
          <text x="20" y={it.y} fontFamily={f} fontSize="11.5" fill={body}>
            {it.label}
          </text>
          <text x="280" y={it.y} fontFamily={f} fontSize="11.5" fill={tc} textAnchor="end">
            {it.amount}
          </text>
        </g>
      ))}

      {/* Totals */}
      <line x1="20" y1="162" x2="280" y2="162" stroke={grid} strokeWidth="1.5" />
      <text x="20" y="188" fontFamily={f} fontSize="12" fontWeight="700" fill={tc}>Total billed</text>
      <text x="280" y="188" fontFamily={f} fontSize="12" fontWeight="700" fill={tc} textAnchor="end">$245.00</text>
      <text x="20" y="214" fontFamily={f} fontSize="11.5" fill={body}>Patient owes</text>
      <text x="280" y="214" fontFamily={f} fontSize="12" fontWeight="700" fill={blue} textAnchor="end">$49.00</text>
    </svg>
  );
}

export function ProductsCapabilities(): JSX.Element {
  return (
    <div id="capabilities" className={styles.section}>
      {/* ---- header ---- */}
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionHeadline}>Combine our Capabilities for custom solutions.</h2>
        <p className={styles.sectionLead}>
          We&apos;ve solved the hard parts of clinical workflows for you—backed by first- and third-party integrations.
          Each Capability ships with a recommended data model, set of operations, and even UI components, but is still
          fully configurable for even your most unique workflows.
        </p>
      </div>

      {/* ---- bento grid ---- */}
      <div className={styles.bento}>
        {CAPABILITIES.map((cap) => {
          const Preview = CAPABILITY_PREVIEWS[cap.name];
          return (
            <div key={cap.name} className={styles.bentoCell}>
              <div className={styles.bentoText}>
                <h3 className={styles.bentoName}>{cap.name}</h3>
                <p className={styles.bentoShort}>{cap.short}</p>
              </div>
              {Preview ? (
                <div className={styles.bentoImageClip}>
                  <Preview />
                </div>
              ) : (
                <div className={styles.bentoPlaceholder}>
                  <span className={styles.placeholderChip}>placeholder</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
