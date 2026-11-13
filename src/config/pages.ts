/**
 * @file pages.ts
 * @description Catálogo Centralizado de Páginas, Secções e Permissões do SICSC (AETERNU LDA).
 * Define a estrutura estável de navegação da aplicação, respetivos papéis base necessários para
 * acesso aos dados em conformidade com as regras de RLS e indicação de sensibilidade.
 */

import { UserRole } from '../types';

export type PageSection = 'Visão Geral' | 'Operações' | 'Qualidade & RH' | 'Direção' | 'Administração' | 'Segurança' | 'Sistema';

export interface AppPageConfig {
  key: string;
  name: string;
  section: PageSection;
  route: string;
  requiredBaseRole: UserRole;
  isSensitive: boolean;
  description: string;
  displayOrder: number;
}

export const APP_PAGES: AppPageConfig[] = [
  {
    key: 'dashboard',
    name: 'Painel Geral',
    section: 'Visão Geral',
    route: 'dashboard',
    requiredBaseRole: 'PROVIDER',
    isSensitive: false,
    description: 'Indicadores executivos, volume de avaliações e métricas de satisfação do cliente.',
    displayOrder: 1
  },
  {
    key: 'clients',
    name: 'Clientes',
    section: 'Operações',
    route: 'clients',
    requiredBaseRole: 'OPERATIONAL',
    isSensitive: false,
    description: 'Diretório de empresas clientes, contratos de higiene e histórico operacional.',
    displayOrder: 2
  },
  {
    key: 'calendar',
    name: 'Calendário & Operações',
    section: 'Operações',
    route: 'calendar',
    requiredBaseRole: 'OPERATIONAL',
    isSensitive: false,
    description: 'Cronograma de intervenções, agendamento de turnos e alocação de equipas no terreno.',
    displayOrder: 3
  },
  {
    key: 'services',
    name: 'Serviços',
    section: 'Operações',
    route: 'services',
    requiredBaseRole: 'OPERATIONAL',
    isSensitive: false,
    description: 'Catálogo de serviços especializados da AETERNU e parametrização de indicadores.',
    displayOrder: 4
  },
  {
    key: 'providers',
    name: 'Prestadores & Técnicos',
    section: 'Operações',
    route: 'providers',
    requiredBaseRole: 'OPERATIONAL',
    isSensitive: false,
    description: 'Gestão operacional de técnicos de campo e autorizações de consulta de notas.',
    displayOrder: 5
  },
  {
    key: 'evaluations',
    name: 'Avaliações',
    section: 'Qualidade & RH',
    route: 'evaluations',
    requiredBaseRole: 'PROVIDER',
    isSensitive: false,
    description: 'Histórico de formulários de satisfação, pontuações de clientes e comentários.',
    displayOrder: 6
  },
  {
    key: 'evaluation_analysis',
    name: 'Análise de Avaliação',
    section: 'Qualidade & RH',
    route: 'evaluation_analysis',
    requiredBaseRole: 'HR',
    isSensitive: false,
    description: 'Homologação técnica de inquéritos, audição de depoimentos de voz e validação final.',
    displayOrder: 7
  },
  {
    key: 'form_editor',
    name: 'Edição de Formulário',
    section: 'Qualidade & RH',
    route: 'form_editor',
    requiredBaseRole: 'HR',
    isSensitive: true,
    description: 'Configuração dinâmica de perguntas por serviço, categorias e tipos de resposta.',
    displayOrder: 8
  },
  {
    key: 'hr',
    name: 'Recursos Humanos',
    section: 'Qualidade & RH',
    route: 'hr',
    requiredBaseRole: 'HR',
    isSensitive: true,
    description: 'Ocorrências disciplinares, pesos percentuais dos critérios e limiares de aprovação.',
    displayOrder: 9
  },
  {
    key: 'employees',
    name: 'Funcionários',
    section: 'Administração',
    route: 'employees',
    requiredBaseRole: 'HR',
    isSensitive: true,
    description: 'Registo completo de colaboradores da AETERNU, dossiê digital e gestão de credenciais.',
    displayOrder: 10
  },
  {
    key: 'access_profiles',
    name: 'Perfis de Acesso',
    section: 'Administração',
    route: 'access_profiles',
    requiredBaseRole: 'ADMIN',
    isSensitive: true,
    description: 'Criação e parametrização de perfis de permissões e atribuição centralizada de páginas.',
    displayOrder: 11
  },
  {
    key: 'reports',
    name: 'Relatórios',
    section: 'Direção',
    route: 'reports',
    requiredBaseRole: 'DIRECTOR',
    isSensitive: false,
    description: 'Análise estatística de desempenho, relatórios consolidados e tendências de satisfação.',
    displayOrder: 12
  },
  {
    key: 'users',
    name: 'Utilizadores do Sistema',
    section: 'Administração',
    route: 'users',
    requiredBaseRole: 'ADMIN',
    isSensitive: true,
    description: 'Supervisão técnica de contas do sistema e políticas de isolamento de privilégios.',
    displayOrder: 13
  },
  {
    key: 'audit',
    name: 'Auditoria',
    section: 'Segurança',
    route: 'audit',
    requiredBaseRole: 'ADMIN',
    isSensitive: true,
    description: 'Trilha forense de auditoria imutável com rastreabilidade de todas as ações sensíveis.',
    displayOrder: 14
  },
  {
    key: 'messages',
    name: 'Mensagens Internas',
    section: 'Operações',
    route: 'messages',
    requiredBaseRole: 'PROVIDER',
    isSensitive: false,
    description: 'Comunicação interna entre a equipa.',
    displayOrder: 16
  },
  {
    key: 'settings',
    name: 'Configurações',
    section: 'Sistema',
    route: 'settings',
    requiredBaseRole: 'ADMIN',
    isSensitive: true,
    description: 'Definições do sistema, estado de conectividade da infraestrutura e parâmetros gerais.',
    displayOrder: 15
  },
  {
    key: 'teams',
    name: 'Equipas',
    section: 'Operações',
    route: 'teams',
    requiredBaseRole: 'OPERATIONAL',
    isSensitive: false,
    description: 'Criação de equipas operacionais e escolha do supervisor entre os funcionários cadastrados.',
    displayOrder: 5
  }
];

