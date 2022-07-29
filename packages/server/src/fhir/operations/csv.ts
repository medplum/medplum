import { badRequest, evalFhirPath, formatAddress, formatHumanName } from '@medplum/core';
import { Address, BundleEntry, CodeableConcept, ContactPoint, HumanName, Reference } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { sendOutcome } from '../outcomes';
import { Repository } from '../repo';
import { parseSearchRequest } from '../search';

const resourceTypeColumns: Record<string, Record<string, string>> = {
  Patient: {
    ID: 'id',
    'Last Updated': 'meta.lastUpdated',
    Name: 'name',
    'Birth Date': 'birthDate',
    Gender: 'gender',
    Address: 'address',
    Phone: "telecom.where(system='phone')",
    Email: "telecom.where(system='email')",
  },
  ServiceRequest: {
    ID: 'id',
    'Last Updated': 'meta.lastUpdated',
    Patient: 'subject',
    Code: 'code.coding',
    Status: 'status',
    'Order Detail': 'orderDetail',
  },
};

/**
 * Handles a CSV export request.
 * @param req The HTTP request.
 * @param res The HTTP response.
 */
export async function csvHandler(req: Request, res: Response): Promise<void> {
  const { resourceType } = req.params;

  const columns = resourceTypeColumns[resourceType];
  if (!columns) {
    sendOutcome(res, badRequest('Unsupported resource type'));
    return;
  }

  const repo = res.locals.repo as Repository;
  const query = req.query as Record<string, string[] | string | undefined>;
  const searchRequest = parseSearchRequest(resourceType, query);
  searchRequest.count = 10000;
  const bundle = await repo.search(searchRequest);

  const columnEntries = Object.entries(columns);
  const output: string[][] = [];

  // Header row
  output.push(columnEntries.map((entry) => entry[0]));

  // For each resource...
  for (const entry of bundle.entry as BundleEntry[]) {
    const row: string[] = [];

    // For each column...
    for (const [_, column] of columnEntries) {
      const values = evalFhirPath(column, entry.resource);
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
