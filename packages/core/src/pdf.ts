/*
 * This file attempts a unified "generatePdf" function that works both client-side and server-side.
 * On client-side, it checks for a global "pdfMake" variable.
 * On server-side, it dynamically loads "pdfmake" from the node_modules.
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
/** @ts-ignore */
import type { createPdf } from 'pdfmake/build/pdfmake';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
/** @ts-ignore */
import type { CustomTableLayout, TDocumentDefinitions, TFontDictionary } from 'pdfmake/interfaces';

/**
 * Optional pdfmake global.
 * On client-side, the user is expected to have loaded pdfmake via <script> tag.
 * If pdfmake is avaiable, this global will be defined.
 * See: https://www.npmjs.com/package/pdfmake
 */
declare const pdfMake: { createPdf: typeof createPdf };

export async function generatePdf(
  docDefinition: TDocumentDefinitions,
  tableLayouts?: { [name: string]: CustomTableLayout },
  fonts?: TFontDictionary
): Promise<Blob | Uint8Array> {
  // Setup sane defaults
  // See: https://pdfmake.github.io/docs/0.1/document-definition-object/styling/
  docDefinition.pageSize = docDefinition.pageSize || 'LETTER';
  docDefinition.pageMargins = docDefinition.pageMargins || [60, 60, 60, 60];
  docDefinition.pageOrientation = docDefinition.pageOrientation || 'portrait';
  docDefinition.defaultStyle = docDefinition.defaultStyle || {};
  docDefinition.defaultStyle.font = docDefinition.defaultStyle.font || 'Helvetica';
  docDefinition.defaultStyle.fontSize = docDefinition.defaultStyle.fontSize || 11;
  docDefinition.defaultStyle.lineHeight = docDefinition.defaultStyle.lineHeight || 2.0;

  if (typeof pdfMake === 'undefined') {
    return generatePdfServerSide(docDefinition, tableLayouts, fonts);
  } else {
    return generatePdfClientSide(docDefinition, tableLayouts, fonts);
  }
}

async function generatePdfServerSide(
  docDefinition: TDocumentDefinitions,
  tableLayouts?: { [name: string]: CustomTableLayout },
  fonts?: TFontDictionary
): Promise<Uint8Array> {
  if (!fonts) {
    fonts = {
      Helvetica: {
        normal: 'Helvetica',
        bold: 'Helvetica-Bold',
        italics: 'Helvetica-Oblique',
        bolditalics: 'Helvetica-BoldOblique',
      },
      Roboto: {
        normal: 'https://static.medplum.com/fonts/Roboto-Regular.ttf',
        bold: 'https://static.medplum.com/fonts/Roboto-Medium.ttf',
        italics: 'https://static.medplum.com/fonts/Roboto-Italic.ttf',
        bolditalics: 'https://static.medplum.com/fonts/Roboto-MediumItalic.ttf',
      },
      Avenir: {
        normal: 'https://static.medplum.com/fonts/avenir.ttf',
      },
    };
  }
  return new Promise<Uint8Array>((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const PdfPrinter = require('pdfmake');
    const printer = new PdfPrinter(fonts);
    const pdfDoc = printer.createPdfKitDocument(docDefinition, { tableLayouts });
    const chunks: Uint8Array[] = [];
    pdfDoc.on('data', (chunk: Uint8Array) => chunks.push(chunk));
    pdfDoc.on('end', () => resolve(concat(chunks)));
    pdfDoc.on('error', reject);
    pdfDoc.end();
  });
}

async function generatePdfClientSide(
  docDefinition: TDocumentDefinitions,
  tableLayouts?: { [name: string]: CustomTableLayout },
  fonts?: TFontDictionary
): Promise<Blob> {
  if (!fonts) {
    fonts = {
      Helvetica: {
        normal: 'https://static.medplum.com/fonts/Helvetica.ttf',
        bold: 'https://static.medplum.com/fonts/Helvetica-bold.ttf',
        italics: 'https://static.medplum.com/fonts/Helvetica-italic.ttf',
        bolditalics: 'https://static.medplum.com/fonts/Helvetica-bold-italic.ttf',
      },
      Roboto: {
        normal: 'https://static.medplum.com/fonts/Roboto-Regular.ttf',
        bold: 'https://static.medplum.com/fonts/Roboto-Medium.ttf',
        italics: 'https://static.medplum.com/fonts/Roboto-Italic.ttf',
        bolditalics: 'https://static.medplum.com/fonts/Roboto-MediumItalic.ttf',
      },
      Avenir: {
        normal: 'https://static.medplum.com/fonts/avenir.ttf',
      },
    };
  }
  return new Promise((resolve: (blob: Blob) => void) => {
    pdfMake.createPdf(docDefinition, tableLayouts, fonts).getBlob(resolve);
  });
}

/**
 * Concatenates an array of Uint8Arrays into a single Uint8Array.
 * @param arrays An array of arrays of bytes.
 * @returns A single array of bytes.
 */
function concat(arrays: Uint8Array[]): Uint8Array {
  let len = 0;
  for (const array of arrays) {
    len += array.length;
  }
  const result = new Uint8Array(len);
  let index = 0;
  for (const array of arrays) {
    result.set(array, index);
    index += array.length;
  }
  return result;
}
