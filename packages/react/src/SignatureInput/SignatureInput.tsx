import { CloseButton, Paper } from '@mantine/core';
import { createReference, ProfileResource } from '@medplum/core';
import { Signature } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { JSX, useEffect, useRef } from 'react';
import SignaturePad from 'signature_pad';

export interface SignatureInputProps {
  readonly width?: number;
  readonly height?: number;
  readonly defaultValue?: Signature;
  readonly onChange: ((value: Signature | undefined) => void) | undefined;
}

export function SignatureInput(props: SignatureInputProps): JSX.Element {
  const medplum = useMedplum();
  const { defaultValue, onChange } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const signaturePadRef = useRef<SignaturePad>(null);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    function handleEndStroke(): void {
      onChangeRef.current?.({
        type: [
          {
            system: 'http://hl7.org/fhir/signature-type',
            code: 'ProofOfOrigin',
            display: 'Proof of Origin',
          },
        ],
        when: new Date().toISOString(),
        who: createReference(medplum.getProfile() as ProfileResource),
        data: canvasRef.current?.toDataURL(),
      });
    }

    if (canvasRef.current) {
      const signaturePad = new SignaturePad(canvasRef.current);
      if (defaultValue?.data) {
        signaturePad.fromDataURL(defaultValue.data).catch(console.error);
      }
      signaturePad.addEventListener('endStroke', handleEndStroke);
      signaturePadRef.current = signaturePad;
    }

    return () => {
      if (signaturePadRef.current) {
        signaturePadRef.current.removeEventListener('beginStroke', handleEndStroke);
      }
    };
  }, [medplum, defaultValue]);

  const clearSignature = (): void => {
    if (signaturePadRef.current) {
      signaturePadRef.current.clear();
    }
  };

  const width = props.width ?? 500;
  const height = props.height ?? 200;

  return (
    <Paper withBorder p={0} w={width} h={height} pos="relative">
      <canvas ref={canvasRef} width={width} height={height} role="img" aria-label="Signature input area"></canvas>
      <CloseButton onClick={clearSignature} pos="absolute" top={0} right={0} />
    </Paper>
  );
}
