import { GCPBlobStorage } from '../src/storage';
import { Binary } from '@medplum/fhirtypes';
import { PassThrough } from 'stream';

describe('Pruebas de Integración para GCPBlobStorage', () => {
  // Asegúrate de haber configurado GOOGLE_APPLICATION_CREDENTIALS y que el bucket exista.
  const testStorageString = 'tu-project-id:tu-bucket-de-prueba';
  const storage = new GCPBlobStorage(testStorageString);
  const testBinary: Binary = { id: 'test123', meta: { versionId: 'v1' } };

  it('debería escribir y luego leer un archivo binario', async () => {
    const content = '¡Hola, mundo!';
    const contentStream = new PassThrough();
    contentStream.end(content);

    // Escribir el binario
    await storage.writeBinary(testBinary, 'test.txt', 'text/plain', contentStream);

    // Leer el archivo
    const readStream = await storage.readBinary(testBinary);
    let data = '';
    for await (const chunk of readStream) {
      data += chunk;
    }
    expect(data).toEqual(content);
  });

  it('debería generar una URL firmada válida', async () => {
    const url = await storage.getPresignedUrl(testBinary);
    expect(url).toContain('https://');
  });
});