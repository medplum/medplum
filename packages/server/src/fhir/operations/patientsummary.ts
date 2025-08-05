// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  LOINC_ALLERGIES_SECTION,
  LOINC_ASSESSMENTS_SECTION,
  LOINC_DEVICES_SECTION,
  LOINC_ENCOUNTERS_SECTION,
  LOINC_GOALS_SECTION,
  LOINC_HEALTH_CONCERNS_SECTION,
  LOINC_IMMUNIZATIONS_SECTION,
  LOINC_MEDICATIONS_SECTION,
  LOINC_NOTE_DOCUMENT,
  LOINC_NOTES_SECTION,
  LOINC_PATIENT_SUMMARY_DOCUMENT,
  LOINC_PLAN_OF_TREATMENT_SECTION,
  LOINC_PROBLEMS_SECTION,
  LOINC_PROCEDURES_SECTION,
  LOINC_REASON_FOR_REFERRAL_SECTION,
  LOINC_RESULTS_SECTION,
  LOINC_SOCIAL_HISTORY_SECTION,
  LOINC_VITAL_SIGNS_SECTION,
} from '@medplum/ccda';
import {
  allOk,
  createReference,
  escapeHtml,
  formatCodeableConcept,
  formatDate,
  formatObservationValue,
  generateId,
  HTTP_TERMINOLOGY_HL7_ORG,
  LOINC,
  resolveId,
  WithId,
} from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import {
  AllergyIntolerance,
  Bundle,
  CarePlan,
  ClinicalImpression,
  CodeableConcept,
  Composition,
  CompositionEvent,
  CompositionSection,
  Condition,
  DeviceUseStatement,
  DiagnosticReport,
  Encounter,
  Goal,
  Immunization,
  MedicationRequest,
  Observation,
  OperationDefinition,
  OperationDefinitionParameter,
  Organization,
  Patient,
  Practitioner,
  PractitionerRole,
  Procedure,
  Reference,
  Resource,
  ResourceType,
  ServiceRequest,
} from '@medplum/fhirtypes';
import { AuthenticatedRequestContext, getAuthenticatedContext } from '../../context';
import { getLogger } from '../../logger';
import { getPatientEverything, PatientEverythingParameters } from './patienteverything';
import { parseInputParameters } from './utils/parameters';

export const OBSERVATION_CATEGORY_SYSTEM = `${HTTP_TERMINOLOGY_HL7_ORG}/CodeSystem/observation-category`;

// International Patient Summary Implementation Guide
// https://build.fhir.org/ig/HL7/fhir-ips/index.html

// Patient summary operation
// https://build.fhir.org/ig/HL7/fhir-ips/OperationDefinition-summary.html

export const operation = {
  resourceType: 'OperationDefinition',
  id: 'summary',
  name: 'IpsSummary',
  title: 'IPS Summary',
  status: 'active',
  kind: 'operation',
  affectsState: false,
  code: 'summary',
  resource: ['Patient'],
  system: false,
  type: true,
  instance: true,
  parameter: [
    ['author', 'in', 0, 1, 'Reference'],
    ['authoredOn', 'in', 0, 1, 'instant'],
    ['start', 'in', 0, 1, 'date'],
    ['end', 'in', 0, 1, 'date'],
    ['_since', 'in', 0, 1, 'instant'],
    ['identifier', 'in', 0, 1, 'string'],
    ['profile', 'in', 0, 1, 'canonical'],
    ['return', 'out', 0, 1, 'Bundle'],
  ].map(([name, use, min, max, type]) => ({ name, use, min, max, type }) as OperationDefinitionParameter),
} satisfies OperationDefinition;

const resourceTypes: ResourceType[] = [
  'AllergyIntolerance',
  'CarePlan',
  'ClinicalImpression',
  'Condition',
  'DeviceUseStatement',
  'DiagnosticReport',
  'Encounter',
  'Goal',
  'Immunization',
  'MedicationRequest',
  'Observation',
  'Procedure',
  'ServiceRequest',
];

export type CompositionAuthorResource = Practitioner | PractitionerRole | Organization;

export interface PatientSummaryParameters extends PatientEverythingParameters {
  author?: Reference<CompositionAuthorResource>;
  authoredOn?: string;
}

