// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  IconAntenna,
  IconBolt,
  IconBuildingCommunity,
  IconBuildingHospital,
  IconCheck,
  IconChevronDown,
  IconCloud,
  IconComponents,
  IconDatabase,
  IconHistory,
  IconLock,
  IconMinus,
  IconRobot,
  IconSearch,
  IconShieldLock,
  IconUser,
} from '@tabler/icons-react';
import clsx from 'clsx';
import type { JSX } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FOUNDATIONS } from '../../data/products-content';
import styles from './ProductsFoundationsCarousel.module.css';
import { ProductsSectionHeader } from './ProductsSectionHeader';

const AUTO_ADVANCE_MS = 5000;

function getInitials(input: string): string {
  const words = input.split(' ').filter(Boolean);
  if (words.length > 1) {
    return (words[0][0] + (words.at(-1)?.at(0) ?? '')).toUpperCase();
  }
  if (words.length === 1) {
    return words[0][0].toUpperCase();
  }
  return '';
}

/* FHIR Data Store & API — layered composition: dark FHIR JSON behind a clean search UI.
   Mirrors /docs/search/basic-search and the Bundle response shape. */
const FHIR_SEARCH_RESULTS = [
  { name: 'Homer Simpson', status: 'Active' },
  { name: 'Marge Simpson', status: 'Active' },
  { name: 'Bart Simpson', status: 'Active' },
];

/* SNOMED ValueSet/$expand — hosted terminology search on the same store. */
const SNOMED_EXPAND_RESULTS = [
  { code: '73211009', display: 'Diabetes mellitus' },
  { code: '44054006', display: 'Type 2 diabetes mellitus' },
  { code: '46635009', display: 'Type 1 diabetes mellitus' },
  { code: '237599002', display: 'Insulin treated type 2 diabetes mellitus' },
  { code: '190372001', display: 'Pre-diabetes' },
];

