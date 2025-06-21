import packageJson from '../../../package.json';

export const FISSION_PACKAGE_JSON = `{
  "name": "medplum-fission-bot",
  "version": "${packageJson.version}",
  "dependencies": {
    "@medplum/bot-layer": "${packageJson.version}"
  }
}
`;

export const FISSION_INDEX_CODE = `
const { ContentType, Hl7Message, MedplumClient, normalizeOperationOutcome } = require('@medplum/core');
const fetch = require('node-fetch');
const PdfPrinter = require('pdfmake');
const userCode = require('./user.js');

module.exports = async function (context) {
  try {
    const event = context.request.body;
    const { bot, baseUrl, accessToken, contentType, secrets, traceId, headers } = event;
    const medplum = new MedplumClient({
      baseUrl,
      fetch: function (url, options = {}) {
        options.headers ||= {};
        options.headers['x-trace-id'] = traceId;
        options.headers['traceparent'] = traceId;
        return fetch(url, options);
      },
      createPdf,
    });
    medplum.setAccessToken(accessToken);
    let input = event.input;
    if (contentType === ContentType.HL7_V2 && input) {
      input = Hl7Message.parse(input);
    }
    let result = await userCode.handler(medplum, {
      bot,
      input,
      contentType,
      secrets,
      traceId,
      headers,
    });
    if (contentType === ContentType.HL7_V2 && result) {
      result = result.toString();
    }
    if (typeof result !== 'string') {
      result = JSON.stringify(result, undefined, 2);
    }
    return {
      status: 200,
      body: result,
    };
  } catch (err) {
    if (err instanceof Error) {
      console.log('Unhandled error: ' + err.message + '\\n' + err.stack);
    } else if (typeof err === 'object') {
      console.log('Unhandled error: ' + JSON.stringify(err, undefined, 2));
    } else {
      console.log('Unhandled error: ' + err);
    }
    return {
      status: 400,
      body: JSON.stringify(normalizeOperationOutcome(err)),
    };
  }
};

function createPdf(docDefinition, tableLayouts, fonts) {
  if (!fonts) {
    fonts = {
      Helvetica: {
        normal: 'Helvetica',
        bold: 'Helvetica-Bold',
        italics: 'Helvetica-Oblique',
        bolditalics: 'Helvetica-BoldOblique',
      },
    };
  }
  return new Promise((resolve, reject) => {
    const printer = new PdfPrinter(fonts);
    const pdfDoc = printer.createPdfKitDocument(docDefinition, {
      tableLayouts,
    });
    const chunks = [];
    pdfDoc.on('data', (chunk) => chunks.push(chunk));
    pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
    pdfDoc.on('error', reject);
    pdfDoc.end();
  });
}
`;