/**
 * Handles a Patient summary request.
 * Searches for all resources related to the patient.
 * @param req - The FHIR request.
 * @returns The FHIR response.
 */
export async function patientSummaryHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  const { id } = req.params;
  const params = parseInputParameters<PatientSummaryParameters>(operation, req);
  const bundle = await getPatientSummary(ctx, { reference: `Patient/${id}` }, params);
  return [allOk, bundle];
}

/**
 * Executes the Patient $summary operation.
 * Searches for all resources related to the patient.
 * @param ctx - The authenticated request context.
 * @param patientRef - The patient reference.
 * @param params - The operation input parameters.
 * @returns The patient summary search result bundle.
 */
export async function getPatientSummary(
  ctx: AuthenticatedRequestContext,
  patientRef: Reference<Patient>,
  params: PatientSummaryParameters = {}
): Promise<Bundle> {
  const repo = ctx.repo;
  const authorRef = (params.author ? params.author : ctx.profile) as Reference<CompositionAuthorResource>;
  const author = await repo.readReference(authorRef);
  const patient = await repo.readReference(patientRef);
  params._type = resourceTypes;
  const everythingBundle = await getPatientEverything(repo, patient, params);
  const everything = (everythingBundle.entry?.map((e) => e.resource) ?? []) as WithId<Resource>[];
  const builder = new PatientSummaryBuilder(author, patient, everything, params);
  return builder.build();
}

export type ResultResourceType = DiagnosticReport | Observation;
export type PlanResourceType = CarePlan | Goal | ServiceRequest;

/**
 * Builder for the Patient Summary.
 *
 * The main complexity is in the choice of which section to put each resource.
 */
export class PatientSummaryBuilder {
  private readonly author: CompositionAuthorResource;
  private readonly patient: Patient;
  private readonly everything: WithId<Resource>[];
  private readonly params: PatientSummaryParameters;
  private readonly allergies: AllergyIntolerance[] = [];
  private readonly medications: MedicationRequest[] = [];
  private readonly problemList: Condition[] = [];
  private readonly results: ResultResourceType[] = [];
  private readonly socialHistory: Observation[] = [];
  private readonly vitalSigns: Observation[] = [];
  private readonly procedures: Procedure[] = [];
  private readonly encounters: Encounter[] = [];
  private readonly assessments: ClinicalImpression[] = [];
  private readonly planOfTreatment: PlanResourceType[] = [];
  private readonly immunizations: Immunization[] = [];
  private readonly devices: DeviceUseStatement[] = [];
  private readonly goals: Goal[] = [];
  private readonly healthConcerns: Condition[] = [];
  private readonly notes: ClinicalImpression[] = [];
  private readonly reasonForReferral: ServiceRequest[] = [];
  private readonly nestedIds = new Set<string>();

  constructor(
    author: CompositionAuthorResource,
    patient: Patient,
    everything: WithId<Resource>[],
    params: PatientSummaryParameters = {}
  ) {
    this.author = author;
    this.patient = patient;
    this.everything = everything;
    this.params = params;
  }

  build(): Bundle {
    this.buildNestedIds();
    this.chooseSectionForResources();
    return this.buildBundle(this.buildComposition());
  }

  /**
   * Builds a set of nested IDs for resources that are members of other resources.
   * Nested resources are not included in sections directly.
   * For example, observations that are members of other observations.
   * Or observations that are members of diagnostic reports.
   */
  private buildNestedIds(): void {
    for (const resource of this.everything) {
      if (resource.resourceType === 'Observation' && resource.hasMember) {
        for (const member of resource.hasMember) {
          if (member.reference) {
            this.nestedIds.add(resolveId(member) as string);
          }
        }
      }

      if (resource.resourceType === 'DiagnosticReport' && resource.result) {
        for (const result of resource.result) {
          if (result.reference) {
            this.nestedIds.add(resolveId(result) as string);
          }
        }
      }

      if (resource.resourceType === 'CarePlan' && resource.activity) {
        for (const activity of resource.activity) {
          if (activity.reference?.reference) {
            this.nestedIds.add(resolveId(activity.reference) as string);
          }
        }
      }

      if (resource.resourceType === 'Encounter' && resource.diagnosis) {
        for (const diagnosis of resource.diagnosis) {
          if (diagnosis.condition?.reference) {
            this.nestedIds.add(resolveId(diagnosis.condition) as string);
          }
        }
      }
    }
  }