export const APP_PAGE_MAP: Record<string, AppPageConfig> = APP_PAGES.reduce((acc, p) => {
  acc[p.key] = p;
  return acc;
}, {} as Record<string, AppPageConfig>);

/**
 * Hierarquia de visibilidade de dados por Papel Base na base de dados (RLS).
 * Determina se o papel base é suficiente para ver dados associados a uma página.
 */
export const ROLE_HIERARCHY_LEVEL: Record<UserRole, number> = {
  ADMIN: 5,
  HR: 4,
  DIRECTOR: 3,
  OPERATIONAL: 2,
  PROVIDER: 1
};

/**
 * Validação de coerência entre o papel base selecionado e a página atribuída.
 * Devolve um aviso caso a página atribuída exija um papel base com permissões superiores de RLS.
 */
export function checkPageRoleCoherence(pageKey: string, baseRole: UserRole): { isCoherent: boolean; warning?: string } {
  const page = APP_PAGE_MAP[pageKey];
  if (!page) {
    return { isCoherent: true };
  }

  const roleLevel = ROLE_HIERARCHY_LEVEL[baseRole] || 0;
  const requiredLevel = ROLE_HIERARCHY_LEVEL[page.requiredBaseRole] || 0;

  if (roleLevel < requiredLevel) {
    return {
      isCoherent: false,
      warning: `A página "${page.name}" requer o papel base mínimo "${page.requiredBaseRole}". Com o papel "${baseRole}", a página poderá abrir vazia devido às restrições de RLS do Supabase.`
    };
  }

  return { isCoherent: true };
}

/**
 * Retorna as páginas organizadas por secção para exibição agrupada.
 */
export function getPagesGroupedBySection(): Record<PageSection, AppPageConfig[]> {
  const groups: Record<PageSection, AppPageConfig[]> = {
    'Visão Geral': [],
    'Operações': [],
    'Qualidade & RH': [],
    'Direção': [],
    'Administração': [],
    'Segurança': [],
    'Sistema': []
  } as any;

  APP_PAGES.forEach(page => {
    if (!groups[page.section]) {
      groups[page.section] = [];
    }
    groups[page.section].push(page);
  });

  return groups;
}
