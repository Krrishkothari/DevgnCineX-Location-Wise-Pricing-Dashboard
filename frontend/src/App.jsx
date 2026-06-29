import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from './layout/MainLayout';
import { DashboardScreen } from './pages/DashboardScreen';
import { TheatreManagementScreen } from './pages/TheatreManagementScreen';
import { SourceConfigScreen } from './pages/SourceConfigScreen';
import { OperationsScreen } from './pages/OperationsScreen';
import { AlertsScreen } from './pages/AlertsScreen';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<DashboardScreen />} />
          <Route path="competitors" element={<Navigate to="/" replace />} /> {/* Alias for now */}
          <Route path="theatres" element={<TheatreManagementScreen />} />
          <Route path="sources" element={<SourceConfigScreen />} />
          <Route path="operations" element={<OperationsScreen />} />
          <Route path="alerts" element={<AlertsScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
