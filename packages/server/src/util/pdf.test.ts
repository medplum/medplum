// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { TDocumentDefinitions } from 'pdfmake/interfaces';
import { createPdf } from './pdf';

describe('createPdf', () => {
  test('creates a basic PDF with default fonts', async () => {
    const docDefinition: TDocumentDefinitions = {
      content: [
        {
          text: 'Test Document',
          font: 'Helvetica',
          style: 'header',
        },
        {
          text: 'This is a paragraph of text.',
          font: 'Helvetica',
        },
      ],
    };

    const pdfBuffer = await createPdf(docDefinition);

    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(0);
    expect(pdfBuffer.toString().substring(0, 5)).toBe('%PDF-'); // Check PDF header
  });
});
