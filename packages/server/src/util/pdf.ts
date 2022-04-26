import { assertOk } from '@medplum/core';
import { Binary } from '@medplum/fhirtypes';
import { resolve } from 'path';
import PdfPrinter from 'pdfmake';
import { ContentTable, CustomTableLayout, TDocumentDefinitions } from 'pdfmake/interfaces';
import { PassThrough } from 'stream';
import { Repository } from '../fhir/repo';
import { getBinaryStorage } from '../fhir/storage';

const tableLayouts: { [key: string]: CustomTableLayout } = {
  medplumNoBorders: {
    hLineWidth: () => 0,
    vLineWidth: () => 0,
    paddingLeft: () => 0,
    paddingRight: () => 0,
    paddingTop: () => 0,
    paddingBottom: () => 0,
  },
  medplumMetadata: {
    hLineWidth: () => 1,
    vLineWidth: () => 0,
    hLineColor: (i: number) => (i === 0 ? 'black' : 'white'),
    paddingLeft: () => 0,
    paddingRight: () => 0,
    paddingTop: () => 1,
    paddingBottom: () => 1,
  },
  medplumObservations: {
    hLineWidth: (i: number, node: ContentTable) => (i === 0 || i === node.table?.body.length ? 2 : 1),
    vLineWidth: () => 0,
    hLineColor: (i: number, node: ContentTable) => (i <= 1 || i === node.table?.body.length ? 'black' : '#999'),
    fillColor: (row: number) => (row > 0 ? '#eee' : null),
    paddingLeft: () => 0,
    paddingRight: () => 0,
    paddingTop: () => 0,
    paddingBottom: () => 0,
  },
};

export async function createPdf(
  repo: Repository,
  filename: string | undefined,
  docDefinition: TDocumentDefinitions
): Promise<Binary> {
  if (!repo) {
    throw new Error('Missing repository');
  }

  if (!docDefinition) {
    throw new Error('Missing document definition');
  }

  // Setup standard fonts
  // See: https://pdfmake.github.io/docs/0.1/fonts/standard-14-fonts/
  const fonts = {
    Helvetica: {
      normal: 'Helvetica',
      bold: 'Helvetica-Bold',
      italics: 'Helvetica-Oblique',
      bolditalics: 'Helvetica-BoldOblique',
    },
    Avenir: {
      normal: resolve(__dirname, '../../fonts/avenir.ttf'),
    },
  };

  // Setup sane defaults
  // See: https://pdfmake.github.io/docs/0.1/document-definition-object/styling/
  docDefinition.pageSize = docDefinition.pageSize || 'LETTER';
  docDefinition.pageMargins = docDefinition.pageMargins || [60, 60, 60, 60];
  docDefinition.pageOrientation = docDefinition.pageOrientation || 'portrait';
  docDefinition.defaultStyle = docDefinition.defaultStyle || {};
  docDefinition.defaultStyle.font = docDefinition.defaultStyle.font || 'Helvetica';
  docDefinition.defaultStyle.fontSize = docDefinition.defaultStyle.fontSize || 11;
  docDefinition.defaultStyle.lineHeight = docDefinition.defaultStyle.lineHeight || 2.0;

  const contentType = 'application/pdf';
  const [outcome, binary] = await repo.createResource<Binary>({
    resourceType: 'Binary',
    contentType,
  });
  assertOk(outcome, binary);

  // Setup the stream
  const stream = new PassThrough();

  // Start the stream consumer
  // This will write to S3 or the file system as the bytes come in
  const writePromise = getBinaryStorage().writeBinary(binary, filename, contentType, stream);

  // Start the stream producer
  // This will print the PDF to the stream buffer
  const printer = new PdfPrinter(fonts);
  const pdfDoc = printer.createPdfKitDocument(docDefinition, { tableLayouts });
  pdfDoc.pipe(stream);
  pdfDoc.end();

  // Wait for the stream to finish
  await writePromise;

  // Return the binary resource
  return binary;
}
