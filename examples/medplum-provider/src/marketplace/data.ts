// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import {
  IconApps,
  IconBrain,
  IconChartBar,
  IconChartLine,
  IconUsersGroup,
  IconDatabase,
  IconLayout,
  IconPackages,
  IconRobot,
  IconVideo,
} from '@tabler/icons-react';
import type { Collection, MarketplaceListing, Vendor } from './types';

// ─── Vendors ────────────────────────────────────────────────────────────────

export const vendors: Record<string, Vendor> = {
  'apex-health': {
    id: 'apex-health',
    name: 'Apex Health Systems',
    description:
      'Apex Health Systems builds clinical integration solutions for modern healthcare organizations. Specializing in e-prescribing, lab connectivity, and pharmacy workflows, Apex has powered over 2,000 clinics nationwide since 2019.',
    logo: '',
    website: 'https://example.com/apex',
  },
  'carebridge': {
    id: 'carebridge',
    name: 'CareBridge Analytics',
    description:
      'CareBridge Analytics provides data-driven clinical decision support tools and population health dashboards. Their AI-powered insights help providers identify care gaps and improve outcomes.',
    logo: '',
    website: 'https://example.com/carebridge',
  },
  'medplum': {
    id: 'medplum',
    name: 'Medplum',
    description:
      'Medplum is the open-source healthcare developer platform. These are first-party templates, bots, and content packs maintained by the Medplum team.',
    logo: '',
    website: 'https://www.medplum.com',
  },
  'nimbus-clinical': {
    id: 'nimbus-clinical',
    name: 'Nimbus Clinical',
    description:
      'Nimbus Clinical creates specialized clinical content packs and visit templates for pediatrics, OB/GYN, and primary care practices. Used by 500+ providers.',
    logo: '',
    website: 'https://example.com/nimbus',
  },
  'prism-ai': {
    id: 'prism-ai',
    name: 'Prism AI',
    description:
      'Prism AI develops next-generation AI agents and decision support skills for clinical workflows. Their models are trained on peer-reviewed clinical guidelines and continuously updated.',
    logo: '',
    website: 'https://example.com/prismai',
  },
  'stellarhealth-consulting': {
    id: 'stellarhealth-consulting',
    name: 'StellarHealth Consulting',
    description:
      'StellarHealth Consulting is a full-service healthcare IT implementation firm. They specialize in Medplum deployments, EHR migrations, HIPAA compliance, and clinical workflow optimization.',
    logo: '',
    website: 'https://example.com/stellarhealth',
  },
  'vitalink': {
    id: 'vitalink',
    name: 'VitaLink Solutions',
    description:
      'VitaLink Solutions focuses on interoperability and data migration tools for healthcare organizations transitioning between EHR platforms.',
    logo: '',
    website: 'https://example.com/vitalink',
  },
  'compliance-first': {
    id: 'compliance-first',
    name: 'ComplianceFirst',
    description:
      'ComplianceFirst provides HIPAA, SOC 2, and HITRUST compliance training, auditing, and certification preparation services for healthcare technology companies.',
    logo: '',
    website: 'https://example.com/compliancefirst',
  },
  'candid-health': {
    id: 'candid-health',
    name: 'Candid Health',
    description:
      'Candid Health is a modern revenue cycle management platform that automates medical billing workflows. Their API-first approach helps healthcare organizations streamline claims submission, payment posting, and denial management.',
    logo: '',
    website: 'https://www.candidhealth.com',
  },
  'dosespot': {
    id: 'dosespot',
    name: 'DoseSpot',
    description:
      'DoseSpot provides EPCS-certified electronic prescribing integrated directly into your Medplum workflow. Manage pending prescriptions, medication history, pharmacy selection, and drug allergies from the patient chart.',
    logo: '',
    website: 'https://www.dosespot.com',
  },
};

// ─── Listings ───────────────────────────────────────────────────────────────

