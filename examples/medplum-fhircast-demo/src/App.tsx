import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './App.css';
import PACS from './components/PACS';
import Subscriber from './components/Subscriber';

const PORT = 9050;

function App(): JSX.Element {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<div>Home</div>} />
        <Route path="/pacs" element={<PACS hubPort={PORT} />} />
        <Route path="/subscriber" element={<Subscriber hubPort={PORT} />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
