import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useApp } from '../../context/AppContext';

import { DashboardPage } from '../../pages/DashboardPage';
import { ClientsPage } from '../../pages/ClientsPage';
import { CalendarPage } from '../../pages/CalendarPage';
import { ServicesPage } from '../../pages/ServicesPage';
import { ProvidersPage } from '../../pages/ProvidersPage';
import { EvaluationsPage } from '../../pages/EvaluationsPage';
import { HumanResourcesPage } from '../../pages/HumanResourcesPage';
import { ReportsPage } from '../../pages/ReportsPage';
import { UsersPage } from '../../pages/UsersPage';
import { AuditPage } from '../../pages/AuditPage';
import { SettingsPage } from '../../pages/SettingsPage';
import { FormEditorPage } from '../../pages/FormEditorPage';
import { EvaluationAnalysisPage } from '../../pages/EvaluationAnalysisPage';
import { EmployeeManagement } from '../../pages/EmployeeManagement';
import { MessagesPage } from '../../pages/MessagesPage';

export const AppLayout: React.FC = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { activeTab, currentUser } = useApp();
  const pageKey = activeTab === 'employee_management' ? 'employees' : activeTab;
  const canView = currentUser?.role === 'ADMIN' || (currentUser?.allowedPages ?? []).includes(pageKey);

  const renderActivePage = () => {
    if (!canView) {
      return (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
          <h2 className="text-lg font-bold text-slate-900">Sem permissão para esta página</h2>
          <p className="text-sm text-slate-500 mt-2">Contacte o Administrador se precisar deste acesso.</p>
        </div>
      );
    }
    switch (activeTab) {
      case 'dashboard': return <DashboardPage />;
      case 'clients': return <ClientsPage />;
      case 'calendar': return <CalendarPage />;
      case 'services': return <ServicesPage />;
      case 'providers': return <ProvidersPage />;
      case 'evaluations': return <EvaluationsPage />;
      case 'evaluation_analysis': return <EvaluationAnalysisPage />;
      case 'form_editor': return <FormEditorPage />;
      case 'hr': return <HumanResourcesPage />;
      case 'employees': 
      case 'employee_management': 
        return <EmployeeManagement />;
      case 'messages': return <MessagesPage />;
      case 'reports': return <ReportsPage />;
      case 'users': return <UsersPage />;
      case 'audit': return <AuditPage />;
      case 'settings': return <SettingsPage />;
      default: return <DashboardPage />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col lg:flex-row">
      {/* Sidebar */}
      <Sidebar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />

      {/* Main Content Wrapper */}
      <div className="flex-1 lg:pl-72 flex flex-col min-h-screen">
        <Header setMobileOpen={setMobileOpen} />
        
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {renderActivePage()}
        </main>

        {/* Enterprise Footer */}
        <footer className="bg-white border-t border-slate-200 py-4 px-6 text-center text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>SICSC — Sistema Integrado de Controlo da Satisfação de Clientes &copy; 2026 AETERNU LDA</span>
          <div className="flex items-center gap-4 text-[11px]">
            <span className="text-brand-dark font-semibold">Higiene | Segurança | Ambiente</span>
            <span>Moeda: AOA (Kz)</span>
            <span>Fuso: Africa/Luanda</span>
          </div>
        </footer>
      </div>
    </div>
  );
};