  /**
   * Chooses the section for each resource.
   * Nested resources are not included in sections directly.
   */
  private chooseSectionForResources(): void {
    for (const resource of this.everything) {
      if (this.nestedIds.has(resource.id)) {
        continue;
      }
      this.chooseSectionForResource(resource);
    }
  }

  /**
   * Chooses the section for a resource.
   * This is the most ambiguous part of the summary builder, because there are no rules.
   * The objective is to do a reasonable job, and create a framework for future improvements.
   * @param resource - The resource to choose a section for.
   */
  private chooseSectionForResource(resource: Resource): void {
    switch (resource.resourceType) {
      // Simple resource types - add to section directly
      case 'AllergyIntolerance':
        this.allergies.push(resource);
        break;
      case 'CarePlan':
        this.planOfTreatment.push(resource);
        break;
      case 'DeviceUseStatement':
        this.devices.push(resource);
        break;
      case 'DiagnosticReport':
        this.results.push(resource);
        break;
      case 'Encounter':
        this.encounters.push(resource);
        break;
      case 'Goal':
        this.goals.push(resource);
        break;
      case 'Immunization':
        this.immunizations.push(resource);
        break;
      case 'MedicationRequest':
        this.medications.push(resource);
        break;
      case 'Procedure':
        this.procedures.push(resource);
        break;

      // Complex resource types - choose section based on resource type
      case 'ClinicalImpression':
        this.chooseSectionForClinicalImpression(resource);
        break;
      case 'Condition':
        this.chooseSectionForCondition(resource);
        break;
      case 'Observation':
        this.chooseSectionForObservation(resource);
        break;
      case 'ServiceRequest':
        this.chooseSectionForServiceRequest(resource);
        break;

      default:
        getLogger().debug('Unsupported resource type in Patient Summary', { resourceType: resource.resourceType });
    }
  }

  private chooseSectionForClinicalImpression(clinicalImpression: ClinicalImpression): void {
    const code = clinicalImpression.code?.coding?.[0]?.code;
    if (code === LOINC_NOTE_DOCUMENT) {
      this.notes.push(clinicalImpression);
    } else {
      this.assessments.push(clinicalImpression);
    }
  }

  private chooseSectionForCondition(condition: Condition): void {
    const categoryCode = findCategoryBySystem(condition.category, LOINC);
    if (categoryCode === LOINC_HEALTH_CONCERNS_SECTION) {
      this.healthConcerns.push(condition);
    } else {
      this.problemList.push(condition);
    }
  }

  private chooseSectionForObservation(obs: Observation): void {
    const categoryCode = findCategoryBySystem(obs.category, OBSERVATION_CATEGORY_SYSTEM);
    switch (categoryCode) {
      case 'social-history':
        this.socialHistory.push(obs);
        break;
      case 'vital-signs':
        this.vitalSigns.push(obs);
        break;
      default:
        this.results.push(obs);
        break;
    }
  }

  private chooseSectionForServiceRequest(serviceRequest: ServiceRequest): void {
    const code = serviceRequest.code?.coding?.[0]?.code;
    if (code === '310449005') {
      // Note from Chart Lux Consulting:
      // USCDI v3 comment - the value set for this referral code is over 1000 entries and code is required - simple approach could be to offer a few options
      // for user to choose from; here are 3 common ones (referral to hospital is in 315.b.1 test data)
      // 310449005 - Referral to hospital
      // 44383000 - Patient referral for consultation
      // 103696004 - Patient referral to specialist
      this.reasonForReferral.push(serviceRequest);
    } else {
      this.planOfTreatment.push(serviceRequest);
    }
  }

