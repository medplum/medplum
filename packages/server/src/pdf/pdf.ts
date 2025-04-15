import { TDocumentDefinitions, TFontDictionary, CustomTableLayout } from 'pdfmake/interfaces';
import PdfPrinter from 'pdfmake';

/**
 * Generates a PDF buffer from a document definition.
 *
 * @param docDefinition - The PDF document definition.
 * @param tableLayouts - Optional custom table layouts.
 * @param fonts - Optional custom fonts (uses default fonts if not provided).
 * @returns Promise that resolves to a Buffer containing the PDF.
 */
export function createPdf(
  docDefinition: TDocumentDefinitions,
  tableLayouts?: Record<string, CustomTableLayout>,
  fonts?: TFontDictionary
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const defaultFonts = {
      Roboto: {
        normal: 'fonts/Roboto/Roboto-Regular.ttf',
        bold: 'fonts/Roboto/Roboto-Medium.ttf',
        italics: 'fonts/Roboto/Roboto-Italic.ttf',
        bolditalics: 'fonts/Roboto/Roboto-MediumItalic.ttf',
      },
    };

    const printer = new PdfPrinter(fonts || defaultFonts);
    const pdfDoc = printer.createPdfKitDocument(docDefinition, { tableLayouts });
    const chunks: Uint8Array[] = [];
    pdfDoc.on('data', (chunk: Uint8Array) => chunks.push(chunk));
    pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
    pdfDoc.on('error', reject);
    pdfDoc.end();
  });
}