export const listings: MarketplaceListing[] = [
  // ── Apps (6) ──────────────────────────────────────────────────────────────
  {
    id: 'dosespot-eprescribing',
    name: 'DoseSpot ePrescribing',
    tagline: 'EPCS-certified electronic prescribing integrated into your Medplum patient chart',
    description: `DoseSpot ePrescribing connects directly to your Medplum environment so providers can add prescriptions, manage pending tasks, and send orders to pharmacies without leaving the patient chart. The Tasks dashboard surfaces pending prescriptions with one-click approve and send, and the patient view shows medication history, default pharmacy, and drug allergies in one place.

The integration supports EPCS (Electronic Prescribing for Controlled Substances) for Schedule II–V medications and state PDMP lookups where available. Set a default pharmacy per patient, manage drug allergies, and transmit to a broad pharmacy network.

Install the app and connect your DoseSpot credentials; the prescribing workflow and Tasks (e.g. Pending Prescriptions) appear in Medplum with no custom development.`,
    type: 'App',
    categories: ['Pharmacy', 'Compliance'],
    vendor: vendors['dosespot'],
    version: '2.4.1',
    lastUpdated: '2026-01-15',
    icon: '/img/dosespot-icon.png',
    features: [
      'EPCS-certified for Schedule II–V',
      'Pending prescriptions task queue with approve & send',
      'Medication history and drug allergy display',
      'Default pharmacy and manage patient pharmacies',
      'State PDMP integration',
      'Pharmacy network directory',
    ],
    screenshots: [
      '/img/marketplace/dosespot-pending-prescriptions.png',
      '/img/marketplace/dosespot-patient-prescriptions.png',
    ],
    relatedListingIds: ['pharmacy-sync-bot', 'medication-content-pack'],
    popularity: 95,
    compatibility: 'Medplum 3.x+',
  },
  {
    id: 'dosespot-provider-example',
    name: 'DoseSpot ePrescribing: Provider Example',
    tagline: 'Provider-level e-prescribing setup with NPI registration and prescriber enrollment',
    description: `DoseSpot ePrescribing: Provider Example demonstrates the provider-level onboarding flow for DoseSpot e-prescribing. After your organization installs the main DoseSpot app, each prescribing provider needs to be individually enrolled with their NPI number, DEA registration, and state license information.

This example app walks through the provider enrollment process: entering your NPI, verifying your DEA number, confirming state licensure, and setting prescribing preferences. Once enrolled, the provider can write, sign, and transmit prescriptions directly from the patient chart.

The setup flow mirrors DoseSpot's actual provider registration requirements, including EPCS identity proofing for controlled substance prescribing.`,
    type: 'App',
    categories: ['Pharmacy', 'Compliance'],
    vendor: vendors['dosespot'],
    version: '2.4.1',
    lastUpdated: '2026-02-10',
    icon: '/img/dosespot-icon.png',
    features: [
      'Provider NPI registration and verification',
      'DEA number enrollment for controlled substances',
      'State license validation',
      'EPCS identity proofing setup',
      'Prescriber preference configuration',
      'Supervised prescriber support',
    ],
    screenshots: [
      '/img/marketplace/dosespot-pending-prescriptions.png',
      '/img/marketplace/dosespot-patient-prescriptions.png',
    ],
    relatedListingIds: ['dosespot-eprescribing', 'pharmacy-sync-bot', 'medication-content-pack'],
    popularity: 88,
    compatibility: 'Medplum 3.x+',
  },
  {
    id: 'carebridge-dashboard',
    name: 'CareBridge Population Health Dashboard',
    tagline: 'Identify care gaps and track outcomes across your patient population',
    description: `The CareBridge Population Health Dashboard gives clinical leaders a bird's-eye view of their patient population. Powered by your existing Medplum FHIR data, it surfaces care gaps, tracks quality measures, and highlights patients who may benefit from proactive outreach.

Dashboards are fully customizable with drag-and-drop widgets, and pre-built views are included for common quality programs (HEDIS, MIPS, CPC+). Data refreshes automatically as new clinical data flows into Medplum.

The dashboard is read-only and makes no changes to your clinical data.`,
    type: 'App',
    categories: ['Decision Support', 'Patient Engagement'],
    vendor: vendors['carebridge'],
    version: '1.8.0',
    lastUpdated: '2026-01-28',
    icon: '',
    features: [
      'Pre-built HEDIS and MIPS dashboards',
      'Customizable widgets and views',
      'Automatic data refresh from FHIR resources',
      'Care gap identification',
      'Patient outreach list generation',
    ],
    relatedListingIds: ['care-gap-bot', 'chronic-care-template'],
    popularity: 88,
    compatibility: 'Medplum 3.x+',
  },
  {
    id: 'lab-connect',
    name: 'LabConnect Integration',
    tagline: 'Bi-directional lab ordering and results delivery from 4,000+ labs',
    description: `LabConnect integrates your Medplum environment with a national network of 4,000+ clinical laboratories. Send orders electronically, receive structured results as FHIR DiagnosticReport resources, and route results to the ordering provider automatically.

The integration handles HL7v2 to FHIR conversion behind the scenes, so your team works entirely in FHIR. Results are matched to the originating ServiceRequest and appear in the patient timeline within minutes of release.

LabConnect supports custom order panels, ABN (Advance Beneficiary Notice) workflows, and specimen tracking.`,
    type: 'App',
    categories: ['Lab', 'Interoperability'],
    vendor: vendors['apex-health'],
    version: '3.1.0',
    lastUpdated: '2026-02-01',
    icon: '',
    features: [
      '4,000+ lab network',
      'Bi-directional ordering and results',
      'HL7v2 to FHIR conversion',
      'Specimen tracking',
      'ABN workflow support',
    ],
    relatedListingIds: ['lab-result-bot', 'diagnostics-content-pack'],
    popularity: 92,
    compatibility: 'Medplum 3.x+',
  },
  {
    id: 'telehealth-bridge',
    name: 'TelehealthBridge',
    tagline: 'Embedded video visits with automatic encounter documentation',
    description: `TelehealthBridge adds seamless video visit capabilities to your Medplum-powered application. Launch video calls directly from the patient chart, and encounter notes are automatically created as FHIR Encounter and DocumentReference resources.

The integration supports multi-party calls, screen sharing, waiting room workflows, and patient self-scheduling. All video data is transmitted over encrypted channels and no PHI is stored on external servers.

TelehealthBridge works on desktop and mobile browsers with no app download required for patients.`,
    type: 'App',
    categories: ['Patient Engagement', 'Scheduling'],
    vendor: vendors['vitalink'],
    version: '2.0.3',
    lastUpdated: '2025-12-20',
    icon: '',
    features: [
      'Embedded video calls in patient chart',
      'Automatic encounter creation',
      'Patient self-scheduling',
      'Multi-party calls and screen sharing',
      'No app download for patients',
    ],
    relatedListingIds: ['scheduling-template', 'patient-intake-template'],
    popularity: 85,
    compatibility: 'Medplum 3.x+',
  },
  {
    id: 'billing-pro',
    name: 'BillingPro Claims Engine',
    tagline: 'Automated claim generation and submission from FHIR encounters',
    description: `BillingPro connects your Medplum clinical data to the revenue cycle. It reads Encounter, Procedure, and Condition resources to automatically generate CMS-1500 and UB-04 claims, validates them against payer rules, and submits electronically to 1,200+ payers.

Denial management workflows help your team track rejected claims, identify common rejection reasons, and resubmit corrected claims — all from within the Medplum interface.

BillingPro integrates with your existing clearinghouse or can serve as your primary claims submission pathway.`,
    type: 'App',
    categories: ['Billing', 'Compliance'],
    vendor: vendors['carebridge'],
    version: '1.5.2',
    lastUpdated: '2026-01-10',
    icon: '',
    features: [
      'Automated claim generation from FHIR data',
      'CMS-1500 and UB-04 support',
      '1,200+ payer network',
      'Denial management workflows',
      'Eligibility verification',
    ],
    relatedListingIds: ['billing-code-bot', 'compliance-content-pack'],
    popularity: 80,
    compatibility: 'Medplum 3.x+',
  },
  {
    id: 'candid-health-rcm',
    name: 'Candid Health RCM',
    tagline: 'API-first revenue cycle management with automated claim scrubbing and payment posting',
    description: `Candid Health brings modern, API-first revenue cycle management to your Medplum environment. It reads Encounter, Claim, and Coverage resources to automate the full billing lifecycle — from eligibility checks and claim scrubbing through submission, payment posting, and denial follow-up.

The integration maps FHIR resources directly to payer-ready claims, reducing manual data entry and coding errors. Real-time claim status tracking and automated ERA/EOB reconciliation keep your revenue cycle moving without spreadsheets or manual workarounds.

Candid Health's rules engine catches common claim errors before submission, and their analytics dashboard surfaces trends in denials, underpayments, and days in A/R.`,
    type: 'App',
    categories: ['Billing'],
    vendor: vendors['candid-health'],
    version: '1.0.0',
    lastUpdated: '2026-02-01',
    icon: '',
    features: [
      'Automated claim scrubbing and submission',
      'Real-time eligibility verification',
      'ERA/EOB payment posting and reconciliation',
      'Denial management and follow-up workflows',
      'Revenue cycle analytics dashboard',
    ],
    relatedListingIds: ['billing-pro', 'billing-code-bot'],
    popularity: 76,
    compatibility: 'Medplum 3.x+',
  },
  {
    id: 'patient-portal',
    name: 'PatientView Portal',
    tagline: 'Patient-facing portal for records access, messaging, and appointment booking',
    description: `PatientView Portal provides a modern, mobile-friendly patient portal that connects to your Medplum backend. Patients can view their medical records, lab results, and visit summaries; send secure messages to their care team; and book or reschedule appointments.

The portal is fully white-labeled and can be embedded in your existing website or deployed as a standalone application. It supports ONC requirements for patient access to electronic health information.

Setup includes customizable branding, configurable access policies, and a patient onboarding flow.`,
    type: 'App',
    categories: ['Patient Engagement', 'Scheduling'],
    vendor: vendors['medplum'],
    version: '1.2.0',
    lastUpdated: '2026-02-05',
    icon: '',
    features: [
      'Medical records and lab results viewer',
      'Secure messaging',
      'Appointment booking and management',
      'White-label branding',
      'ONC patient access compliance',
    ],
    relatedListingIds: ['patient-intake-template', 'scheduling-template'],
    popularity: 90,
    compatibility: 'Medplum 3.x+',
  },

  // ── Automations (6) ──────────────────────────────────────────────────────
  {
    id: 'lab-result-bot',
    name: 'Lab Result Notifier',
    tagline: 'Automatically notify providers and patients when lab results are ready',
    description: `The Lab Result Notifier bot monitors incoming DiagnosticReport resources and sends targeted notifications when results are available. Providers receive in-app alerts and optional email notifications; patients can receive SMS or email updates (configurable per practice).

Critical and abnormal results are flagged with high-priority alerts and can trigger escalation workflows. The bot respects provider notification preferences and quiet hours.

This bot runs as a Medplum Subscription and processes results in real-time.`,
    type: 'Automation',
    categories: ['Lab', 'Patient Engagement'],
    vendor: vendors['medplum'],
    version: '1.4.0',
    lastUpdated: '2026-01-20',
    icon: '',
    features: [
      'Real-time result notifications',
      'Critical value alerting',
      'Provider and patient notification channels',
      'Configurable quiet hours',
      'Escalation workflows',
    ],
    relatedListingIds: ['lab-connect', 'care-gap-bot'],
    popularity: 87,
    compatibility: 'Medplum 3.x+',
  },
  {
    id: 'care-gap-bot',
    name: 'Care Gap Detector',
    tagline: 'Identify overdue screenings, vaccinations, and follow-ups automatically',
    description: `The Care Gap Detector runs on a configurable schedule (daily or weekly) and scans your patient population for care gaps. It checks vaccination schedules, cancer screening timelines, chronic disease follow-up intervals, and preventive care guidelines.

When gaps are detected, the bot creates Task resources assigned to the appropriate care team member and optionally adds the patient to an outreach list. Gap definitions are based on USPSTF and HEDIS guidelines and can be customized.

This bot helps practices close care gaps proactively, improving quality scores and patient outcomes.`,
    type: 'Automation',
    categories: ['Decision Support', 'Diagnostics'],
    vendor: vendors['carebridge'],
    version: '2.1.0',
    lastUpdated: '2026-01-25',
    icon: '',
    features: [
      'Automated care gap scanning',
      'USPSTF and HEDIS guideline support',
      'Task creation for care team follow-up',
      'Customizable gap definitions',
      'Scheduled or real-time processing',
    ],
    relatedListingIds: ['carebridge-dashboard', 'chronic-care-template'],
    popularity: 82,
    compatibility: 'Medplum 3.x+',
  },
  {
    id: 'pharmacy-sync-bot',
    name: 'Pharmacy Sync',
    tagline: 'Synchronize medication lists with external pharmacy systems in real-time',
    description: `Pharmacy Sync monitors MedicationRequest resources and keeps your patient medication lists synchronized with connected pharmacy systems. When a prescription is created, modified, or cancelled in Medplum, the change is propagated to the pharmacy within seconds.

The bot handles common edge cases: partial fills, therapeutic substitutions, and pharmacy transfers. A reconciliation report runs nightly to catch any discrepancies.

Pharmacy Sync works in conjunction with DoseSpot ePrescribing or as a standalone synchronization layer for practices that manage prescriptions externally.`,
    type: 'Automation',
    categories: ['Pharmacy', 'Interoperability'],
    vendor: vendors['apex-health'],
    version: '1.2.3',
    lastUpdated: '2025-12-15',
    icon: '',
    features: [
      'Real-time medication list sync',
      'Partial fill and substitution handling',
      'Nightly reconciliation reports',
      'Works with or without e-prescribing',
      'Audit trail for all changes',
    ],
    relatedListingIds: ['dosespot-eprescribing', 'medication-content-pack'],
    popularity: 75,
    compatibility: 'Medplum 3.x+',
  },
  {
    id: 'billing-code-bot',
    name: 'Auto-Coder',
    tagline: 'Suggest ICD-10 and CPT codes from encounter documentation',
    description: `Auto-Coder analyzes encounter notes and clinical documentation to suggest appropriate ICD-10 diagnosis codes and CPT procedure codes. Suggestions appear as draft Claim line items that a human coder reviews and approves before submission.

The bot uses a rules-based engine with clinical terminology mappings (not AI-generated suggestions), ensuring consistent and auditable code selection. It supports specialty-specific coding guidelines for primary care, orthopedics, cardiology, and more.

Auto-Coder reduces coding turnaround time by 40% on average and catches common under-coding and over-coding patterns.`,
    type: 'Automation',
    categories: ['Billing', 'Compliance'],
    vendor: vendors['carebridge'],
    version: '1.0.5',
    lastUpdated: '2026-01-08',
    icon: '',
    features: [
      'ICD-10 and CPT code suggestions',
      'Human-in-the-loop review workflow',
      'Rules-based (not AI) for auditability',
      'Specialty-specific guidelines',
      'Under/over-coding pattern detection',
    ],
    relatedListingIds: ['billing-pro', 'compliance-content-pack'],
    popularity: 78,
    compatibility: 'Medplum 3.x+',
  },
  {
    id: 'appointment-reminder-bot',
    name: 'Appointment Reminder',
    tagline: 'Automated SMS and email reminders to reduce no-show rates',
    description: `The Appointment Reminder bot sends configurable reminders to patients before their scheduled appointments. Choose from SMS, email, or both — and customize the timing (e.g., 48 hours, 24 hours, and 2 hours before the visit).

Patients can confirm, cancel, or request to reschedule directly from the reminder message. Responses are recorded as Appointment status updates in Medplum, giving your front desk real-time visibility into the day's schedule.

Practices using Appointment Reminder typically see a 30-40% reduction in no-show rates.`,
    type: 'Automation',
    categories: ['Scheduling', 'Patient Engagement'],
    vendor: vendors['medplum'],
    version: '2.0.0',
    lastUpdated: '2026-02-03',
    icon: '',
    features: [
      'SMS and email reminders',
      'Configurable reminder timing',
      'Patient self-service (confirm/cancel/reschedule)',
      'Real-time schedule updates',
      'Multi-language support',
    ],
    relatedListingIds: ['scheduling-template', 'telehealth-bridge'],
    popularity: 91,
    compatibility: 'Medplum 3.x+',
  },
  {
    id: 'referral-router-bot',
    name: 'Referral Router',
    tagline: 'Automatically route referrals to the right specialist based on configurable rules',
    description: `Referral Router monitors incoming ServiceRequest resources and routes them to appropriate specialists based on configurable rules. Rules can match on diagnosis codes, insurance plans, geographic proximity, provider availability, and patient preferences.

The bot creates Task resources for the receiving provider, sends notifications to both the referring and receiving parties, and tracks referral status through completion. A dashboard view shows referral volumes, acceptance rates, and turnaround times.

Referral Router replaces manual fax-based referral workflows with a structured, trackable process.`,
    type: 'Automation',
    categories: ['Interoperability', 'Scheduling'],
    vendor: vendors['vitalink'],
    version: '1.1.0',
    lastUpdated: '2025-11-30',
    icon: '',
    features: [
      'Rules-based referral routing',
      'Multi-criteria matching (diagnosis, insurance, location)',
      'Referral status tracking',
      'Referring/receiving provider notifications',
      'Volume and turnaround dashboards',
    ],
    relatedListingIds: ['care-gap-bot', 'scheduling-template'],
    popularity: 70,
    compatibility: 'Medplum 3.x+',
  },

  // ── Templates (6) ────────────────────────────────────────────────────────
  {
    id: 'pediatric-well-visit-template',
    name: 'Pediatric Well-Visit Template',
    tagline: 'Age-appropriate well-child visit questionnaires from birth through adolescence',
    description: `This template set provides comprehensive well-child visit questionnaires aligned with AAP Bright Futures guidelines. Each age-specific template includes developmental milestones, growth tracking prompts, vaccination review, and anticipatory guidance documentation.

Templates are provided as FHIR Questionnaire resources and render beautifully in the Medplum questionnaire viewer. Responses are stored as QuestionnaireResponse resources linked to the patient encounter.

The set covers 14 age-specific visits from newborn through 18 years, plus a general pediatric intake form.`,
    type: 'Template',
    categories: ['Pediatrics'],
    vendor: vendors['nimbus-clinical'],
    version: '3.0.0',
    lastUpdated: '2026-01-12',
    icon: '',
    features: [
      '14 age-specific visit templates',
      'AAP Bright Futures aligned',
      'Developmental milestone tracking',
      'Growth chart integration points',
      'Anticipatory guidance documentation',
    ],
    relatedListingIds: ['growth-chart-app', 'vaccination-schedule-bot', 'pediatrics-content-pack'],
    popularity: 86,
    compatibility: 'Medplum 3.x+',
  },
  {
    id: 'patient-intake-template',
    name: 'Patient Intake Form',
    tagline: 'Comprehensive new patient registration and medical history questionnaire',
    description: `The Patient Intake Form template provides a complete new patient registration workflow. It collects demographics, insurance information, medical history, family history, social history, allergies, medications, and consent signatures.

The form is designed with conditional logic — sections expand or collapse based on prior answers (e.g., pregnancy-related questions only appear for applicable patients). It can be sent to patients before their first visit via a shareable link.

Responses auto-populate corresponding FHIR resources (Patient, AllergyIntolerance, Condition, etc.) when processed by the companion intake bot.`,
    type: 'Template',
    categories: ['Patient Engagement'],
    vendor: vendors['medplum'],
    version: '2.2.0',
    lastUpdated: '2026-02-01',
    icon: '',
    features: [
      'Comprehensive demographics and history',
      'Conditional form logic',
      'Patient-facing shareable link',
      'Auto-population of FHIR resources',
      'E-signature capture',
    ],
    relatedListingIds: ['patient-portal', 'consent-management-template'],
    popularity: 93,
    compatibility: 'Medplum 3.x+',
  },
  {
    id: 'chronic-care-template',
    name: 'Chronic Care Management Templates',
    tagline: 'Structured visit templates for diabetes, hypertension, and COPD management',
    description: `This template pack provides structured visit documentation for the three most common chronic conditions: Type 2 Diabetes, Hypertension, and COPD. Each template captures condition-specific vitals, lab review, medication adjustments, lifestyle counseling, and care plan updates.

Templates align with CMS Chronic Care Management (CCM) billing requirements, helping practices document the elements needed for CCM reimbursement. Progress notes auto-generate from completed questionnaires.

A care plan summary template is included for patient handouts and shared care plans.`,
    type: 'Template',
    categories: ['Decision Support', 'Billing'],
    vendor: vendors['nimbus-clinical'],
    version: '1.5.0',
    lastUpdated: '2025-12-28',
    icon: '',
    features: [
      'Diabetes, Hypertension, and COPD templates',
      'CMS CCM billing alignment',
      'Condition-specific vital capture',
      'Auto-generated progress notes',
      'Patient care plan summaries',
    ],
    relatedListingIds: ['care-gap-bot', 'carebridge-dashboard'],
    popularity: 79,
    compatibility: 'Medplum 3.x+',
  },
  {
    id: 'scheduling-template',
    name: 'Appointment Scheduling Workflow',
    tagline: 'Configurable scheduling templates with slot management and booking rules',
    description: `The Appointment Scheduling Workflow template provides a complete scheduling foundation for your Medplum application. It includes Schedule and Slot resource templates, appointment type definitions, booking rule configurations, and a patient self-scheduling questionnaire.

Supports multiple provider schedules, location-based availability, appointment type durations, and buffer times between visits. The template generates the FHIR Schedule, Slot, and Appointment resources needed for a functional scheduling system.

Works with TelehealthBridge for virtual visit scheduling and Appointment Reminder for automated notifications.`,
    type: 'Template',
    categories: ['Scheduling'],
    vendor: vendors['medplum'],
    version: '1.3.0',
    lastUpdated: '2026-01-18',
    icon: '',
    features: [
      'Schedule and Slot resource templates',
      'Appointment type definitions',
      'Multi-provider and multi-location support',
      'Patient self-scheduling form',
      'Configurable booking rules and buffer times',
    ],
    relatedListingIds: ['appointment-reminder-bot', 'telehealth-bridge'],
    popularity: 84,
    compatibility: 'Medplum 3.x+',
  },
  {
    id: 'consent-management-template',
    name: 'Consent Management Forms',
    tagline: 'HIPAA consent, treatment authorization, and research consent templates',
    description: `This template pack provides standardized consent forms for common clinical and administrative scenarios: HIPAA Notice of Privacy Practices acknowledgment, general treatment consent, procedure-specific consent, telehealth consent, and research study enrollment consent.

Each form captures a legally valid e-signature and stores the consent as a FHIR Consent resource with appropriate scope and category coding. Templates support customization for state-specific requirements.

A consent tracking dashboard template is included to help practices monitor consent status across their patient population.`,
    type: 'Template',
    categories: ['Compliance', 'Patient Engagement'],
    vendor: vendors['nimbus-clinical'],
    version: '1.1.0',
    lastUpdated: '2025-11-15',
    icon: '',
    features: [
      'HIPAA, treatment, and research consent forms',
      'E-signature capture and storage',
      'FHIR Consent resource generation',
      'State-specific customization',
      'Consent status tracking dashboard',
    ],
    relatedListingIds: ['patient-intake-template', 'compliance-content-pack'],
    popularity: 73,
    compatibility: 'Medplum 3.x+',
  },
  {
    id: 'mental-health-template',
    name: 'Behavioral Health Assessment Pack',
    tagline: 'PHQ-9, GAD-7, and other validated screening instruments as FHIR questionnaires',
    description: `The Behavioral Health Assessment Pack includes validated screening instruments commonly used in primary care and behavioral health settings: PHQ-9 (depression), GAD-7 (anxiety), AUDIT-C (alcohol use), PC-PTSD-5 (PTSD screening), and Columbia Suicide Severity Rating Scale.

Each instrument is implemented as a FHIR Questionnaire with built-in scoring logic. Scores are automatically calculated and stored as Observation resources, and clinical decision support alerts can be triggered for high-risk scores.

All instruments include patient-friendly language and are available in English and Spanish.`,
    type: 'Template',
    categories: ['Decision Support', 'Patient Engagement'],
    vendor: vendors['nimbus-clinical'],
    version: '2.0.1',
    lastUpdated: '2026-01-05',
    icon: '',
    features: [
      'PHQ-9, GAD-7, AUDIT-C, PC-PTSD-5, C-SSRS',
      'Automatic scoring logic',
      'High-risk score alerting',
      'English and Spanish translations',
      'FHIR Observation score storage',
    ],
    relatedListingIds: ['triage-prompt', 'chronic-care-template'],
    popularity: 81,
    compatibility: 'Medplum 3.x+',
  },

  // ── Content Packs (5) ────────────────────────────────────────────────────
  {
    id: 'us-core-content-pack',
    name: 'US Core Profiles Pack',
    tagline: 'FHIR US Core R4 profile definitions, examples, and validation rules',
    description: `The US Core Profiles Pack installs all FHIR US Core R4 StructureDefinition resources along with example instances for each profile. This gives your Medplum project a solid foundation for ONC-compliant data modeling.

The pack includes 65+ profiles covering Patient, Condition, Observation, AllergyIntolerance, Procedure, Medication, and more. Each profile includes documentation on required and must-support elements.

Validation rules are configured so that resources can be checked against US Core requirements. Useful for teams building applications that need to pass ONC certification or participate in TEFCA data exchange.`,
    type: 'Content Pack',
    categories: ['Interoperability', 'Compliance'],
    vendor: vendors['medplum'],
    version: '6.1.0',
    lastUpdated: '2026-01-30',
    icon: '',
    features: [
      '65+ US Core R4 profiles',
      'Example instances for each profile',
      'Validation rule configuration',
      'Must-support element documentation',
      'ONC certification alignment',
    ],
    relatedListingIds: ['diagnostics-content-pack', 'medication-content-pack'],
    popularity: 94,
    compatibility: 'Medplum 3.x+',
  },
  {
    id: 'medication-content-pack',
    name: 'Medication Knowledge Base',
    tagline: 'Drug database with interaction checking, dosing guidelines, and formulary support',
    description: `The Medication Knowledge Base provides a comprehensive drug reference dataset stored as FHIR Medication and MedicationKnowledge resources. It includes 10,000+ medications with NDC codes, dosage forms, strength information, and standard packaging.

Drug-drug interaction data is included for the 500 most commonly prescribed medications, along with dose-range checking rules for pediatric and adult populations. Formulary status can be configured per insurance plan.

The knowledge base is updated quarterly and is designed to work with e-prescribing and pharmacy sync integrations.`,
    type: 'Content Pack',
    categories: ['Pharmacy', 'Decision Support'],
    vendor: vendors['apex-health'],
    version: '4.2.0',
    lastUpdated: '2026-01-22',
    icon: '',
    features: [
      '10,000+ medication entries',
      'Drug-drug interaction checking',
      'Pediatric and adult dosing rules',
      'NDC code mapping',
      'Quarterly update schedule',
    ],
    relatedListingIds: ['dosespot-eprescribing', 'pharmacy-sync-bot'],
    popularity: 83,
    compatibility: 'Medplum 3.x+',
  },
  {
    id: 'diagnostics-content-pack',
    name: 'Diagnostics Value Set Bundle',
    tagline: 'LOINC-coded lab test definitions and reference ranges for common panels',
    description: `The Diagnostics Value Set Bundle provides structured definitions for 200+ commonly ordered lab tests and diagnostic studies. Each test includes LOINC coding, reference ranges (age- and sex-specific where applicable), and units of measure.

Pre-built panels (CBC, BMP, CMP, Lipid Panel, Thyroid Panel, etc.) are included as ActivityDefinition resources that can be used for one-click ordering. ObservationDefinition resources power automatic result validation against reference ranges.

The bundle is designed to work with LabConnect and other lab integrations to streamline the order-to-result workflow.`,
    type: 'Content Pack',
    categories: ['Lab', 'Diagnostics'],
    vendor: vendors['medplum'],
    version: '2.3.0',
    lastUpdated: '2026-01-15',
    icon: '',
    features: [
      '200+ LOINC-coded test definitions',
      'Age- and sex-specific reference ranges',
      'Pre-built common lab panels',
      'ObservationDefinition for validation',
      'ActivityDefinition for ordering',
    ],
    relatedListingIds: ['lab-connect', 'lab-result-bot'],
    popularity: 77,
    compatibility: 'Medplum 3.x+',
  },
  {
    id: 'pediatrics-content-pack',
    name: 'Pediatrics Clinical Content',
    tagline: 'Growth charts, immunization schedules, and developmental milestones for pediatric care',
    description: `The Pediatrics Clinical Content pack provides the foundational clinical data needed for a pediatric practice on Medplum. It includes WHO and CDC growth chart reference data, the current ACIP immunization schedule, and developmental milestone checklists from birth through 5 years.

Growth percentiles are calculated automatically when weight, height, and head circumference observations are recorded. Immunization forecasting uses the ACIP schedule to identify due, overdue, and upcoming vaccinations.

This content pack pairs well with the Pediatric Well-Visit Template and the Growth Chart App for a complete pediatric workflow.`,
    type: 'Content Pack',
    categories: ['Pediatrics'],
    vendor: vendors['nimbus-clinical'],
    version: '2.0.0',
    lastUpdated: '2025-12-10',
    icon: '',
    features: [
      'WHO and CDC growth chart data',
      'ACIP immunization schedule',
      'Developmental milestone checklists',
      'Automatic growth percentile calculation',
      'Immunization forecasting',
    ],
    relatedListingIds: ['pediatric-well-visit-template', 'growth-chart-app', 'vaccination-schedule-bot'],
    popularity: 76,
    compatibility: 'Medplum 3.x+',
  },
  {
    id: 'compliance-content-pack',
    name: 'Compliance & Regulatory Bundle',
    tagline: 'HIPAA policies, security assessment templates, and compliance checklists',
    description: `The Compliance & Regulatory Bundle provides a set of document templates and checklists for healthcare compliance programs. It includes HIPAA Privacy and Security Rule policies, risk assessment questionnaires, incident response plan templates, and Business Associate Agreement templates.

Compliance checklists are implemented as FHIR Questionnaire resources, making it easy to track completion status and store evidence as QuestionnaireResponse resources. The bundle aligns with HHS guidance and is updated annually.

Designed for both covered entities and business associates operating on the Medplum platform.`,
    type: 'Content Pack',
    categories: ['Compliance'],
    vendor: vendors['compliance-first'],
    version: '1.3.0',
    lastUpdated: '2026-01-02',
    icon: '',
    features: [
      'HIPAA Privacy and Security policies',
      'Risk assessment questionnaires',
      'Incident response plan template',
      'BAA templates',
      'Annual update schedule',
    ],
    relatedListingIds: ['consent-management-template', 'us-core-content-pack'],
    popularity: 72,
    compatibility: 'Medplum 3.x+',
  },

  // ── Agent Prompts / Skills (5) ────────────────────────────────────────────
  {
    id: 'triage-prompt',
    name: 'Triage Assessment Agent',
    tagline: 'AI-guided patient triage with symptom analysis and urgency scoring',
    description: `The Triage Assessment Agent provides a conversational AI interface that guides patients through symptom reporting and generates a structured triage assessment. The agent asks targeted follow-up questions based on initial symptoms, identifies red-flag conditions, and assigns an urgency score.

Output is a structured FHIR QuestionnaireResponse with coded symptom observations and a recommended care pathway (emergency, urgent care, same-day appointment, routine appointment, self-care).

The agent uses clinical guidelines (ESI and MTS frameworks) and is designed as a decision support tool — not a replacement for clinical judgment.`,
    type: 'Agent Prompt / Skill',
    categories: ['Decision Support', 'Patient Engagement'],
    vendor: vendors['prism-ai'],
    version: '1.2.0',
    lastUpdated: '2026-02-08',
    icon: '',
    features: [
      'Conversational symptom assessment',
      'Red-flag condition detection',
      'ESI/MTS-based urgency scoring',
      'Structured FHIR output',
      'Care pathway recommendation',
    ],
    relatedListingIds: ['clinical-summary-prompt', 'mental-health-template'],
    popularity: 89,
    compatibility: 'Medplum 3.x+',
  },
  {
    id: 'clinical-summary-prompt',
    name: 'Clinical Summary Generator',
    tagline: 'Generate concise patient summaries from encounter data and clinical notes',
    description: `The Clinical Summary Generator agent reads a patient's recent encounters, active conditions, medications, and lab results to produce a concise clinical summary. Summaries can be generated for referral letters, care transitions, or patient handouts.

The agent supports configurable summary formats: brief (1 paragraph), standard (structured sections), and comprehensive (detailed with timeline). All summaries cite source FHIR resources for verification.

Output is available as plain text, markdown, or a FHIR DocumentReference for storage in the patient record.`,
    type: 'Agent Prompt / Skill',
    categories: ['Decision Support', 'Interoperability'],
    vendor: vendors['prism-ai'],
    version: '1.0.3',
    lastUpdated: '2026-01-28',
    icon: '',
    features: [
      'Multi-format summary generation',
      'Configurable detail levels',
      'Source citation for all data',
      'Referral letter and handout formats',
      'FHIR DocumentReference output',
    ],
    relatedListingIds: ['triage-prompt', 'chronic-care-template'],
    popularity: 85,
    compatibility: 'Medplum 3.x+',
  },
  {
    id: 'coding-assistant-prompt',
    name: 'ICD-10 Coding Assistant',
    tagline: 'AI-powered ICD-10 code lookup and suggestion from clinical descriptions',
    description: `The ICD-10 Coding Assistant helps clinical staff find the most appropriate diagnosis codes from natural language descriptions. Describe a condition in plain English, and the agent returns ranked ICD-10-CM code suggestions with confidence scores and coding guidelines.

The assistant understands clinical synonyms, anatomical laterality, and specificity requirements. It can also validate existing code selections and suggest more specific codes when available.

Designed for use during documentation and coding review workflows.`,
    type: 'Agent Prompt / Skill',
    categories: ['Billing', 'Decision Support'],
    vendor: vendors['prism-ai'],
    version: '1.1.0',
    lastUpdated: '2026-01-15',
    icon: '',
    features: [
      'Natural language to ICD-10 mapping',
      'Ranked suggestions with confidence scores',
      'Laterality and specificity handling',
      'Code validation and upgrade suggestions',
      'Clinical synonym understanding',
    ],
    relatedListingIds: ['billing-code-bot', 'billing-pro'],
    popularity: 77,
    compatibility: 'Medplum 3.x+',
  },
  {
    id: 'medication-interaction-prompt',
    name: 'Medication Interaction Checker',
    tagline: 'AI agent for comprehensive drug-drug and drug-condition interaction analysis',
    description: `The Medication Interaction Checker agent analyzes a patient's complete medication list against their active conditions, allergies, and demographics to identify potential interactions. It goes beyond simple drug-drug checks to include drug-condition contraindications, duplicate therapy detection, and dose-range alerts.

Interaction severity is classified as minor, moderate, major, or contraindicated. Each finding includes a clinical explanation, management recommendation, and literature reference.

The agent can process a full medication reconciliation or check individual new prescriptions against the existing list.`,
    type: 'Agent Prompt / Skill',
    categories: ['Pharmacy', 'Decision Support'],
    vendor: vendors['prism-ai'],
    version: '1.3.0',
    lastUpdated: '2026-02-01',
    icon: '',
    features: [
      'Drug-drug and drug-condition interaction checking',
      'Severity classification',
      'Duplicate therapy detection',
      'Dose-range alerts',
      'Literature-cited recommendations',
    ],
    relatedListingIds: ['medication-content-pack', 'dosespot-eprescribing'],
    popularity: 80,
    compatibility: 'Medplum 3.x+',
  },
  {
    id: 'data-quality-prompt',
    name: 'Data Quality Analyzer',
    tagline: 'Scan patient records for completeness, coding accuracy, and data quality issues',
    description: `The Data Quality Analyzer agent reviews patient records for common data quality issues: missing demographics, incomplete problem lists, uncoded conditions, orphaned observations, and duplicate records. It generates a structured quality report with specific fix recommendations.

The agent can scan individual records or run in batch mode across a patient cohort. Issues are classified by severity (critical, warning, info) and type (completeness, accuracy, consistency, timeliness).

Use this agent before data migrations, quality reporting, or certification audits to ensure your data meets expected standards.`,
    type: 'Agent Prompt / Skill',
    categories: ['Compliance', 'Data Migration'],
    vendor: vendors['vitalink'],
    version: '1.0.0',
    lastUpdated: '2025-12-20',
    icon: '',
    features: [
      'Comprehensive record quality scanning',
      'Missing data detection',
      'Coding accuracy validation',
      'Duplicate record identification',
      'Batch processing mode',
    ],
    relatedListingIds: ['us-core-content-pack', 'compliance-content-pack'],
    popularity: 68,
    compatibility: 'Medplum 3.x+',
  },

  // ── Service Providers (6) ─────────────────────────────────────────────────
  {
    id: 'stellarhealth-implementation',
    name: 'StellarHealth Implementation Services',
    tagline: 'Full-service Medplum deployment, migration, and custom development',
    description: `StellarHealth Consulting provides end-to-end implementation services for organizations deploying Medplum. From initial architecture design through go-live support, their team of certified Medplum engineers handles the technical complexity so your team can focus on clinical operations.

Services include environment setup (cloud or self-hosted), EHR data migration, custom bot development, integration engineering, and staff training. StellarHealth has completed 50+ Medplum deployments across health systems, digital health startups, and specialty practices.

Engagement models range from fixed-scope projects to ongoing retainer support.`,
    type: 'Service Provider',
    categories: ['Data Migration', 'Interoperability'],
    vendor: vendors['stellarhealth-consulting'],
    version: '—',
    lastUpdated: '2026-02-01',
    icon: '',
    features: [
      'Architecture design and environment setup',
      'EHR data migration',
      'Custom bot and integration development',
      'Staff training programs',
      'Ongoing retainer support',
    ],
    serviceTypes: ['Implementation', 'Clinical'],
    contactUrl: 'https://example.com/stellarhealth/contact',
    popularity: 90,
    compatibility: 'Medplum 3.x+',
  },
  {
    id: 'compliancefirst-hipaa',
    name: 'ComplianceFirst HIPAA Services',
    tagline: 'HIPAA risk assessments, policy development, and compliance training',
    description: `ComplianceFirst provides comprehensive HIPAA compliance services for healthcare organizations using Medplum. Their certified privacy and security professionals conduct thorough risk assessments, develop customized policies and procedures, and deliver staff training programs.

Services include annual risk assessment, HIPAA Privacy and Security Rule gap analysis, policy and procedure development, staff awareness training, incident response planning, and audit preparation support.

ComplianceFirst works with both covered entities and business associates and has supported 200+ organizations through HIPAA compliance programs.`,
    type: 'Service Provider',
    categories: ['Compliance'],
    vendor: vendors['compliance-first'],
    version: '—',
    lastUpdated: '2026-01-15',
    icon: '',
    features: [
      'HIPAA risk assessments',
      'Policy and procedure development',
      'Staff training programs',
      'Incident response planning',
      'Audit preparation support',
    ],
    serviceTypes: ['Compliance'],
    contactUrl: 'https://example.com/compliancefirst/contact',
    popularity: 82,
    compatibility: 'All Medplum versions',
  },
  {
    id: 'vitalink-migration',
    name: 'VitaLink Data Migration Services',
    tagline: 'Expert EHR-to-Medplum data migration with zero downtime',
    description: `VitaLink specializes in migrating clinical data from legacy EHR systems to Medplum. Their proven migration methodology handles data extraction, FHIR transformation, validation, and incremental loading — minimizing downtime and ensuring data integrity.

VitaLink has migration playbooks for 15+ source EHR systems including Epic, Cerner, Athenahealth, eClinicalWorks, and AllScripts. Their data quality tooling identifies and resolves issues before migration, reducing post-go-live cleanup.

Typical migrations are completed in 8-12 weeks with a parallel-run validation period.`,
    type: 'Service Provider',
    categories: ['Data Migration', 'Interoperability'],
    vendor: vendors['vitalink'],
    version: '—',
    lastUpdated: '2025-12-01',
    icon: '',
    features: [
      'Playbooks for 15+ source EHR systems',
      'FHIR transformation and validation',
      'Incremental migration with zero downtime',
      'Pre-migration data quality assessment',
      'Parallel-run validation period',
    ],
    serviceTypes: ['Implementation'],
    contactUrl: 'https://example.com/vitalink/contact',
    popularity: 75,
    compatibility: 'All Medplum versions',
  },
  {
    id: 'prism-ai-consulting',
    name: 'Prism AI Clinical AI Consulting',
    tagline: 'Custom AI agent development, model fine-tuning, and clinical AI strategy',
    description: `Prism AI offers consulting services for healthcare organizations looking to incorporate AI into their clinical workflows. Their team includes ML engineers with clinical informatics backgrounds who understand both the technical and regulatory requirements of clinical AI.

Services include custom agent development, clinical model fine-tuning, prompt engineering for healthcare use cases, AI safety and bias assessment, and regulatory compliance guidance for AI/ML in clinical settings.

Prism AI follows responsible AI principles and ensures all clinical AI tools include appropriate human-in-the-loop safeguards.`,
    type: 'Service Provider',
    categories: ['Decision Support'],
    vendor: vendors['prism-ai'],
    version: '—',
    lastUpdated: '2026-01-20',
    icon: '',
    features: [
      'Custom AI agent development',
      'Clinical model fine-tuning',
      'Prompt engineering for healthcare',
      'AI safety and bias assessment',
      'Regulatory compliance guidance',
    ],
    serviceTypes: ['Implementation', 'Clinical'],
    contactUrl: 'https://example.com/prismai/contact',
    popularity: 78,
    compatibility: 'Medplum 3.x+',
  },
  {
    id: 'carebridge-analytics-consulting',
    name: 'CareBridge Analytics Consulting',
    tagline: 'Custom dashboard development, quality measure reporting, and population health strategy',
    description: `CareBridge offers analytics consulting services for organizations that need customized population health dashboards, quality measure reporting pipelines, and data-driven clinical program design.

Their team can configure custom KPI dashboards, build automated quality measure calculation pipelines (HEDIS, MIPS, CPC+), design care management programs with outcome tracking, and create executive reporting packages.

CareBridge works on a project or retainer basis and integrates directly with your Medplum FHIR data.`,
    type: 'Service Provider',
    categories: ['Decision Support', 'Billing'],
    vendor: vendors['carebridge'],
    version: '—',
    lastUpdated: '2026-01-28',
    icon: '',
    features: [
      'Custom dashboard development',
      'Quality measure reporting (HEDIS, MIPS)',
      'Care management program design',
      'Executive reporting packages',
      'Outcome tracking and analysis',
    ],
    serviceTypes: ['Implementation', 'Clinical'],
    contactUrl: 'https://example.com/carebridge/contact',
    popularity: 74,
    compatibility: 'Medplum 3.x+',
  },
  {
    id: 'nimbus-clinical-training',
    name: 'Nimbus Clinical Content Services',
    tagline: 'Custom template development, clinical workflow design, and staff training',
    description: `Nimbus Clinical offers services for organizations that need custom clinical content development. Their team of clinical informaticists and EHR specialists creates tailored visit templates, questionnaires, care plans, and clinical workflows specific to your practice's specialty and documentation preferences.

Services include clinical workflow analysis, custom questionnaire and template development, clinical decision support rule design, staff training on template usage, and ongoing content maintenance.

Nimbus has deep expertise in pediatrics, OB/GYN, and primary care workflows.`,
    type: 'Service Provider',
    categories: ['Pediatrics', 'Patient Engagement'],
    vendor: vendors['nimbus-clinical'],
    version: '—',
    lastUpdated: '2026-02-05',
    icon: '',
    features: [
      'Custom template and questionnaire development',
      'Clinical workflow analysis and design',
      'Decision support rule authoring',
      'Staff training programs',
      'Ongoing content maintenance',
    ],
    serviceTypes: ['Clinical', 'Implementation'],
    contactUrl: 'https://example.com/nimbus/contact',
    popularity: 71,
    compatibility: 'All Medplum versions',
  },

  // ── Extra App for variety ─────────────────────────────────────────────────
  {
    id: 'growth-chart-app',
    name: 'Growth Chart Visualizer',
    tagline: 'Interactive WHO and CDC growth charts with percentile tracking',
    description: `The Growth Chart Visualizer renders interactive WHO and CDC growth charts directly in the patient chart. Plot weight-for-age, height-for-age, BMI-for-age, and head circumference-for-age with automatic percentile calculation.

Charts update in real-time as new measurements are recorded. Historical trends are displayed alongside standard percentile curves, making it easy to identify growth concerns at a glance.

The visualizer supports both metric and imperial units and includes preterm growth charts for adjusted gestational age tracking.`,
    type: 'App',
    categories: ['Pediatrics', 'Diagnostics'],
    vendor: vendors['nimbus-clinical'],
    version: '1.5.0',
    lastUpdated: '2026-01-08',
    icon: '',
    features: [
      'WHO and CDC growth charts',
      'Automatic percentile calculation',
      'Real-time chart updates',
      'Preterm adjusted age support',
      'Metric and imperial units',
    ],
    relatedListingIds: ['pediatric-well-visit-template', 'pediatrics-content-pack'],
    popularity: 74,
    compatibility: 'Medplum 3.x+',
  },

  // ── Extra Bot for variety ─────────────────────────────────────────────────
  {
    id: 'vaccination-schedule-bot',
    name: 'Vaccination Scheduler',
    tagline: 'Automated immunization forecasting and reminder generation',
    description: `The Vaccination Scheduler bot maintains an up-to-date immunization forecast for each patient based on the current ACIP recommended schedule. It monitors Immunization resources and recalculates the forecast whenever a vaccination is administered or a new patient is registered.

The bot generates Task resources for upcoming vaccinations and integrates with the Appointment Reminder bot to send patient notifications when vaccines are due. It handles catch-up schedules for patients with gaps in their immunization history.

Forecasting logic follows CDC immunization evaluation and forecasting guidelines.`,
    type: 'Automation',
    categories: ['Pediatrics', 'Patient Engagement'],
    vendor: vendors['nimbus-clinical'],
    version: '1.6.0',
    lastUpdated: '2026-01-18',
    icon: '',
    features: [
      'ACIP schedule-based forecasting',
      'Catch-up schedule generation',
      'Due/overdue vaccination alerts',
      'Integration with appointment reminders',
      'Patient and provider notifications',
    ],
    relatedListingIds: ['pediatrics-content-pack', 'appointment-reminder-bot'],
    popularity: 79,
    compatibility: 'Medplum 3.x+',
  },
];

