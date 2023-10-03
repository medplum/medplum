import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './App.css';
import PACS from './components/PACS';
import Subscriber from './components/Subscriber';

// Subscriber 1 client

// Need subscribe functionality...
// Create subscription... (send /subscribe)
// Open WS connection
// Test connection
// Wait for updates

// Remove subscription ...
// Send /unsubscribe  (check ordering)
// Close WS (?)

// Can read topic from localStorage for now??

// Driving app:
// List of patients, images associated
// Click on patient, sends update to hub if topic active

// Click connect sidecar apps button...
// Generates topicId (uuid)
// Puts it in localStorage (MEDPLUM_HUB_TOPIC)
// app 1 sees it, can listen to localStorage updates
// Makes subscription request

// App 2 works via Attach / Unattach when active topic is detected

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
