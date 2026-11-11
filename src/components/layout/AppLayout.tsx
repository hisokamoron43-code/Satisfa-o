import React, { lazy, Suspense, useEffect, useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useApp } from '../../context/AppContext';
import { IdleSessionGuard } from '../security/IdleSessionGuard';

// Cada página é carregada só quando é aberta (divisão do bundle por rotas).
const DashboardPage = lazy(() => import('../../pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const ClientsPage = lazy(() => import('../../pages/ClientsPage').then((m) => ({ default: m.ClientsPage })));
const CalendarPage = lazy(() => import('../../pages/CalendarPage').then((m) => ({ default: m.CalendarPage })));
const ServicesPage = lazy(() => import('../../pages/ServicesPage').then((m) => ({ default: m.ServicesPage })));
const ProvidersPage = lazy(() => import('../../pages/ProvidersPage').then((m) => ({ default: m.ProvidersPage })));
const EvaluationsPage = lazy(() => import('../../pages/EvaluationsPage').then((m) => ({ default: m.EvaluationsPage })));
const HumanResourcesPage = lazy(() => import('../../pages/HumanResourcesPage').then((m) => ({ default: m.HumanResourcesPage })));
const ReportsPage = lazy(() => import('../../pages/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const UsersPage = lazy(() => import('../../pages/UsersPage').then((m) => ({ default: m.UsersPage })));
const AuditPage = lazy(() => import('../../pages/AuditPage').then((m) => ({ default: m.AuditPage })));
const SettingsPage = lazy(() => import('../../pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const FormEditorPage = lazy(() => import('../../pages/FormEditorPage').then((m) => ({ default: m.FormEditorPage })));
const EvaluationAnalysisPage = lazy(() => import('../../pages/EvaluationAnalysisPage').then((m) => ({ default: m.EvaluationAnalysisPage })));
const EmployeeManagement = lazy(() => import('../../pages/EmployeeManagement').then((m) => ({ default: m.EmployeeManagement })));
const MessagesPage = lazy(() => import('../../pages/MessagesPage').then((m) => ({ default: m.MessagesPage })));


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
      case 'evaluation_analysis': 
      case 'evaluation-analysis': 
        return <EvaluationAnalysisPage />;
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

  // Tecla Esc fecha a janela modal que está por cima (clica no X ou em Cancelar/Fechar dessa janela).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const overlays = Array.from(document.querySelectorAll<HTMLElement>('.modal-overlay:not([data-no-escape])'));
      if (overlays.length === 0) return;
      const z = (el: HTMLElement) => parseInt(getComputedStyle(el).zIndex || '0', 10) || 0;
      const top = overlays.reduce((best, el) => (z(el) >= z(best) ? el : best), overlays[0]);
      const panel = (top.firstElementChild as HTMLElement | null) ?? top;
      const closeBtn =
        panel.querySelector<HTMLButtonElement>('button:has(svg.lucide-x)') ??
        Array.from(panel.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
          /^(cancelar|fechar)$/i.test((b.textContent || '').trim())
        );
      if (closeBtn && !closeBtn.disabled) {
        e.preventDefault();
        closeBtn.click();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="min-h-dvh bg-slate-100 flex flex-col lg:flex-row">
      <IdleSessionGuard />
      {/* Sidebar */}
      <Sidebar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />

      {/* Main Content Wrapper */}
      <div className="flex-1 min-w-0 lg:pl-72 flex flex-col min-h-dvh">
        <Header setMobileOpen={setMobileOpen} />
        
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <Suspense fallback={<div className="py-16 text-center text-sm text-slate-500">A carregar…</div>}>
            {renderActivePage()}
          </Suspense>
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
