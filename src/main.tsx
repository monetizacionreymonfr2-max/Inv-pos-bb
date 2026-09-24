import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

// Register Service Worker for PWA (Offline functionality)
const updateSW = registerSW({ 
  immediate: true,
  onNeedRefresh() {
    updateSW(true);
  },
  onRegisteredSW(swUrl, r) {
    if (r) {
      setInterval(() => {
        r.update();
      }, 60 * 1000);
    }
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
