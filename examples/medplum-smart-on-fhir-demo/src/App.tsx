// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JSX } from 'react';
import { Route, Routes } from 'react-router';
import { HomePage } from './pages/HomePage';
import { LaunchPage } from './pages/LaunchPage';
import { PatientPage } from './pages/PatientPage';
import { PatientPickerPage } from './pages/PatientPickerPage';
import { SetupPage } from './pages/SetupPage';

export function App(): JSX.Element {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/launch" element={<LaunchPage />} />
      <Route path="/patient" element={<PatientPage />} />
      <Route path="/select-patient" element={<PatientPickerPage />} />
      <Route path="/setup" element={<SetupPage />} />
    </Routes>
  );
}
