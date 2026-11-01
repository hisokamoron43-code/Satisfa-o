/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { LoginPage } from './pages/LoginPage';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { AppLayout } from './components/layout/AppLayout';
import { ClientSatisfactionForm } from './components/forms/ClientSatisfactionForm';
import { SUPABASE_CONFIG_ERROR } from './services/supabaseService';

const MainRouter: React.FC = () => {
  const { currentUser, isAuthChecking, isClientFormOpen, setIsClientFormOpen } = useApp();

  if (SUPABASE_CONFIG_ERROR) {
    return (
      <div className="bg-slate-950 min-h-screen flex flex-col items-center justify-center text-white p-6 font-['Inter',sans-serif]">
        <p className="text-sm font-bold text-slate-200 tracking-wide">SICSC — AETERNU</p>
        <p className="text-xs text-amber-300 mt-2 max-w-md text-center">{SUPABASE_CONFIG_ERROR}</p>
      </div>
    );
  }

  // Links públicos de avaliação: parâmetros exatos (form, token, mode=form)
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const isDirectFormUrl = !!params && (params.has('form') || params.has('token') || params.get('mode') === 'form');

  if (isClientFormOpen || isDirectFormUrl) {
    return (
      <ClientSatisfactionForm 
        onClose={() => {
          setIsClientFormOpen(false);
          if (isDirectFormUrl) {
            window.history.replaceState({}, '', window.location.pathname);
          }
        }} 
      />
    );
  }

  if (isAuthChecking) {
    return (
      <div className="bg-slate-950 min-h-screen flex flex-col items-center justify-center text-white p-4 font-['Inter',sans-serif]">
        <div className="w-10 h-10 border-3 border-brand border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-sm font-bold text-slate-200 tracking-wide">SICSC — AETERNU</p>
        <p className="text-xs text-slate-400 mt-1">A verificar ambiente de segurança...</p>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginPage />;
  }

  if (currentUser.mustChangePassword) {
    return <ChangePasswordPage />;
  }

  return <AppLayout />;
};

export default function App() {
  return (
    <AppProvider>
      <MainRouter />
    </AppProvider>
  );
}
