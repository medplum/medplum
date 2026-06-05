// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Mock } from 'vitest';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import type { ReactNode } from 'react';
import SignaturePad from 'signature_pad';
import { act, render, screen } from '../test-utils/render';
import { SignatureInput } from './SignatureInput';

describe('SignatureInput', () => {
  const medplum = new MockClient();

  async function setup(child: ReactNode): Promise<void> {
    await act(async () => {
      render(<MedplumProvider medplum={medplum}>{child}</MedplumProvider>);
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('Renders', async () => {
    const handleChange = vi.fn();

    await setup(<SignatureInput onChange={handleChange} />);
    expect(screen.getByLabelText('Signature input area')).toBeInTheDocument();
    expect(SignaturePad).toHaveBeenCalledTimes(1);

    const signaturePadConstructor = SignaturePad as Mock;
    expect(signaturePadConstructor).toBeDefined();

    const signaturePadInstance = signaturePadConstructor.mock.results[0].value;
    expect(signaturePadInstance).toBeDefined();
    expect(signaturePadInstance.addEventListener).toHaveBeenCalledTimes(1);

    const clearButton = screen.getByLabelText('Clear signature');
    expect(clearButton).toBeInTheDocument();
    act(() => {
      clearButton.click();
    });

    const handler = (signaturePadInstance.addEventListener as Mock).mock.calls[0][1];
    expect(handler).toBeDefined();
    expect(typeof handler).toBe('function');

    act(() => {
      handler();
    });
    expect(handleChange).toHaveBeenCalledWith({
      type: [
        {
          system: 'http://hl7.org/fhir/signature-type',
          code: 'ProofOfOrigin',
          display: 'Proof of Origin',
        },
      ],
      when: expect.any(String),
      who: expect.objectContaining({ reference: expect.any(String) }),
      data: expect.any(String),
    });
  });

  test('Signature data is raw binary (base64)', async () => {
    const handleChange = vi.fn();

    // Mock a realistic base64-encoded PNG signature data
    const mockBase64Data =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    const mockDataURL = `data:image/png;base64,${mockBase64Data}`;

    const signaturePadMock = vi.fn(function () {
      return {
        fromDataURL: vi.fn(),
        clear: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        toDataURL: vi.fn(() => mockDataURL),
      };
    });

    // Override the mock for this test
    (SignaturePad as Mock).mockImplementation(signaturePadMock);

    await setup(<SignatureInput onChange={handleChange} />);

    const signaturePadInstance = (SignaturePad as Mock).mock.results[0].value;
    const handler = (signaturePadInstance.addEventListener as Mock).mock.calls[0][1];

    act(() => {
      handler();
    });

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        data: mockBase64Data,
      })
    );

    // Verify the data is valid base64
    const signatureData = handleChange.mock.calls[0][0].data;
    expect(signatureData).toBe(mockBase64Data);

    // Test that it's valid base64 by attempting to decode it
    expect(() => {
      atob(signatureData);
    }).not.toThrow();

    // Verify it's not the full data URL
    expect(signatureData).not.toContain('data:image/png;base64,');
    expect(signatureData).toBe(mockBase64Data);
  });

  test('Signature data extraction from data URL', async () => {
    const handleChange = vi.fn();

    // Test with different data URL formats
    const testCases = [
      {
        dataURL:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        expectedData:
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      },
      {
        dataURL:
          'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=',
        expectedData:
          '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=',
      },
    ];

    for (const testCase of testCases) {
      vi.clearAllMocks();

      const signaturePadMock = vi.fn(function () {
        return {
          fromDataURL: vi.fn(),
          clear: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          toDataURL: vi.fn(() => testCase.dataURL),
        };
      });

      (SignaturePad as Mock).mockImplementation(signaturePadMock);

      await setup(<SignatureInput onChange={handleChange} />);

      const signaturePadInstance = (SignaturePad as Mock).mock.results[0].value;
      const handler = (signaturePadInstance.addEventListener as Mock).mock.calls[0][1];

      act(() => {
        handler();
      });

      expect(handleChange).toHaveBeenCalledWith(
        expect.objectContaining({
          data: testCase.expectedData,
        })
      );

      // Verify the extracted data is valid base64
      const signatureData = handleChange.mock.calls[0][0].data;
      expect(() => {
        atob(signatureData);
      }).not.toThrow();
    }
  });

  test('Signature data is binary content, not text', async () => {
    const handleChange = vi.fn();

    // Create a mock that simulates binary PNG data
    const binaryData = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
    const base64Data = btoa(String.fromCodePoint(...binaryData));
    const dataURL = `data:image/png;base64,${base64Data}`;

    const signaturePadMock = vi.fn(function () {
      return {
        fromDataURL: vi.fn(),
        clear: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        toDataURL: vi.fn(() => dataURL),
      };
    });

    (SignaturePad as Mock).mockImplementation(signaturePadMock);

    await setup(<SignatureInput onChange={handleChange} />);

    const signaturePadInstance = (SignaturePad as Mock).mock.results[0].value;
    const handler = (signaturePadInstance.addEventListener as Mock).mock.calls[0][1];

    act(() => {
      handler();
    });

    const signatureData = handleChange.mock.calls[0][0].data;

    // Verify it's the raw base64 data, not the full data URL
    expect(signatureData).toBe(base64Data);
    expect(signatureData).not.toContain('data:');
    expect(signatureData).not.toContain('base64,');

    // Verify it can be decoded back to binary
    const decodedData = atob(signatureData);
    expect(decodedData.length).toBeGreaterThan(0);

    // Verify it contains binary data (PNG signature)
    expect(decodedData.codePointAt(0)).toBe(137); // PNG signature byte
    expect(decodedData.codePointAt(1)).toBe(80); // 'P'
    expect(decodedData.codePointAt(2)).toBe(78); // 'N'
    expect(decodedData.codePointAt(3)).toBe(71); // 'G'
  });
});