  private buildComposition(): Composition {
    // Composition profile
    // https://build.fhir.org/ig/HL7/fhir-ips/StructureDefinition-Composition-uv-ips.html

    // Minimal example
    // https://build.fhir.org/ig/HL7/fhir-ips/Composition-composition-minimal.json.html

    const composition: Composition = {
      resourceType: 'Composition',
      id: generateId(),
      status: 'final',
      type: { coding: [{ system: LOINC, code: LOINC_PATIENT_SUMMARY_DOCUMENT, display: 'Patient Summary' }] },
      subject: createReference(this.patient),
      date: this.params.authoredOn ?? new Date().toISOString(),
      author: [createReference(this.author)],
      title: 'Medical Summary',
      confidentiality: 'N',
      custodian: this.patient.managingOrganization,
      event: this.buildEvent(),
      section: [
        this.createAllergiesSection(),
        this.createImmunizationsSection(),
        this.createMedicationsSection(),
        this.createProblemListSection(),
        this.createResultsSection(),
        this.createSocialHistorySection(),
        this.createVitalSignsSection(),
        this.createProceduresSection(),
        this.createEncountersSection(),
        this.createDevicesSection(),
        this.createAssessmentsSection(),
        this.createPlanOfTreatmentSection(),
        this.createGoalsSection(),
        this.createHealthConcernsSection(),
        this.createNotesSection(),
        this.createReasonForReferralSection(),
      ].filter(Boolean) as CompositionSection[],
    };
    return composition;
  }

  private buildEvent(): CompositionEvent[] | undefined {
    let start: string | undefined = undefined;
    let end: string | undefined = undefined;

    for (const resource of this.everything) {
      if (resource.meta?.lastUpdated) {
        if (!start || resource.meta.lastUpdated < start) {
          start = resource.meta.lastUpdated;
        }
        if (!end || resource.meta.lastUpdated > end) {
          end = resource.meta.lastUpdated;
        }
      }
    }

    if (!start && !end) {
      return undefined;
    }

    return [
      {
        period: {
          start,
          end,
        },
      },
    ];
  }

  private createAllergiesSection(): CompositionSection {
    return createSection(
      LOINC_ALLERGIES_SECTION,
      'Allergies',
      createTable(
        ['Substance', 'Reaction', 'Severity', 'Status'],
        this.allergies.map((a) => [
          formatCodeableConcept(a.code),
          formatCodeableConcept(a.reaction?.[0]?.manifestation?.[0]),
          a.reaction?.[0]?.severity,
          formatCodeableConcept(a.clinicalStatus),
        ])
      ),
      this.allergies
    );
  }

  private createImmunizationsSection(): CompositionSection {
    return createSection(
      LOINC_IMMUNIZATIONS_SECTION,
      'Immunizations',
      createTable(
        ['Vaccine', 'Date', 'Status'],
        this.immunizations.map((i) => [
          formatCodeableConcept(i.vaccineCode),
          formatDate(i.occurrenceDateTime),
          i.status,
        ])
      ),
      this.immunizations
    );
  }

  private createMedicationsSection(): CompositionSection {
    return createSection(
      LOINC_MEDICATIONS_SECTION,
      'Medications',
      createTable(
        ['Medication', 'Directions', 'Start Date', 'End Date'],
        this.medications.map((m) => [
          formatCodeableConcept(m.medicationCodeableConcept),
          m.dosageInstruction?.[0]?.text,
          formatDate(m.dispenseRequest?.validityPeriod?.start),
          formatDate(m.dispenseRequest?.validityPeriod?.end),
        ])
      ),
      this.medications
    );
  }

  private createProblemListSection(): CompositionSection {
    return createSection(
      LOINC_PROBLEMS_SECTION,
      'Problem List',
      createTable(
        ['Problem', 'Start Date', 'Status'],
        this.problemList.map((p) => [
          formatCodeableConcept(p.code),
          formatDate(p.onsetDateTime),
          formatCodeableConcept(p.clinicalStatus),
        ])
      ),
      this.problemList
    );
  }

  private createResultsSection(): CompositionSection {
    return createSection(LOINC_RESULTS_SECTION, 'Results', this.buildResultTable(this.results), this.results);
  }

  private createSocialHistorySection(): CompositionSection {
    return createSection(
      LOINC_SOCIAL_HISTORY_SECTION,
      'Social History',
      this.buildResultTable(this.socialHistory),
      this.socialHistory
    );
  }

  private createVitalSignsSection(): CompositionSection {
    return createSection(
      LOINC_VITAL_SIGNS_SECTION,
      'Vital Signs',
      this.buildResultTable(this.vitalSigns),
      this.vitalSigns
    );
  }

