import {
  badRequest,
  evalFhirPath,
  formatAddress,
  formatHumanName,
  getSearchParameter,
  isResourceType,
  OperationOutcomeError,
  parseSearchRequest,
} from '@medplum/core';
import {
  Address,
  CodeableConcept,
  ContactPoint,
  HumanName,
  Reference,
  Resource,
  ResourceType,
} from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { getAuthenticatedContext } from '../../context';
import { sendOutcome } from '../outcomes';

/**
 * Handles a CSV export request.
 * @param req - The HTTP request.
 * @param res - The HTTP response.
 */
export async function csvHandler(req: Request, res: Response): Promise<void> {
  const ctx = getAuthenticatedContext();
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

  const searchRequest = parseSearchRequest(resourceType, query);
  searchRequest.count = 1000;
  const resources = await ctx.repo.searchResources(searchRequest);
  const output: string[][] = [];

  // Header row
  output.push(columnNames);

  // For each resource...
  for (const resource of resources) {
    const row: string[] = [];

    // For each column...
    for (const expression of expressions) {
      const values = tryEvalFhirPath(expression, resource);
      if (values.length > 0) {
        row.push(tryCsvEscape(values[0]));
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

function tryEvalFhirPath(expression: string, resource: Resource): unknown[] {
  try {
    return evalFhirPath(expression, resource);
  } catch (err) {
    throw new OperationOutcomeError(badRequest('Invalid FHIRPath expression'), err);
  }
}

function tryCsvEscape(input: unknown): string {
  try {
    return csvEscape(input);
  } catch (_err) {
    // Silently ignore malformed data in projects that do not use "strict" mode
    return '';
  }
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

// CSV Injection, also known as Formula Injection, occurs when websites embed untrusted input inside CSV files.
// See: https://owasp.org/www-community/attacks/CSV_Injection
const CSV_INJECTION_CHARS = ['=', '+', '-', '@'];

function csvEscapeString(input: string): string {
  let result = input.trim().replace(/"/g, '""');
  if (result.length > 0 && CSV_INJECTION_CHARS.includes(result[0])) {
    result = "'" + result;
  }
  return `"${result}"`;
}
