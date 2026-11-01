import { Client, ServiceItem, Provider, Evaluation, HRCase, ProviderPermissionAudit, AuditLog, UserProfile, FormQuestion } from '../types';

export const INITIAL_USERS: UserProfile[] = []; // Sem utilizadores de demonstração em produção

export const INITIAL_FORM_QUESTIONS: FormQuestion[] = [];

// Dados começam 100% vazios para produção real
export const MOCK_USERS = INITIAL_USERS;
export const MOCK_CLIENTS: Client[] = [];
export const MOCK_SERVICES: ServiceItem[] = [];
export const MOCK_PROVIDERS: Provider[] = [];
export const MOCK_EVALUATIONS: Evaluation[] = [];
export const MOCK_HR_CASES: HRCase[] = [];
export const MOCK_PERMISSION_AUDITS: ProviderPermissionAudit[] = [];
export const MOCK_AUDIT_LOGS: AuditLog[] = [];
export const MOCK_FORM_QUESTIONS: FormQuestion[] = INITIAL_FORM_QUESTIONS;

