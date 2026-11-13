import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { ThemeProvider } from '@/context/ThemeContext';
import { ToastProvider } from '@/context/ToastContext';
import { ConfirmProvider } from '@/context/ConfirmContext';
import { AuthProvider } from '@/context/AuthContext';
import App from './App';
import { bootFromStoredUpdate, startLiveUpdates } from '@/lib/liveUpdate';
import { UpdateBanner } from '@/components/layout/UpdateBanner';

import { localApi } from '@local-api';

// Single-file builds (standalone demo, Firebase edition) may be opened from disk or any static host,
// so they use hash-based routing.
const Router = localApi ? HashRouter : BrowserRouter;
import './index.css';

void (async () => {
  // A newer verified release stored on this device replaces this page before anything starts.
  if (await bootFromStoredUpdate()) return;
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Router>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <ToastProvider>
              <ConfirmProvider>
                <AuthProvider>
                  <App />
                  <UpdateBanner />
                </AuthProvider>
              </ConfirmProvider>
            </ToastProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </Router>
    </StrictMode>,
  );
  startLiveUpdates();
})();