// ─── Collections ────────────────────────────────────────────────────────────

export const collections: Collection[] = [
  {
    id: 'pediatrics-starter-kit',
    name: 'Pediatrics Starter Kit',
    description:
      'Everything you need to set up a pediatric practice on Medplum — growth charts, vaccination schedules, well-visit templates, and developmental screening tools.',
    icon: '',
    listingIds: [
      'growth-chart-app',
      'pediatric-well-visit-template',
      'vaccination-schedule-bot',
      'pediatrics-content-pack',
      'mental-health-template',
    ],
  },
  {
    id: 'clinical-operations-bundle',
    name: 'Clinical Operations Bundle',
    description:
      'Core integrations for a fully operational clinic — lab connectivity, e-prescribing, appointment management, and patient communications.',
    icon: '',
    listingIds: [
      'lab-connect',
      'dosespot-eprescribing',
      'appointment-reminder-bot',
      'scheduling-template',
      'patient-intake-template',
      'patient-portal',
    ],
  },
  {
    id: 'compliance-essentials',
    name: 'Compliance Essentials',
    description:
      'Get your compliance house in order — HIPAA policies, consent management, US Core profiles, and data quality tools.',
    icon: '',
    listingIds: [
      'us-core-content-pack',
      'compliance-content-pack',
      'consent-management-template',
      'data-quality-prompt',
    ],
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

export function getListingById(id: string): MarketplaceListing | undefined {
  return listings.find((l) => l.id === id);
}

export function getVendorById(id: string): Vendor | undefined {
  return vendors[id];
}

export function getCollectionById(id: string): Collection | undefined {
  return collections.find((c) => c.id === id);
}

export function getListingsForVendor(vendorId: string): MarketplaceListing[] {
  return listings.filter((l) => l.vendor.id === vendorId);
}

export function getListingsForCollection(collectionId: string): MarketplaceListing[] {
  const collection = getCollectionById(collectionId);
  if (!collection) {
    return [];
  }
  return collection.listingIds.map((id) => getListingById(id)).filter(Boolean) as MarketplaceListing[];
}

export const allCategories: string[] = Array.from(new Set(listings.flatMap((l) => l.categories))).sort();

export const allTypes: string[] = Array.from(new Set(listings.map((l) => l.type))).sort();

export const allVendors: Vendor[] = Object.values(vendors).sort((a, b) => a.name.localeCompare(b.name));

// ─── Display name mapping ───────────────────────────────────────────────────

/** Maps internal ListingType values to user-facing display names */
export const typeDisplayNames: Record<string, string> = {
  'Agent Prompt / Skill': 'Agent Prompt / Skill',
  'App': 'App',
  'Automation': 'Automation',
  'Content Pack': 'Data & Content',
  'Service Provider': 'Service Provider',
  'Template': 'Templates',
};

/** Plural display names for browse page titles and "See all" labels */
export const typeBrowseLabels: Record<string, string> = {
  'Agent Prompt / Skill': 'Agent Prompts & Skills',
  'App': 'Apps',
  'Automation': 'Automations',
  'Content Pack': 'Data & Content',
  'Service Provider': 'Service Providers',
  'Template': 'Templates',
};

export const typeBadgeColor: Record<string, string> = {
  'App': 'blue',
  'Automation': 'teal',
  'Template': 'violet',
  'Content Pack': 'orange',
  'Agent Prompt / Skill': 'pink',
  'Service Provider': 'cyan',
  'Collections': 'grape',
};

/** Per-listing icon overrides — takes precedence over typeIconComponent when set */
export const listingIconComponent: Record<string, typeof IconApps> = {
  'carebridge-dashboard': IconChartBar,
  'telehealth-bridge': IconVideo,
  'growth-chart-app': IconChartLine,
};

/** Maps listing types to their icon components */
export const typeIconComponent: Record<string, typeof IconApps> = {
  'Agent Prompt / Skill': IconBrain,
  'App': IconApps,
  'Automation': IconRobot,
  'Content Pack': IconDatabase,
  'Service Provider': IconUsersGroup,
  'Template': IconLayout,
  'Collections': IconPackages,
};