function FhirDatastoreExample(): JSX.Element {
  return (
    <div className={styles.stage} aria-hidden>
      {/* Background: FHIR resource JSON in a dark code panel. */}
      <div className={styles.codePanel}>
        <div className={styles.panelBar}>
          <span className={styles.panelDot} />
          <span className={styles.panelDot} />
          <span className={styles.panelDot} />
          <span className={styles.panelFile}>Bundle.json</span>
        </div>
        {/* The code body is a crisp SVG asset rather than hand-tokenized spans. Only the body is
            imaged — the panel chrome + background stay HTML so the dark-mode background shift still
            applies. Padding is baked into the SVG coordinates. Same pattern for every panel below. */}
        <img className={styles.panelBodyImage} src="/img/products/foundations/bundle-json.svg" alt="" aria-hidden />
      </div>

      {/* Foreground: REST search UI card floating over the code. */}
      <div className={clsx(styles.floatCard, styles.fhirFloatMain)}>
        <div className={styles.floatHead}>
          <span className={styles.floatIcon}>
            <IconDatabase size={15} stroke={1.75} aria-hidden />
          </span>
          <div className={styles.floatQuery}>
            <span className={styles.floatMethod}>GET</span>
            <span className={styles.floatPath}>/fhir/R4/Patient?name=Simpson</span>
          </div>
        </div>

        <div className={styles.floatSectionLabel}>3 Results</div>
        <div className={styles.floatResults}>
          {FHIR_SEARCH_RESULTS.map((patient) => (
            <div key={patient.name} className={styles.floatRow}>
              <span className={styles.floatAvatar}>{getInitials(patient.name)}</span>
              <span className={styles.floatName}>{patient.name}</span>
              <span className={styles.floatStatus}>{patient.status}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Third layer: SNOMED ValueSet expand — overlaps patient card only. */}
      <div className={clsx(styles.floatCard, styles.floatCardAlt)}>
        <div className={styles.floatHead}>
          <span className={styles.floatIcon}>
            <IconSearch size={15} stroke={1.75} aria-hidden />
          </span>
          <div className={styles.floatQuery}>
            <span className={styles.floatMethod}>GET</span>
            <span className={styles.altPath}>/fhir/R4/ValueSet/$expand?filter=diabetes</span>
          </div>
        </div>

        <div className={styles.floatSectionLabel}>5 Results</div>
        <div className={styles.floatResults}>
          {SNOMED_EXPAND_RESULTS.map((concept) => (
            <div key={concept.code} className={styles.altRow}>
              <span className={styles.altDisplay}>{concept.display}</span>
              <div className={styles.altMeta}>
                <span className={styles.altBadge}>SNOMED</span>
                <span className={styles.altCode}>{concept.code}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* TypeScript / JavaScript SDK — layered composition: a MedplumClient snippet in a dark
   code panel, with the typed data those calls return rendered in the card floating over
   it. Mirrors /docs/sdk/core.medplumclient (readResource + searchResources). */
const SDK_OBSERVATIONS = [
  { name: 'Blood Pressure', value: '118/76 mmHg' },
  { name: 'Heart Rate', value: '72 bpm' },
  { name: 'Body Temperature', value: '98.6 °F' },
];

function SdkCodeExample(): JSX.Element {
  return (
    <div className={styles.stage} aria-hidden>
      {/* Background: the MedplumClient code that produces the data. */}
      <div className={styles.codePanel}>
        <div className={styles.panelBar}>
          <span className={styles.panelDot} />
          <span className={styles.panelDot} />
          <span className={styles.panelDot} />
          <span className={styles.panelFile}>app.ts</span>
        </div>
        <img className={styles.panelBodyImage} src="/img/products/foundations/app-ts.svg" alt="" aria-hidden />
      </div>

      {/* Foreground: the typed Patient + Observations those calls resolve to. */}
      <div className={clsx(styles.floatCard, styles.sdkFloat)}>
        <div className={styles.floatHead}>
          <span className={styles.floatIcon}>
            <IconUser size={15} stroke={1.75} aria-hidden />
          </span>
          <span className={styles.floatName}>Homer Simpson</span>
          <span className={styles.floatTag}>Patient</span>
        </div>

        <div className={styles.floatSectionLabel}>Observations · 3</div>
        <div className={styles.floatResults}>
          {SDK_OBSERVATIONS.map((obs) => (
            <div key={obs.name} className={styles.obsRow}>
              <span className={styles.obsName}>{obs.name}</span>
              <span className={styles.obsValue}>{obs.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* Medplum Component Library — layered composition: the JSX that renders a component in a
   dark code panel, with the live component floating over it. Mirrors @medplum/react's
   SearchControl (browsable in Storybook). */
const LIB_COMPONENTS = ['ResourceForm', 'SearchControl', 'ResourceTable', 'Timeline'];
const LIB_ROWS = [
  { name: 'Homer Simpson', status: 'Active' },
  { name: 'Marge Simpson', status: 'Active' },
  { name: 'Bart Simpson', status: 'Draft' },
];

function ComponentLibraryExample(): JSX.Element {
  return (
    <div className={styles.stage} aria-hidden>
      {/* Background: the JSX that renders the component. */}
      <div className={styles.codePanel}>
        <div className={styles.panelBar}>
          <span className={styles.panelDot} />
          <span className={styles.panelDot} />
          <span className={styles.panelDot} />
          <span className={styles.panelFile}>App.tsx</span>
        </div>
        <img className={styles.panelBodyImage} src="/img/products/foundations/app-tsx.svg" alt="" aria-hidden />
      </div>

      {/* Foreground: the live SearchControl the JSX renders. */}
      <div className={clsx(styles.floatCard, styles.libFloat)}>
        <div className={styles.floatHead}>
          <span className={styles.floatIcon}>
            <IconComponents size={15} stroke={1.75} aria-hidden />
          </span>
          <span className={styles.floatName}>SearchControl</span>
          <span className={styles.floatTag}>@medplum/react</span>
        </div>

        <div className={styles.libTabs}>
          {LIB_COMPONENTS.map((component) => (
            <span key={component} className={clsx(styles.libTab, component === 'SearchControl' && styles.libTabActive)}>
              {component}
            </span>
          ))}
        </div>

        <div className={styles.libFloatBody}>
          <div className={styles.libSearch}>
            <IconSearch size={13} stroke={2} aria-hidden />
            <span>name=Simpson</span>
          </div>
          <div className={styles.libTable}>
            <div className={styles.libTableHead}>
              <span>Name</span>
              <span>Status</span>
            </div>
            {LIB_ROWS.map((row) => (
              <div key={row.name} className={styles.libRow}>
                <span className={styles.libName}>{row.name}</span>
                <span className={clsx(styles.libPill, row.status === 'Draft' && styles.libPillMuted)}>
                  {row.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* Bots — a workflow-automation log: each row is a trigger → action, with timings and an
   error trace. Triggers mirror the MD scenarios (new patient → welcome message, lab
   result → partner push). */
const BOT_RUNS = [
  { trigger: 'Patient.created', action: 'send-welcome-message', status: 'ok', time: '142ms' },
  { trigger: 'DiagnosticReport.created', action: 'partner-push', status: 'ok', time: '208ms' },
  { trigger: 'Coverage.updated', action: 'check-eligibility', status: 'error', time: '—' },
];

function BotsExample(): JSX.Element {
  return (
    <div className={styles.stage} aria-hidden>
      {/* Background: the bot handler that runs on a resource change. */}
      <div className={styles.codePanel}>
        <div className={styles.panelBar}>
          <span className={styles.panelDot} />
          <span className={styles.panelDot} />
          <span className={styles.panelDot} />
          <span className={styles.panelFile}>welcome-bot.ts</span>
        </div>
        <img className={styles.panelBodyImage} src="/img/products/foundations/welcome-bot-ts.svg" alt="" aria-hidden />
      </div>

      {/* Foreground: the automation log — each row is a trigger → action. */}
      <div className={clsx(styles.floatCard, styles.botsFloat)}>
        <div className={styles.rowHead}>
          <span className={styles.rowHeadIcon}>
            <IconRobot size={16} stroke={1.75} aria-hidden />
          </span>
          <span className={styles.rowHeadTitle}>Bot automations</span>
          <span className={styles.rowHeadTag}>on resource change</span>
        </div>
        <div className={styles.rowList}>
          {BOT_RUNS.map((run) => (
            <div key={run.action} className={styles.botRun}>
              <span className={styles.codeBadge}>{run.trigger}</span>
              <span className={styles.botArrow}>→</span>
              <span className={styles.botAction}>{run.action}</span>
              {run.status === 'ok' ? (
                <span className={styles.statusOk}>✓ {run.time}</span>
              ) : (
                <span className={styles.statusErr}>✕ error</span>
              )}
            </div>
          ))}
          <div className={styles.botTrace}>EligibilityError: payer did not respond · retry 2/3</div>
        </div>
      </div>
    </div>
  );
}

/* Subscriptions — a live dashboard: new lab results, messages, and status changes stream
   in real-time (no refresh, no polling), per the MD scenario. */
const SUB_EVENTS = [
  { type: 'DiagnosticReport', desc: 'CBC panel — ready', time: 'just now' },
  { type: 'Communication', desc: 'New message from patient', time: '2s ago' },
  { type: 'Observation', desc: 'Glucose → final', time: '5s ago' },
  { type: 'Task', desc: 'Follow-up — completed', time: '9s ago' },
];

function SubscriptionsExample(): JSX.Element {
  return (
    <div className={styles.stage} aria-hidden>
      {/* Background: the Subscription resource that defines the criteria + channel. */}
      <div className={styles.codePanel}>
        <div className={styles.panelBar}>
          <span className={styles.panelDot} />
          <span className={styles.panelDot} />
          <span className={styles.panelDot} />
          <span className={styles.panelFile}>Subscription.json</span>
        </div>
        <img
          className={styles.panelBodyImage}
          src="/img/products/foundations/subscription-json.svg"
          alt=""
          aria-hidden
        />
      </div>

      {/* Foreground: the live dashboard — events stream in as resources change. */}
      <div className={clsx(styles.floatCard, styles.subsFloat)}>
        <div className={styles.rowHead}>
          <span className={styles.rowHeadIcon}>
            <IconBolt size={16} stroke={1.75} aria-hidden />
          </span>
          <span className={styles.rowHeadTitle}>Live activity</span>
          <span className={styles.subLive}>
            <span className={styles.subLiveDot} />
            LIVE
          </span>
        </div>
        <div className={styles.rowList}>
          {SUB_EVENTS.map((event) => (
            <div key={event.type + event.time} className={styles.subEvent}>
              <span className={styles.subType}>{event.type}</span>
              <span className={styles.subDesc}>{event.desc}</span>
              <span className={styles.subTime}>{event.time}</span>
            </div>
          ))}
        </div>
        <div className={styles.subFoot}>
          <span className={styles.subLiveDot} />
          <span className={styles.subFootNote}>Streaming over WebSocket — no polling</span>
        </div>
      </div>
    </div>
  );
}

/* Medplum Bridge — layered composition: a raw HL7v2 ADT message in the dark code panel
   (the legacy format arriving on-prem), with a connection diagram floating over it —
   on-prem tunneling to the cloud over an encrypted link, with message flow and delivery
   confirmation. Mirrors /docs/agent (HL7v2 / DICOM tunneled to the cloud). */
const BRIDGE_MESSAGES = [
  { type: 'ADT^A01', desc: 'Admit — Homer Simpson' },
  { type: 'ORU^R01', desc: 'Lab result — CBC panel' },
  { type: 'DICOM', desc: 'Imaging study — CT chest' },
];

function BridgeExample(): JSX.Element {
  return (
    <div className={styles.stage} aria-hidden>
      {/* Background: a raw HL7v2 ADT^A01 message from an on-prem system. */}
      <div className={styles.codePanel}>
        <div className={styles.panelBar}>
          <span className={styles.panelDot} />
          <span className={styles.panelDot} />
          <span className={styles.panelDot} />
          <span className={styles.panelFile}>ADT^A01.hl7</span>
        </div>
        <img className={styles.panelBodyImage} src="/img/products/foundations/adt-a01-hl7.svg" alt="" aria-hidden />
      </div>

      {/* Foreground: a connection diagram — on-prem tunnels to the cloud, with the
          message flow and delivery confirmation below. */}
      <div className={clsx(styles.floatCard, styles.bridgeFloat)}>
        <div className={styles.rowHead}>
          <span className={styles.rowHeadIcon}>
            <IconAntenna size={16} stroke={1.75} aria-hidden />
          </span>
          <span className={styles.rowHeadTitle}>Medplum Bridge</span>
          <span className={styles.floatStatus}>Connected</span>
        </div>

        <div className={styles.bridgeDiagram}>
          <div className={styles.bridgeNodeBox}>
            <span className={styles.bridgeNodeIcon}>
              <IconBuildingHospital size={20} stroke={1.75} aria-hidden />
            </span>
            <span className={styles.bridgeNodeLabel}>On-prem</span>
            <span className={styles.bridgeNodeSub}>MERCY</span>
          </div>
          <div className={styles.bridgeLink}>
            <span className={styles.bridgeFlowDot} />
            <span className={styles.bridgeLock}>
              <IconLock size={11} stroke={2} aria-hidden />
              encrypted
            </span>
          </div>
          <div className={styles.bridgeNodeBox}>
            <span className={styles.bridgeNodeIcon}>
              <IconCloud size={20} stroke={1.75} aria-hidden />
            </span>
            <span className={styles.bridgeNodeLabel}>Cloud</span>
            <span className={styles.bridgeNodeSub}>Medplum</span>
          </div>
        </div>

        <div className={styles.floatSectionLabel}>Message flow</div>
        <div className={styles.floatResults}>
          {BRIDGE_MESSAGES.map((message) => (
            <div key={message.type} className={styles.bridgeMsg}>
              <span className={styles.codeBadge}>{message.type}</span>
              <span className={styles.bridgeMsgDesc}>{message.desc}</span>
              <span className={styles.statusOk}>✓ delivered</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* Medplum Auth — a sign-in screen (routing through Medplum's IdP or your SSO, with an
   MFA prompt) over the signInWithRedirect code. Mirrors /docs/auth. */
function AuthExample(): JSX.Element {
  return (
    <div className={styles.stage} aria-hidden>
      {/* Background: the auth code that drives the sign-in flow. */}
      <div className={styles.codePanel}>
        <div className={styles.panelBar}>
          <span className={styles.panelDot} />
          <span className={styles.panelDot} />
          <span className={styles.panelDot} />
          <span className={styles.panelFile}>auth.ts</span>
        </div>
        <img className={styles.panelBodyImage} src="/img/products/foundations/auth-ts.svg" alt="" aria-hidden />
      </div>

      {/* Foreground: the rendered sign-in screen. */}
      <div className={clsx(styles.floatCard, styles.authFloat)}>
        <div className={styles.floatHead}>
          <span className={styles.floatIcon}>
            <IconLock size={15} stroke={1.75} aria-hidden />
          </span>
          <span className={styles.floatName}>Sign in to Medplum</span>
        </div>
        <div className={styles.authBody}>
          <div className={styles.authField}>
            <span className={styles.authLabel}>Email</span>
            <span className={styles.authInput}>dr.nguyen@clinic.org</span>
          </div>
          <div className={styles.authField}>
            <span className={styles.authLabel}>Password</span>
            <span className={styles.authInput}>••••••••••</span>
          </div>
          <span className={styles.authPrimary}>Continue</span>
          <div className={styles.authDivider}>
            <span className={styles.authRule} />
            or
            <span className={styles.authRule} />
          </div>
          <span className={styles.authSso}>Continue with SSO</span>
          <div className={styles.authMfa}>
            <IconShieldLock size={13} stroke={1.75} aria-hidden />
            MFA code sent to •••• 4823
          </div>
        </div>
      </div>
    </div>
  );
}

/* Access Control — a read/write matrix over the AccessPolicy resource that defines it.
   Mirrors /docs/access/access-policies. */
const AC_MATRIX = [
  { resource: 'Patient', read: true, write: false },
  { resource: 'Appointment', read: true, write: true },
  { resource: 'Observation', read: true, write: true },
  { resource: 'Bot', read: true, write: false },
];

function AccessControlExample(): JSX.Element {
  return (
    <div className={styles.stage} aria-hidden>
      {/* Background: the AccessPolicy resource. */}
      <div className={styles.codePanel}>
        <div className={styles.panelBar}>
          <span className={styles.panelDot} />
          <span className={styles.panelDot} />
          <span className={styles.panelDot} />
          <span className={styles.panelFile}>AccessPolicy.json</span>
        </div>
        <img
          className={styles.panelBodyImage}
          src="/img/products/foundations/accesspolicy-json.svg"
          alt=""
          aria-hidden
        />
      </div>

      {/* Foreground: the permissions matrix that policy produces. */}
      <div className={clsx(styles.floatCard, styles.acFloat)}>
        <div className={styles.floatHead}>
          <span className={styles.floatIcon}>
            <IconShieldLock size={15} stroke={1.75} aria-hidden />
          </span>
          <span className={styles.floatName}>Access policy</span>
          <span className={styles.floatTag}>Front Desk</span>
        </div>
        <div className={styles.acHead}>
          <span>Resource</span>
          <span>Read</span>
          <span>Write</span>
        </div>
        {AC_MATRIX.map((row) => (
          <div key={row.resource} className={styles.acRow}>
            <span className={styles.acRes}>{row.resource}</span>
            <span className={styles.acCell}>
              {row.read ? (
                <IconCheck size={15} stroke={2.5} className={styles.acAllow} aria-hidden />
              ) : (
                <IconMinus size={14} stroke={2} className={styles.acDeny} aria-hidden />
              )}
            </span>
            <span className={styles.acCell}>
              {row.write ? (
                <IconCheck size={15} stroke={2.5} className={styles.acAllow} aria-hidden />
              ) : (
                <IconMinus size={14} stroke={2} className={styles.acDeny} aria-hidden />
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* Multi-Tenancy — a project switcher over the Project resource. Each project is a fully
   isolated tenant on one deployment. Mirrors /docs/access/projects. */
const TENANTS = [
  { name: 'Northwind Clinic', env: 'Production', active: true },
  { name: 'Southshore Health', env: 'Production', active: false },
  { name: 'Northwind', env: 'Staging', active: false },
  { name: 'Sandbox', env: 'Dev', active: false },
];

function MultiTenancyExample(): JSX.Element {
  return (
    <div className={styles.stage} aria-hidden>
      {/* Background: the Project resource that defines a tenant. */}
      <div className={styles.codePanel}>
        <div className={styles.panelBar}>
          <span className={styles.panelDot} />
          <span className={styles.panelDot} />
          <span className={styles.panelDot} />
          <span className={styles.panelFile}>Project.json</span>
        </div>
        <img className={styles.panelBodyImage} src="/img/products/foundations/project-json.svg" alt="" aria-hidden />
      </div>

      {/* Foreground: the project switcher — isolated tenants on one deployment. */}
      <div className={clsx(styles.floatCard, styles.tenantFloat)}>
        <div className={styles.floatHead}>
          <span className={styles.floatIcon}>
            <IconBuildingCommunity size={15} stroke={1.75} aria-hidden />
          </span>
          <span className={styles.floatName}>Switch project</span>
          <IconChevronDown size={15} stroke={2} aria-hidden />
        </div>
        <div className={styles.tenantMenu}>
          {TENANTS.map((tenant) => (
            <div key={tenant.name} className={clsx(styles.tenantRow, tenant.active && styles.tenantRowActive)}>
              <span className={styles.tenantIcon}>
                <IconBuildingCommunity size={14} stroke={1.75} aria-hidden />
              </span>
              <span className={styles.tenantName}>{tenant.name}</span>
              <span className={styles.tenantEnv}>{tenant.env}</span>
              {tenant.active && (
                <span className={styles.tenantCheck}>
                  <IconCheck size={15} stroke={2.5} aria-hidden />
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* Audit Logging — a searchable, timestamped log over the AuditEvent resource each action
   records. Mirrors /docs/api/fhir/resources/auditevent. */
const AUDIT_ENTRIES = [
  { action: 'viewed', cls: 'auditView', actor: 'Dr. Nguyen', target: 'Patient/Homer Simpson', time: '09:42' },
  { action: 'updated', cls: 'auditUpdate', actor: 'j.torres', target: 'Observation/bp', time: '09:41' },
  { action: 'created', cls: 'auditCreate', actor: 'a.patel', target: 'Communication', time: '09:40' },
  { action: 'login', cls: 'auditLogin', actor: 'Dr. Nguyen', target: 'session', time: '09:38' },
];

function AuditLoggingExample(): JSX.Element {
  return (
    <div className={styles.stage} aria-hidden>
      {/* Background: the AuditEvent resource written for every action. */}
      <div className={styles.codePanel}>
        <div className={styles.panelBar}>
          <span className={styles.panelDot} />
          <span className={styles.panelDot} />
          <span className={styles.panelDot} />
          <span className={styles.panelFile}>AuditEvent.json</span>
        </div>
        <img className={styles.panelBodyImage} src="/img/products/foundations/auditevent-json.svg" alt="" aria-hidden />
      </div>

      {/* Foreground: the searchable audit trail those events form. */}
      <div className={clsx(styles.floatCard, styles.auditFloat)}>
        <div className={styles.floatHead}>
          <span className={styles.floatIcon}>
            <IconHistory size={15} stroke={1.75} aria-hidden />
          </span>
          <span className={styles.floatName}>Audit log</span>
          <span className={styles.floatTag}>Exportable</span>
        </div>
        <div className={styles.auditSearch}>
          <IconSearch size={13} stroke={2} aria-hidden />
          <span>patient=Homer Simpson</span>
        </div>
        <div className={styles.floatResults}>
          {AUDIT_ENTRIES.map((entry) => (
            <div key={entry.time + entry.actor} className={styles.auditRow}>
              <span className={clsx(styles.auditAction, styles[entry.cls])}>{entry.action}</span>
              <span className={styles.auditText}>
                <span className={styles.auditActor}>{entry.actor}</span> ·{' '}
                <span className={styles.auditTarget}>{entry.target}</span>
              </span>
              <span className={styles.auditTime}>{entry.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* Keyed by foundation name; foundations without media fall back to the empty stage. */
const FOUNDATION_MEDIA: Record<string, JSX.Element> = {
  'FHIR Data Store & API': <FhirDatastoreExample />,
  'TypeScript / JavaScript SDK': <SdkCodeExample />,
  'Medplum Component Library': <ComponentLibraryExample />,
  Bots: <BotsExample />,
  Subscriptions: <SubscriptionsExample />,
  'Medplum Bridge': <BridgeExample />,
  'Medplum Auth': <AuthExample />,
  'Access Control': <AccessControlExample />,
  'Multi-Tenancy': <MultiTenancyExample />,
  'Audit Logging': <AuditLoggingExample />,
};

export function ProductsFoundationsCarousel(): JSX.Element {
  /* First foundation is auto-selected; the timer fill auto-advances through the list. */
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  /* displayedIndex trails activeIndex: the current media fades out before the next fades in. */
  const [displayedIndex, setDisplayedIndex] = useState(0);
  const [isExiting, setIsExiting] = useState(false);
  const active = FOUNDATIONS[activeIndex];
  const displayed = FOUNDATIONS[displayedIndex];

  /* Measure each body so the expand can animate max-height (same technique as SolutionAccordion). */
  const bodyRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [bodyHeights, setBodyHeights] = useState<number[]>([]);

  useEffect(() => {
    const measureHeights = (): void => {
      setBodyHeights(bodyRefs.current.map((node) => node?.scrollHeight ?? 0));
    };

    measureHeights();
    window.addEventListener('resize', measureHeights);
    return () => window.removeEventListener('resize', measureHeights);
  }, []);

  // Selection changed: fade the current media out first (unless reduced motion, then swap instantly).
  useEffect(() => {
    if (activeIndex === displayedIndex) {
      return;
    }
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      setDisplayedIndex(activeIndex);
      setIsExiting(false);
      return;
    }
    setIsExiting(true);
  }, [activeIndex, displayedIndex]);

  // Fires for both fade-in and fade-out; swap to the next media only after the fade-out finishes.
  const handleMediaAnimationEnd = useCallback(() => {
    if (isExiting) {
      setDisplayedIndex(activeIndex);
      setIsExiting(false);
    }
  }, [isExiting, activeIndex]);

  // User interaction: kill the auto-advance timer and lock the selected foundation.
  const handleSelect = useCallback((index: number) => {
    setIsPaused(true);
    setActiveIndex(index);
  }, []);

  // Timer fill reached the far right — advance to the next foundation and loop.
  const handleProgressEnd = useCallback(() => {
    setActiveIndex((prev) => (prev + 1) % FOUNDATIONS.length);
  }, []);

  return (
    <div className={styles.section}>
      <ProductsSectionHeader headline="Build on the strongest foundations in healthcare">
        The building blocks that make everything else possible, all sharing one FHIR data model. These power the
        capabilities and apps across the Medplum platform.
      </ProductsSectionHeader>

      <div className={styles.carousel}>
        <ul className={styles.list} role="tablist" aria-label="Foundations">
          {FOUNDATIONS.map((foundation, index) => {
            const isActive = index === activeIndex;
            return (
              <li key={foundation.name}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={clsx(styles.item, isActive && styles.itemActive)}
                  onClick={() => handleSelect(index)}
                >
                  <span className={styles.itemTitle}>{foundation.name}</span>
                  {isActive && (
                    <span
                      // Remount (and restart the timer fill) whenever the active item changes.
                      key={isPaused ? 'paused' : `play-${index}`}
                      className={clsx(styles.itemProgress, isPaused && styles.itemProgressFull)}
                      style={isPaused ? undefined : { animationDuration: `${AUTO_ADVANCE_MS}ms` }}
                      onAnimationEnd={isPaused ? undefined : handleProgressEnd}
                      aria-hidden
                    />
                  )}
                </button>

                {/* Description expands under the selected title — max-height animated to its measured height. */}
                <div
                  className={clsx(styles.itemBodyWrap, isActive && styles.itemBodyWrapOpen)}
                  style={{ maxHeight: isActive ? `${bodyHeights[index] ?? 0}px` : '0px' }}
                >
                  <div
                    className={styles.itemBodyInner}
                    ref={(node) => {
                      bodyRefs.current[index] = node;
                    }}
                  >
                    <p className={styles.itemBody}>{foundation.body}</p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <div className={styles.imageArea}>
          {/* Fades the displayed media out, then remounts (new key) to fade the next one in. */}
          <div
            key={displayedIndex}
            className={clsx(styles.mediaSwap, isExiting && styles.mediaSwapExiting)}
            onAnimationEnd={handleMediaAnimationEnd}
          >
            {FOUNDATION_MEDIA[displayed.name] ?? null}
          </div>
        </div>
      </div>
    </div>
  );
}
