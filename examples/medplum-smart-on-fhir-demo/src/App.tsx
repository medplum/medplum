import { JSX } from 'react';
import { Route, Routes } from 'react-router';
import { HomePage } from './pages/HomePage';
import { LaunchPage } from './pages/LaunchPage';
import { PatientPage } from './pages/PatientPage';
import { PatientPickerPage } from './pages/PatientPickerPage';

export function App(): JSX.Element {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/launch" element={<LaunchPage />} />
      <Route path="/patient" element={<PatientPage />} />
      <Route path="/select-patient" element={<PatientPickerPage />} />
    </Routes>
  );
}
