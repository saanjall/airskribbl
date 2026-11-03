import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { RoomProvider } from './game/RoomContext.jsx';
import { Landing } from './pages/Landing.jsx';
import { Practice } from './pages/Practice.jsx';
import { Room } from './pages/Room.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <RoomProvider>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/practice" element={<Practice />} />
            <Route path="/room/:code" element={<Room />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </RoomProvider>
      </BrowserRouter>
    </MotionConfig>
  </StrictMode>,
);
