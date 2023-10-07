import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Publisher from './components/Publisher';
import Subscriber from './components/Subscriber';

function App(): JSX.Element {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<div>Home</div>} />
        <Route path="/publisher" element={<Publisher />} />
        <Route path="/subscriber" element={<Subscriber />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
