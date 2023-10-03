import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './App.css';
import PACS from './components/PACS';
import Subscriber from './components/Subscriber';

function App(): JSX.Element {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<div>Home</div>} />
        <Route path="/pacs" element={<PACS />} />
        <Route path="/subscriber" element={<Subscriber />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
