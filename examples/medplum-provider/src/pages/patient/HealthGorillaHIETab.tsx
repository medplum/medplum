// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JSX } from 'react';

export function HealthGorillaHIETab(): JSX.Element {
  return <HealthorillaButton />;
}

function HealthorillaButton(): JSX.Element {
  const handleclick = (): void => {
    window.location.href = "https://sandbox.healthgorilla.com/app/patient-chart/launch?iss=https://api.medplum.com/fhir/R4/&launch=da4435ec-5bca-4f18-b4a9-747d71c75369&patient=0e4af968e733693405e943e1";
  };

  return <button onClick={handleclick}>Launch Healthorilla</button>;
}