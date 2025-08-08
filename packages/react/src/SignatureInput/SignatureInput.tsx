// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Paper, PaperProps } from '@mantine/core';
import { createReference, HTTP_HL7_ORG, ProfileResource } from '@medplum/core';
import { Reference, Signature } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { IconTrash } from '@tabler/icons-react';
import { JSX, useEffect, useRef } from 'react';
import SignaturePad from 'signature_pad';

export interface SignatureInputProps extends PaperProps {
  readonly width?: number;
  readonly height?: number;
  readonly defaultValue?: Signature;
  readonly who?: Reference<ProfileResource>;
  readonly onChange: ((value: Signature | undefined) => void) | undefined;
}

export function SignatureInput(props: SignatureInputProps): JSX.Element {
  const medplum = useMedplum();
  const { width = 500, height = 200, defaultValue, who, onChange, ...rest } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const signaturePadRef = useRef<SignaturePad>(null);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    function handleEndStroke(): void {
      onChangeRef.current?.({
        type: [
          {
            system: HTTP_HL7_ORG + '/fhir/signature-type',
            code: 'ProofOfOrigin',
            display: 'Proof of Origin',
          },
        ],
        when: new Date().toISOString(),
        who: who ?? createReference(medplum.getProfile() as ProfileResource),
        data: signaturePadRef.current?.toDataURL(),
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
  }, [medplum, defaultValue, who]);

  const clearSignature = (): void => {
    if (signaturePadRef.current) {
      signaturePadRef.current.clear();
    }
    onChangeRef.current?.(undefined);
  };

  return (
    <Paper withBorder p={0} w={width} h={height} pos="relative" {...rest}>
      <canvas ref={canvasRef} width={width} height={height} aria-label="Signature input area"></canvas>
      <Button
        onClick={clearSignature}
        aria-label="Clear signature"
        pos="absolute"
        top={0}
        right={0}
        size="xs"
        leftSection={<IconTrash size={16} />}
        variant="subtle"
        color="gray"
      >
        Clear
      </Button>
    </Paper>
  );
}
