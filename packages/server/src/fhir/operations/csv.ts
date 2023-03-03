import {
  badRequest,
  evalFhirPath,
  formatAddress,
  formatHumanName,
  isResourceType,
  parseSearchRequest,
} from '@medplum/core';
import {
  Address,
  BundleEntry,
  CodeableConcept,
  ContactPoint,
  HumanName,
  Reference,
  ResourceType,
} from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { sendOutcome } from '../outcomes';
import { Repository } from '../repo';
import { getSearchParameter } from '../structure';

/**
 * Handles a CSV export request.
 * @param req The HTTP request.
 * @param res The HTTP response.
 */
export async function csvHandler(req: Request, res: Response): Promise<void> {
  const { resourceType } = req.params as { resourceType: ResourceType };
  const query = req.query as Record<string, string[] | string | undefined>;

  const fields = query['_fields'] as string;
  delete query['_fields'];

  if (!fields) {
    sendOutcome(res, badRequest('Missing _fields parameter'));
    return;
  }

  if (!isResourceType(resourceType)) {
    sendOutcome(res, badRequest('Unsupported resource type'));
    return;
  }

  const columnNames: string[] = [];
  const expressions: string[] = [];

  for (const field of fields.split(',')) {
    columnNames.push(field);
    const searchParam = getSearchParameter(resourceType, field);
    if (searchParam) {
      expressions.push(searchParam.expression as string);
    } else {
      expressions.push(field);
    }
  }

  const repo = res.locals.repo as Repository;
  const searchRequest = parseSearchRequest(resourceType, query);
  searchRequest.count = 10000;
  const bundle = await repo.search(searchRequest);
  const output: string[][] = [];

  // Header row
  output.push(columnNames);

  // For each resource...
  for (const entry of bundle.entry as BundleEntry[]) {
    const row: string[] = [];

    // For each column...
    for (const expression of expressions) {
      const values = evalFhirPath(expression, entry.resource);
      if (values.length > 0) {
        row.push(csvEscape(values[0]));
      } else {
        row.push('');
      }
    }

    output.push(row);
  }

  // Build the final CSV content
  // Add the BOM (byte order marker) to identify the file as UTF-8.
  const content = '\uFEFF' + output.map((row) => row.join(',')).join('\n');

  // Respond with the CSV content
  // Use Content-Disposition to force file download
  res.type('text/csv').set('Content-Disposition', 'attachment; filename=export.csv').send(content);
}

function csvEscape(input: unknown): string {
  if (!input) {
    // Null, undefined, and empty string
    return '';
  }

  if (typeof input === 'string') {
    return csvEscapeString(input);
  }

  if (typeof input === 'number' || typeof input === 'boolean') {
    return input.toString();
  }

  if (typeof input === 'object') {
    if ('city' in input) {
      // Address
      return csvEscapeString(formatAddress(input as Address));
    }
    if ('family' in input) {
      // HumanName
      return csvEscapeString(formatHumanName(input as HumanName));
    }
    if ('value' in input) {
      // ContactPoint
      return csvEscapeString((input as ContactPoint).value as string);
    }
    if ('display' in input) {
      // Reference
      return csvEscapeString((input as Reference).display as string);
    }
    if ('coding' in input) {
      // CodeableConcept
      const coding = (input as CodeableConcept).coding;
      if (coding?.[0]?.display) {
        return csvEscapeString(coding[0].display);
      }
      if (coding?.[0]?.code) {
        return csvEscapeString(coding[0].code);
      }
    }
    if ('text' in input) {
      // CodeableConcept
      return csvEscapeString((input as CodeableConcept).text as string);
    }
  }

  // ???
  return '';
}

function csvEscapeString(input: string): string {
  return '"' + input.replace(/"/g, '""') + '"';
}