  private createProceduresSection(): CompositionSection {
    return createSection(
      LOINC_PROCEDURES_SECTION,
      'Procedures',
      createTable(
        ['Procedure', 'Date', 'Target Site', 'Status'],
        this.procedures.map((p) => [
          formatCodeableConcept(p.code),
          formatDate(p.performedDateTime),
          formatCodeableConcept(p.bodySite?.[0]),
          p.status,
        ])
      ),
      this.procedures
    );
  }

  private createEncountersSection(): CompositionSection {
    return createSection(
      LOINC_ENCOUNTERS_SECTION,
      'Encounters',
      createTable(
        ['Encounter', 'Date', 'Type', 'Status'],
        this.encounters.map((e) => [
          formatCodeableConcept(e.type?.[0]),
          formatDate(e.period?.start),
          formatCodeableConcept(e.reasonCode?.[0]),
          e.status,
        ])
      ),
      this.encounters
    );
  }

  private createDevicesSection(): CompositionSection {
    return createSection(
      LOINC_DEVICES_SECTION,
      'Devices',
      createTable(
        ['Device', 'Status'],
        this.devices.map((dus) => {
          const device = this.getByReference(dus.device);
          return [formatCodeableConcept(device?.type), dus.status];
        })
      ),
      this.devices
    );
  }

  private createAssessmentsSection(): CompositionSection {
    return createSection(
      LOINC_ASSESSMENTS_SECTION,
      'Assessments',
      createTable(
        ['Summary', 'Date'],
        this.assessments.map((a) => [a.summary, formatDate(a.date)])
      ),
      this.assessments
    );
  }

  private createPlanOfTreatmentSection(): CompositionSection {
    return createSection(
      LOINC_PLAN_OF_TREATMENT_SECTION,
      'Plan of Treatment',
      this.buildPlanTable(this.planOfTreatment),
      this.planOfTreatment
    );
  }

  private createGoalsSection(): CompositionSection | undefined {
    if (this.goals.length === 0) {
      return undefined;
    }

    return createSection(
      LOINC_GOALS_SECTION,
      'Goals',
      createTable(
        ['Goal', 'Date'],
        this.goals.map((g) => [formatCodeableConcept(g.description), formatDate(g.startDate)])
      ),
      this.goals
    );
  }

  private createHealthConcernsSection(): CompositionSection | undefined {
    if (this.healthConcerns.length === 0) {
      return undefined;
    }

    return createSection(
      LOINC_HEALTH_CONCERNS_SECTION,
      'Health Concerns',
      createTable(
        ['Concern', 'Start Date', 'Status'],
        this.healthConcerns.map((p) => [
          formatCodeableConcept(p.code),
          formatDate(p.onsetDateTime),
          formatCodeableConcept(p.clinicalStatus),
        ])
      ),
      this.healthConcerns
    );
  }

  private createNotesSection(): CompositionSection | undefined {
    if (this.notes.length === 0) {
      return undefined;
    }

    return createSection(
      LOINC_NOTES_SECTION,
      'Notes',
      createTable(
        ['Note', 'Date'],
        this.notes.map((n) => [n.summary, formatDate(n.date)])
      ),
      this.notes
    );
  }

  private createReasonForReferralSection(): CompositionSection | undefined {
    if (this.reasonForReferral.length === 0) {
      return undefined;
    }

    return createSection(
      LOINC_REASON_FOR_REFERRAL_SECTION,
      'Reason for Referral',
      this.buildPlanTable(this.reasonForReferral),
      this.reasonForReferral
    );
  }

  private buildResultTable(resources: ResultResourceType[]): string {
    const rows: (string | undefined)[][] = [];
    for (const r of resources) {
      this.buildResultRows(rows, r);
    }
    return createTable(['Name', 'Result', 'Date'], rows);
  }

  private buildResultRows(rows: (string | undefined)[][], resource: ResultResourceType): void {
    if (resource.resourceType === 'DiagnosticReport') {
      this.buildDiagnosticReportRow(rows, resource);
    }

    if (resource.resourceType === 'Observation') {
      this.buildObservationRow(rows, resource);
    }
  }

