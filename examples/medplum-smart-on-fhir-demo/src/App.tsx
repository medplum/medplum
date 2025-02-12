import { Routes, Route } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { LaunchPage } from './pages/LaunchPage';
import { PatientPage } from './pages/PatientPage';

export function App(): JSX.Element {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/launch" element={<LaunchPage />} />
      <Route path="/patient" element={<PatientPage />} />
    </Routes>
  );
}
