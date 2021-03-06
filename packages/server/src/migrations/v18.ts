/*
 * Generated by @medplum/generator
 * Do not edit manually.
 */

import { PoolClient } from 'pg';

export async function run(client: PoolClient): Promise<void> {
  await client.query(`ALTER TABLE "ActivityDefinition"
      ALTER COLUMN "context" TYPE TEXT[] USING '{}'::TEXT[],
      ALTER COLUMN "contextQuantity" TYPE DOUBLE PRECISION[] USING '{}'::DOUBLE PRECISION[]`);
  await client.query(`ALTER TABLE "CapabilityStatement"
      ALTER COLUMN "context" TYPE TEXT[] USING '{}'::TEXT[],
      ALTER COLUMN "contextQuantity" TYPE DOUBLE PRECISION[] USING '{}'::DOUBLE PRECISION[]`);
  await client.query(`ALTER TABLE "CarePlan"
      ALTER COLUMN "activityDate" TYPE DATE[] USING '{}'::DATE[]`);
  await client.query(`ALTER TABLE "ChargeItem"
      ALTER COLUMN "occurrence" TYPE TIMESTAMP WITH TIME ZONE USING NULL`);
  await client.query(`ALTER TABLE "ChargeItemDefinition"
      ALTER COLUMN "context" TYPE TEXT[] USING '{}'::TEXT[],
      ALTER COLUMN "contextQuantity" TYPE DOUBLE PRECISION[] USING '{}'::DOUBLE PRECISION[]`);
  await client.query(`ALTER TABLE "CodeSystem"
      ALTER COLUMN "context" TYPE TEXT[] USING '{}'::TEXT[],
      ALTER COLUMN "contextQuantity" TYPE DOUBLE PRECISION[] USING '{}'::DOUBLE PRECISION[]`);
  await client.query(`ALTER TABLE "CommunicationRequest"
      ALTER COLUMN "occurrence" TYPE TIMESTAMP WITH TIME ZONE USING NULL`);
  await client.query(`ALTER TABLE "CompartmentDefinition"
      ALTER COLUMN "context" TYPE TEXT[] USING '{}'::TEXT[],
      ALTER COLUMN "contextQuantity" TYPE DOUBLE PRECISION[] USING '{}'::DOUBLE PRECISION[]`);
  await client.query(`ALTER TABLE "Composition"
      ALTER COLUMN "relatedId" TYPE TEXT[] USING '{}'::TEXT[],
      ALTER COLUMN "relatedRef" TYPE TEXT[] USING '{}'::TEXT[]`);
  await client.query(`ALTER TABLE "ConceptMap"
      ALTER COLUMN "context" TYPE TEXT[] USING '{}'::TEXT[],
      ALTER COLUMN "contextQuantity" TYPE DOUBLE PRECISION[] USING '{}'::DOUBLE PRECISION[]`);
  await client.query(`ALTER TABLE "Condition"
      ALTER COLUMN "abatementAge" TYPE DOUBLE PRECISION USING NULL,
      ALTER COLUMN "abatementDate" TYPE TIMESTAMP WITH TIME ZONE USING NULL,
      ALTER COLUMN "onsetAge" TYPE DOUBLE PRECISION USING NULL,
      ALTER COLUMN "onsetDate" TYPE TIMESTAMP WITH TIME ZONE USING NULL`);
  await client.query(`ALTER TABLE "DetectedIssue"
      ALTER COLUMN "identified" TYPE TIMESTAMP WITH TIME ZONE USING NULL`);
  await client.query(`ALTER TABLE "DeviceRequest"
      ALTER COLUMN "eventDate" TYPE TIMESTAMP WITH TIME ZONE USING NULL`);
  await client.query(`ALTER TABLE "DiagnosticReport"
      ALTER COLUMN "date" TYPE TIMESTAMP WITH TIME ZONE USING NULL`);
  await client.query(`ALTER TABLE "EffectEvidenceSynthesis"
      ALTER COLUMN "context" TYPE TEXT[] USING '{}'::TEXT[],
      ALTER COLUMN "contextQuantity" TYPE DOUBLE PRECISION[] USING '{}'::DOUBLE PRECISION[]`);
  await client.query(`ALTER TABLE "EventDefinition"
      ALTER COLUMN "context" TYPE TEXT[] USING '{}'::TEXT[],
      ALTER COLUMN "contextQuantity" TYPE DOUBLE PRECISION[] USING '{}'::DOUBLE PRECISION[]`);
  await client.query(`ALTER TABLE "Evidence"
      ALTER COLUMN "context" TYPE TEXT[] USING '{}'::TEXT[],
      ALTER COLUMN "contextQuantity" TYPE DOUBLE PRECISION[] USING '{}'::DOUBLE PRECISION[]`);
  await client.query(`ALTER TABLE "EvidenceVariable"
      ALTER COLUMN "context" TYPE TEXT[] USING '{}'::TEXT[],
      ALTER COLUMN "contextQuantity" TYPE DOUBLE PRECISION[] USING '{}'::DOUBLE PRECISION[]`);
  await client.query(`ALTER TABLE "ExampleScenario"
      ALTER COLUMN "context" TYPE TEXT[] USING '{}'::TEXT[],
      ALTER COLUMN "contextQuantity" TYPE DOUBLE PRECISION[] USING '{}'::DOUBLE PRECISION[]`);
  await client.query(`ALTER TABLE "Goal"
      ALTER COLUMN "startDate" TYPE DATE USING NULL,
      ALTER COLUMN "targetDate" TYPE DATE[] USING '{}'::DATE[]`);
  await client.query(`ALTER TABLE "GraphDefinition"
      ALTER COLUMN "context" TYPE TEXT[] USING '{}'::TEXT[],
      ALTER COLUMN "contextQuantity" TYPE DOUBLE PRECISION[] USING '{}'::DOUBLE PRECISION[]`);
  await client.query(`ALTER TABLE "Group"
      ALTER COLUMN "value" TYPE TEXT[] USING '{}'::TEXT[]`);
  await client.query(`ALTER TABLE "Immunization"
      ALTER COLUMN "date" TYPE TIMESTAMP WITH TIME ZONE USING NULL`);
  await client.query(`ALTER TABLE "ImplementationGuide"
      ALTER COLUMN "context" TYPE TEXT[] USING '{}'::TEXT[],
      ALTER COLUMN "contextQuantity" TYPE DOUBLE PRECISION[] USING '{}'::DOUBLE PRECISION[]`);
  await client.query(`ALTER TABLE "Library"
      ALTER COLUMN "context" TYPE TEXT[] USING '{}'::TEXT[],
      ALTER COLUMN "contextQuantity" TYPE DOUBLE PRECISION[] USING '{}'::DOUBLE PRECISION[]`);
  await client.query(`ALTER TABLE "Measure"
      ALTER COLUMN "context" TYPE TEXT[] USING '{}'::TEXT[],
      ALTER COLUMN "contextQuantity" TYPE DOUBLE PRECISION[] USING '{}'::DOUBLE PRECISION[]`);
  await client.query(`ALTER TABLE "Media"
      ALTER COLUMN "created" TYPE TIMESTAMP WITH TIME ZONE USING NULL`);
  await client.query(`ALTER TABLE "Medication"
      ALTER COLUMN "ingredient" TYPE TEXT[] USING '{}'::TEXT[],
      ALTER COLUMN "ingredientCode" TYPE TEXT[] USING '{}'::TEXT[]`);
  await client.query(`ALTER TABLE "MedicationAdministration"
      ALTER COLUMN "effectiveTime" TYPE TIMESTAMP WITH TIME ZONE USING NULL`);
  await client.query(`ALTER TABLE "MedicationKnowledge"
      ALTER COLUMN "ingredient" TYPE TEXT[] USING '{}'::TEXT[],
      ALTER COLUMN "ingredientCode" TYPE TEXT[] USING '{}'::TEXT[]`);
  await client.query(`ALTER TABLE "MedicationStatement"
      ALTER COLUMN "effective" TYPE TIMESTAMP WITH TIME ZONE USING NULL`);
  await client.query(`ALTER TABLE "MessageDefinition"
      ALTER COLUMN "context" TYPE TEXT[] USING '{}'::TEXT[],
      ALTER COLUMN "contextQuantity" TYPE DOUBLE PRECISION[] USING '{}'::DOUBLE PRECISION[]`);
  await client.query(`ALTER TABLE "NamingSystem"
      ALTER COLUMN "context" TYPE TEXT[] USING '{}'::TEXT[],
      ALTER COLUMN "contextQuantity" TYPE DOUBLE PRECISION[] USING '{}'::DOUBLE PRECISION[]`);
  await client.query(`ALTER TABLE "Observation"
      ALTER COLUMN "date" TYPE TIMESTAMP WITH TIME ZONE USING NULL,
      ALTER COLUMN "comboValueQuantity" TYPE DOUBLE PRECISION USING NULL,
      ALTER COLUMN "componentValueConcept" TYPE TEXT[] USING '{}'::TEXT[],
      ALTER COLUMN "componentValueQuantity" TYPE DOUBLE PRECISION[] USING '{}'::DOUBLE PRECISION[],
      ALTER COLUMN "valueDate" TYPE DATE USING NULL,
      ALTER COLUMN "valueQuantity" TYPE DOUBLE PRECISION USING NULL`);
  await client.query(`ALTER TABLE "OperationDefinition"
      ALTER COLUMN "context" TYPE TEXT[] USING '{}'::TEXT[],
      ALTER COLUMN "contextQuantity" TYPE DOUBLE PRECISION[] USING '{}'::DOUBLE PRECISION[]`);
  await client.query(`ALTER TABLE "Patient"
      ALTER COLUMN "deathDate" TYPE DATE USING NULL,
      ALTER COLUMN "deceased" TYPE BOOLEAN USING NULL`);
  await client.query(`ALTER TABLE "PlanDefinition"
      ALTER COLUMN "context" TYPE TEXT[] USING '{}'::TEXT[],
      ALTER COLUMN "contextQuantity" TYPE DOUBLE PRECISION[] USING '{}'::DOUBLE PRECISION[],
      ALTER COLUMN "definition" TYPE TEXT[] USING '{}'::TEXT[]`);
  await client.query(`ALTER TABLE "Procedure"
      ALTER COLUMN "date" TYPE TIMESTAMP WITH TIME ZONE USING NULL`);
  await client.query(`ALTER TABLE "Provenance"
      ALTER COLUMN "when" TYPE DATE USING NULL`);
  await client.query(`ALTER TABLE "Questionnaire"
      ALTER COLUMN "context" TYPE TEXT[] USING '{}'::TEXT[],
      ALTER COLUMN "contextQuantity" TYPE DOUBLE PRECISION[] USING '{}'::DOUBLE PRECISION[]`);
  await client.query(`ALTER TABLE "ResearchDefinition"
      ALTER COLUMN "context" TYPE TEXT[] USING '{}'::TEXT[],
      ALTER COLUMN "contextQuantity" TYPE DOUBLE PRECISION[] USING '{}'::DOUBLE PRECISION[]`);
  await client.query(`ALTER TABLE "ResearchElementDefinition"
      ALTER COLUMN "context" TYPE TEXT[] USING '{}'::TEXT[],
      ALTER COLUMN "contextQuantity" TYPE DOUBLE PRECISION[] USING '{}'::DOUBLE PRECISION[]`);
  await client.query(`ALTER TABLE "RiskAssessment"
      ALTER COLUMN "date" TYPE TIMESTAMP WITH TIME ZONE USING NULL,
      ALTER COLUMN "probability" TYPE DOUBLE PRECISION[] USING '{}'::DOUBLE PRECISION[]`);
  await client.query(`ALTER TABLE "RiskEvidenceSynthesis"
      ALTER COLUMN "context" TYPE TEXT[] USING '{}'::TEXT[],
      ALTER COLUMN "contextQuantity" TYPE DOUBLE PRECISION[] USING '{}'::DOUBLE PRECISION[]`);
  await client.query(`ALTER TABLE "SearchParameter"
      ALTER COLUMN "context" TYPE TEXT[] USING '{}'::TEXT[],
      ALTER COLUMN "contextQuantity" TYPE DOUBLE PRECISION[] USING '{}'::DOUBLE PRECISION[]`);
  await client.query(`ALTER TABLE "ServiceRequest"
      ALTER COLUMN "occurrence" TYPE TIMESTAMP WITH TIME ZONE USING NULL`);
  await client.query(`ALTER TABLE "Specimen"
      ALTER COLUMN "collected" TYPE TIMESTAMP WITH TIME ZONE USING NULL`);
  await client.query(`ALTER TABLE "StructureDefinition"
      ALTER COLUMN "context" TYPE TEXT[] USING '{}'::TEXT[],
      ALTER COLUMN "contextQuantity" TYPE DOUBLE PRECISION[] USING '{}'::DOUBLE PRECISION[]`);
  await client.query(`ALTER TABLE "StructureMap"
      ALTER COLUMN "context" TYPE TEXT[] USING '{}'::TEXT[],
      ALTER COLUMN "contextQuantity" TYPE DOUBLE PRECISION[] USING '{}'::DOUBLE PRECISION[]`);
  await client.query(`ALTER TABLE "Substance"
      ALTER COLUMN "substanceReference" TYPE TEXT[] USING '{}'::TEXT[]`);
  await client.query(`ALTER TABLE "TerminologyCapabilities"
      ALTER COLUMN "context" TYPE TEXT[] USING '{}'::TEXT[],
      ALTER COLUMN "contextQuantity" TYPE DOUBLE PRECISION[] USING '{}'::DOUBLE PRECISION[]`);
  await client.query(`ALTER TABLE "TestScript"
      ALTER COLUMN "context" TYPE TEXT[] USING '{}'::TEXT[],
      ALTER COLUMN "contextQuantity" TYPE DOUBLE PRECISION[] USING '{}'::DOUBLE PRECISION[]`);
  await client.query(`ALTER TABLE "ValueSet"
      ALTER COLUMN "context" TYPE TEXT[] USING '{}'::TEXT[],
      ALTER COLUMN "contextQuantity" TYPE DOUBLE PRECISION[] USING '{}'::DOUBLE PRECISION[]`);
}
