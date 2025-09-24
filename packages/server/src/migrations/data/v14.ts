// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { PoolClient } from 'pg';
import { prepareCustomMigrationJobData, runCustomMigration } from '../../workers/post-deploy-migration';
import * as fns from '../migrate-functions';
import { withLongRunningDatabaseClient } from '../migration-utils';
import { MigrationActionResult } from '../types';
import { CustomPostDeployMigration } from './types';

export const migration: CustomPostDeployMigration = {
  type: 'custom',
  prepareJobData: (asyncJob) => prepareCustomMigrationJobData(asyncJob),
  run: async (repo, job, jobData) => {
    return runCustomMigration(repo, job, jobData, async () => {
      return withLongRunningDatabaseClient(async (client) => {
        const results: MigrationActionResult[] = [];
        await run(client, results);
        return results;
      });
    });
  },
};

// prettier-ignore
async function run(client: PoolClient, results: MigrationActionResult[]): Promise<void> {
  await fns.query(client, results, `ALTER TABLE IF EXISTS "ActivityDefinition" DROP COLUMN IF EXISTS "context"`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "Binary" DROP COLUMN IF EXISTS "__tokens"`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "Binary" DROP COLUMN IF EXISTS "__tokensText"`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "Binary" DROP COLUMN IF EXISTS "___securitySort"`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "Binary" DROP COLUMN IF EXISTS "___tagSort"`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "Binary" DROP COLUMN IF EXISTS "___compartmentIdentifierSort"`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "Binary" DROP COLUMN IF EXISTS "__sharedTokens"`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "Binary" DROP COLUMN IF EXISTS "__sharedTokensText"`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "Binary" DROP COLUMN IF EXISTS "___tag"`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "Binary" DROP COLUMN IF EXISTS "___tagText"`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "Binary" DROP COLUMN IF EXISTS "compartments"`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "CapabilityStatement" DROP COLUMN IF EXISTS "context"`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "ChargeItemDefinition" DROP COLUMN IF EXISTS "context"`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "CodeSystem" DROP COLUMN IF EXISTS "context"`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "CompartmentDefinition" DROP COLUMN IF EXISTS "context"`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "Composition" DROP COLUMN IF EXISTS "relatedId"`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "ConceptMap" DROP COLUMN IF EXISTS "context"`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "DeviceRequest" DROP COLUMN IF EXISTS "code"`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "EffectEvidenceSynthesis" DROP COLUMN IF EXISTS "context"`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "EventDefinition" DROP COLUMN IF EXISTS "context"`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "Evidence" DROP COLUMN IF EXISTS "context"`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "EvidenceVariable" DROP COLUMN IF EXISTS "context"`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "ExampleScenario" DROP COLUMN IF EXISTS "context"`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "GraphDefinition" DROP COLUMN IF EXISTS "context"`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "Group" DROP COLUMN IF EXISTS "value"`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "ImplementationGuide" DROP COLUMN IF EXISTS "context"`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "Library" DROP COLUMN IF EXISTS "context"`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "Measure" DROP COLUMN IF EXISTS "context"`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "Medication" DROP COLUMN IF EXISTS "ingredientCode"`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "MedicationAdministration" DROP COLUMN IF EXISTS "code"`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "MedicationDispense" DROP COLUMN IF EXISTS "code"`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "MedicationKnowledge" DROP COLUMN IF EXISTS "ingredientCode"`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "MedicationRequest" DROP COLUMN IF EXISTS "code"`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "MedicationStatement" DROP COLUMN IF EXISTS "code"`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "MessageDefinition" DROP COLUMN IF EXISTS "context"`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "NamingSystem" DROP COLUMN IF EXISTS "context"`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "Observation" DROP COLUMN IF EXISTS "comboValueConcept"`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "Observation" DROP COLUMN IF EXISTS "componentValueConcept"`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "Observation" DROP COLUMN IF EXISTS "valueConcept"`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "OperationDefinition" DROP COLUMN IF EXISTS "context"`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "PlanDefinition" DROP COLUMN IF EXISTS "context"`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "Questionnaire" DROP COLUMN IF EXISTS "context"`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "ResearchDefinition" DROP COLUMN IF EXISTS "context"`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "ResearchElementDefinition" DROP COLUMN IF EXISTS "context"`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "RiskEvidenceSynthesis" DROP COLUMN IF EXISTS "context"`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "SearchParameter" DROP COLUMN IF EXISTS "context"`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "StructureDefinition" DROP COLUMN IF EXISTS "context"`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "StructureMap" DROP COLUMN IF EXISTS "context"`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "TerminologyCapabilities" DROP COLUMN IF EXISTS "context"`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "TestScript" DROP COLUMN IF EXISTS "context"`);
  await fns.query(client, results, `ALTER TABLE IF EXISTS "ValueSet" DROP COLUMN IF EXISTS "context"`);
}
