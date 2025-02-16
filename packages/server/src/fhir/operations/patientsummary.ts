import { allOk, createReference, LOINC, resolveId } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import {
  Bundle,
  Composition,
  CompositionSection,
  Observation,
  OperationDefinition,
  Patient,
  Resource,
  Task,
} from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { getLogger } from '../../logger';
import { Repository } from '../repo';
import { getPatientEverything, PatientEverythingParameters } from './patienteverything';
import { parseInputParameters } from './utils/parameters';

// International Patient Summary Implementation Guide
// https://build.fhir.org/ig/HL7/fhir-ips/index.html

// Patient summary operation
// https://build.fhir.org/ig/HL7/fhir-ips/OperationDefinition-summary.html

const operation: OperationDefinition = {
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
    {
      name: 'identifier',
      use: 'in',
      min: 0,
      max: '1',
      type: 'string',
      searchType: 'token',
    },
    {
      name: 'profile',
      use: 'in',
      min: 0,
      max: '1',
      type: 'canonical',
    },
    {
      name: 'return',
      use: 'out',
      min: 0,
      max: '1',
      type: 'Bundle',
    },
  ],
};

export interface PatientSummaryParameters extends PatientEverythingParameters {
  identifier?: string;
  profile?: string;
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

  // First read the patient to verify access
  const patient = await ctx.repo.readResource<Patient>('Patient', id);

  // Then read all of the patient data
  const bundle = await getPatientSummary(ctx.repo, patient, params);

  return [allOk, bundle];
}

/**
 * Executes the Patient $summary operation.
 * Searches for all resources related to the patient.
 * @param repo - The repository.
 * @param patient - The root patient.
 * @param params - The operation input parameters.
 * @returns The patient summary search result bundle.
 */
export async function getPatientSummary(
  repo: Repository,
  patient: Patient,
  params?: PatientSummaryParameters
): Promise<Bundle> {
  const everythingBundle = await getPatientEverything(repo, patient, params);
  const everything = (everythingBundle.entry?.map((e) => e.resource) ?? []) as Resource[];
  const builder = new PatientSummaryBuilder(patient, everything);
  return builder.build();
}

/**
 * Builder for the Patient Summary.
 *
 * The main complexity is in the choice of which section to put each resource.
 */
export class PatientSummaryBuilder {
  private allergies: Resource[] = [];
  private medications: Resource[] = [];
  private problemList: Resource[] = [];
  private results: Resource[] = [];
  private socialHistory: Resource[] = [];
  private vitalSigns: Resource[] = [];
  private procedures: Resource[] = [];
  private planOfTreatment: Resource[] = [];
  private immunizations: Resource[] = [];
  private nestedIds = new Set<string>();

  constructor(
    readonly patient: Patient,
    readonly everything: Resource[]
  ) {}

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
    }
  }

  /**
   * Chooses the section for each resource.
   * Nested resources are not included in sections directly.
   */
  private chooseSectionForResources(): void {
    for (const resource of this.everything) {
      if (this.nestedIds.has(resource.id as string)) {
        break;
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
      case 'Condition':
        this.problemList.push(resource);
        break;
      case 'DiagnosticReport':
        this.results.push(resource);
        break;
      case 'Goal':
        this.planOfTreatment.push(resource);
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
      case 'Observation':
        this.chooseSectionForObservation(resource);
        break;
      case 'Task':
        this.chooseSectionForTask(resource);
        break;

      default:
        getLogger().debug('Unsupported resource type in Patient Summary', { resourceType: resource.resourceType });
    }
  }

  private chooseSectionForObservation(obs: Observation): void {
    const categoryCode =
      obs.category?.find(
        (category) => category.coding?.[0]?.system === 'http://terminology.hl7.org/CodeSystem/observation-category'
      )?.coding?.[0]?.code || '';
    switch (categoryCode) {
      case 'social-history':
        this.socialHistory.push(obs);
        break;
      case 'vital-signs':
        this.vitalSigns.push(obs);
        break;
      case 'imaging':
        this.results.push(obs);
        break;
      case 'laboratory':
        this.results.push(obs);
        break;
      case 'procedure':
        this.procedures.push(obs);
        break;
      case 'survey':
        this.planOfTreatment.push(obs);
        break;
      case 'exam':
        this.procedures.push(obs);
        break;
      case 'therapy':
        this.medications.push(obs);
        break;
      case 'activity':
        this.results.push(obs);
        break;
      default:
        this.results.push(obs);
        break;
    }
  }

  private chooseSectionForTask(task: Task): void {
    if (task.status === 'completed') {
      this.procedures.push(task);
    } else {
      this.planOfTreatment.push(task);
    }
  }

  private buildComposition(): Composition {
    // Composition profile
    // https://build.fhir.org/ig/HL7/fhir-ips/StructureDefinition-Composition-uv-ips.html

    // Minimal example
    // https://build.fhir.org/ig/HL7/fhir-ips/Composition-composition-minimal.json.html

    const composition: Composition = {
      resourceType: 'Composition',
      status: 'final',
      type: {
        coding: [
          {
            system: 'http://loinc.org',
            code: '60591-5',
            display: 'Patient summary Document',
          },
        ],
      },
      subject: createReference(this.patient),
      date: new Date().toISOString(),
      author: [{ display: 'Medplum' }],
      title: 'Medical Summary',
      confidentiality: 'N',
      section: [
        createSection('48765-2', 'Allergies', this.allergies),
        createSection('11369-6', 'Immunizations', this.immunizations),
        createSection('10160-0', 'Medications', this.medications),
        createSection('11450-4', 'Problem List', this.problemList),
        createSection('30954-2', 'Results', this.results),
        createSection('29762-2', 'Social History', this.socialHistory),
        createSection('8716-3', 'Vital Signs', this.vitalSigns),
        createSection('47519-4', 'Procedures', this.procedures),
        createSection('18776-5', 'Plan of Treatment', this.planOfTreatment),
      ],
    };
    return composition;
  }

  private buildBundle(composition: Composition): Bundle {
    const allResources = [composition, this.patient, ...this.everything];

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
}

function createSection(code: string, title: string, entry: Resource[]): CompositionSection {
  return {
    title,
    code: { coding: [{ system: LOINC, code }] },
    text: { status: 'generated', div: `<div xmlns="http://www.w3.org/1999/xhtml">${title}</div>` },
    entry: entry.map(createReference),
  };
}
