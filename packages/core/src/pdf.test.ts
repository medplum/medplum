import { generatePdf } from './pdf';

describe('PDF', () => {
  test('Generate PDF client side', async () => {
    const getBlob = jest.fn((cb: (blob: Blob) => void) => cb(new Blob()));
    const createPdf = jest.fn(() => ({ getBlob }));
    window.pdfMake = { createPdf } as any;

    const result = await generatePdf({
      content: ['Hello World'],
      defaultStyle: {
        font: 'Helvetica',
      },
    });
    expect(result).toBeDefined();
  });

  test('Generate PDF server side', async () => {
    window.pdfMake = undefined as any;
    const result = await generatePdf({
      content: ['Hello World'],
      defaultStyle: {
        font: 'Helvetica',
      },
    });
    expect(result).toBeDefined();
  });
});
