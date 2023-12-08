import { StructureDefinition } from '@medplum/fhirtypes';
import { getOperationDefinition } from './definitions';
import { Request, Response } from 'express';
import { getAuthenticatedContext } from '../../context';
import { parseInputParameters, sendOutputParameters } from './utils/parameters';
import { OperationOutcomeError, Operator, allOk, badRequest, isResourceType } from '@medplum/core';
import { sendOutcome } from '../outcomes';
import { sushiImport, sushiExport, fhirdefs, utils } from 'fsh-sushi';
import * as gofsh from 'gofsh/dist/index';

const operation = getOperationDefinition('StructureDefinition', 'snapshot');

type SnapshotParameters = {
  url?: string;
};

export async function snapshotHandler(req: Request, res: Response): Promise<void> {
  const ctx = getAuthenticatedContext();
  const params = parseInputParameters<SnapshotParameters>(operation, req);

  let def: StructureDefinition | undefined;
  if (req.params.id) {
    def = await ctx.repo.readResource<StructureDefinition>('StructureDefinition', req.params.id);
  } else if (params.url) {
    def = await ctx.repo.searchOne<StructureDefinition>({
      resourceType: 'StructureDefinition',
      filters: [{ code: 'url', operator: Operator.EQUALS, value: params.url }],
      sortRules: [{ code: 'version', descending: true }],
    });
  }
  if (!def) {
    sendOutcome(res, badRequest('No StructureDefinition specified'));
    return;
  }

  if (!def.snapshot?.element?.length) {
    // Generate profile snapshot
    const docs = await resolveDependencies(await fhirToFsh(def));
    const tank = new sushiImport.FSHTank(docs, {
      FSHOnly: true,
      fhirVersion: ['4.0.1'],
      canonical: 'http://example.com/fsh',
    });
    const baseDefs = new fhirdefs.FHIRDefinitions();
    await utils.loadAutomaticDependencies('4.0.1', [], baseDefs);
    await utils.loadExternalDependencies(baseDefs, { fhirVersion: ['4.0.1'], canonical: 'http://example.com' });
    const compiled = sushiExport.exportFHIR(tank, baseDefs);
    const profile = compiled.profiles.pop();
    def = { ...def, snapshot: (profile?.toJSON(true) as StructureDefinition).snapshot };
    await ctx.repo.updateResource(def);
  }
  await sendOutputParameters(operation, res, allOk, def);
}

async function resolveDependencies(docs: sushiImport.FSHDocument[]): Promise<sushiImport.FSHDocument[]> {
  const ctx = getAuthenticatedContext();
  const deps: sushiImport.FSHDocument[] = [];
  for (const d of docs) {
    deps.push(d);
    for (const profile of d.profiles.values()) {
      if (profile.parent) {
        if (isResourceType(profile.parent)) {
          continue;
        }
        const parent = await ctx.repo.searchOne<StructureDefinition>({
          resourceType: 'StructureDefinition',
          filters: [{ code: 'url', operator: Operator.EQUALS, value: profile.parent }],
          sortRules: [{ code: 'version', descending: true }],
        });
        if (!parent) {
          throw new OperationOutcomeError(badRequest('Unable to locate profile dependency: ' + profile.parent));
        }
        deps.push(...(await resolveDependencies(await fhirToFsh(parent))));
      }
    }
  }
  return deps;
}

async function fhirToFsh(def: StructureDefinition): Promise<sushiImport.FSHDocument[]> {
  const fsh = await gofsh.gofshClient.fhirToFsh([def], { style: 'string', logLevel: 'silent' });
  return sushiImport.importText([new sushiImport.RawFSH(fsh.fsh as string)]);
}