  private buildDiagnosticReportRow(rows: (string | undefined)[][], resource: DiagnosticReport): void {
    rows.push([formatCodeableConcept(resource.code), undefined, formatDate(resource.effectiveDateTime)]);
    if (resource.result) {
      for (const result of resource.result) {
        const r = this.getByReference(result);
        if (r && r.resourceType === 'Observation') {
          this.buildResultRows(rows, r);
        }
      }
    }
  }

  private buildObservationRow(rows: (string | undefined)[][], resource: Observation): void {
    rows.push([
      formatCodeableConcept(resource.code),
      formatObservationValue(resource),
      formatDate(resource.effectiveDateTime),
    ]);

    if (resource.hasMember) {
      for (const member of resource.hasMember) {
        const m = this.getByReference(member);
        if (m && m.resourceType === 'Observation') {
          this.buildResultRows(rows, m);
        }
      }
    }
  }

  private buildPlanTable(resources: PlanResourceType[]): string {
    const rows: (string | undefined)[][] = [];
    for (const r of resources) {
      this.buildPlanRows(rows, r);
    }
    return createTable(['Planned Care', 'Start Date'], rows);
  }

  private buildPlanRows(rows: (string | undefined)[][], resource: PlanResourceType): void {
    if (resource.resourceType === 'CarePlan') {
      rows.push([formatCodeableConcept(resource.category?.[0]), formatDate(resource.period?.start)]);
      if (resource.activity) {
        for (const activity of resource.activity) {
          const a = this.getByReference(activity.reference);
          if (a && a.resourceType === 'ServiceRequest') {
            rows.push([formatCodeableConcept(a.code), formatDate(a.authoredOn)]);
          }
        }
      }
    }
    if (resource.resourceType === 'Goal') {
      rows.push([formatCodeableConcept(resource.description), formatDate(resource.target?.[0]?.dueDate)]);
    }
    if (resource.resourceType === 'ServiceRequest') {
      rows.push([formatCodeableConcept(resource.code), formatDate(resource.authoredOn)]);
    }
  }

  private buildBundle(composition: Composition): Bundle {
    const allResources = [composition, this.patient, this.author, ...this.everything];

    // See International Patient Summary Implementation Guide
    // Bundle - Minimal Complete IPS - JSON Representation
    // https://build.fhir.org/ig/HL7/fhir-ips/Bundle-bundle-minimal.json.html
    const bundle: Bundle = {
      resourceType: 'Bundle',
      type: 'document',
      timestamp: new Date().toISOString(),
      entry: allResources.map((resource) => ({ resource })),
    };

    return bundle;
  }

  private getByReference<T extends Resource>(ref: Reference<T> | undefined): T | undefined {
    if (!ref?.reference) {
      return undefined;
    }
    return this.everything.find((r) => r.id === resolveId(ref)) as T;
  }
}

function createTable(headings: string[], body: (string | undefined)[][]): string {
  if (body.length === 0) {
    return '';
  }

  const html = ['<table border="1" width="100%"><thead><tr>'];
  for (const h of headings) {
    html.push('<th>');
    html.push(escapeHtml(h));
    html.push('</th>');
  }
  html.push('</tr></thead><tbody>');
  for (const row of body) {
    html.push('<tr>');
    for (const cell of row) {
      html.push('<td>');
      if (cell) {
        html.push(escapeHtml(cell));
      }
      html.push('</td>');
    }
    html.push('</tr>');
  }
  html.push('</tbody></table>');
  return html.join('');
}

function createSection(code: string, title: string, html: string, entry: Resource[]): CompositionSection {
  return {
    title,
    code: { coding: [{ system: LOINC, code }] },
    text: { status: 'generated', div: `<div xmlns="http://www.w3.org/1999/xhtml">${html}</div>` },
    entry: entry.map(createReference),
  };
}

function findCategoryBySystem(categories: CodeableConcept[] | undefined, system: string): string | undefined {
  if (!categories) {
    return undefined;
  }
  for (const category of categories) {
    if (!category.coding) {
      continue;
    }
    for (const coding of category.coding) {
      if (coding.system === system) {
        return coding.code;
      }
    }
  }
  return undefined;
}
