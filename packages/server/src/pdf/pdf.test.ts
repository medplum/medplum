import { createPdf } from '../pdf/pdf';
import { TDocumentDefinitions } from 'pdfmake/interfaces';

describe('createPdf', () => {
  test('creates a basic PDF with default fonts', async () => {
    const docDefinition: TDocumentDefinitions = {
      content: [
        {
          text: 'Test Document',
          style: 'header',
        },
        {
          text: 'This is a paragraph of text.',
        },
      ],
    };

    const pdfBuffer = await createPdf(docDefinition);

    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(0);
    expect(pdfBuffer.toString().substring(0, 5)).toBe('%PDF-'); // Check PDF header
  });

  test('creates PDF with custom fonts', async () => {
    // Define custom fonts
    const customFonts = {
      Avenir: {
        normal: 'fonts/Avenir/Avenir.ttf',
      },
    };

    // Create document definition using custom fonts
    const docDefinition: TDocumentDefinitions = {
      content: [
        {
          text: 'Heading with Avenir',
          font: 'Avenir',
          fontSize: 18,
        },
        {
          text: 'Normal text with Avenir',
          font: 'Avenir',
          fontSize: 12,
        },
      ],
    };

    const pdfBuffer = await createPdf(docDefinition, undefined, customFonts);

    // Assertions
    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(0);
    expect(pdfBuffer.toString().substring(0, 5)).toBe('%PDF-');
  });
});
