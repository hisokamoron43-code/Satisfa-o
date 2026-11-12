import { 
  Client, 
  ServiceItem, 
  Provider, 
  Evaluation, 
  HRCase, 
  ProviderPermissionAudit, 
  AuditLog, 
  UserProfile, 
  FormQuestion,
  Team,
  Activity,
  FormCategoryItem
} from '../types';

export const INITIAL_USERS: UserProfile[] = [
  {
    id: 'u1111111-1111-4111-8111-111111111111',
    name: 'Dr. António Silva',
    email: 'admin@aeternu.co.ao',
    role: 'ADMIN',
    department: 'Direção Geral',
    active: true,
    lastLogin: '2026-11-01',
    allowedPages: [
      'dashboard', 'clients', 'calendar', 'services', 'providers',
      'evaluations', 'evaluation_analysis', 'form_editor', 'hr',
      'employees', 'access_profiles', 'reports', 'users', 'audit',
      'messages', 'settings'
    ]
  },
  {
    id: 'u2222222-2222-4222-8222-222222222222',
    name: 'Dra. Maria Fernandes',
    email: 'rh@aeternu.co.ao',
    role: 'HR',
    department: 'Recursos Humanos & Qualidade',
    active: true,
    lastLogin: '2026-11-01',
    allowedPages: [
      'dashboard', 'evaluations', 'evaluation_analysis', 'form_editor',
      'hr', 'employees', 'reports', 'messages'
    ]
  },
  {
    id: 'u3333333-3333-4333-8333-333333333333',
    name: 'Eng. Carlos Ferreira',
    email: 'direcao@aeternu.co.ao',
    role: 'DIRECTOR',
    department: 'Direção Executiva',
    active: true,
    lastLogin: '2026-10-31',
    allowedPages: [
      'dashboard', 'clients', 'services', 'providers', 'evaluations',
      'reports', 'messages'
    ]
  },
  {
    id: 'u4444444-4444-4444-8444-444444444444',
    name: 'Paulo Sousa',
    email: 'operacoes@aeternu.co.ao',
    role: 'OPERATIONAL',
    department: 'Operações e Terreno',
    active: true,
    lastLogin: '2026-10-30',
    allowedPages: [
      'dashboard', 'clients', 'calendar', 'services', 'providers',
      'evaluations', 'messages'
    ]
  },
  {
    id: 'u5555555-5555-4555-8555-555555555555',
    name: 'Mateus Domingos',
    email: 'prestador@aeternu.co.ao',
    role: 'PROVIDER',
    providerId: 'p1111111-1111-4111-8111-111111111111',
    department: 'Equipa Técnica',
    active: true,
    lastLogin: '2026-11-01',
    allowedPages: [
      'dashboard', 'evaluations', 'messages'
    ]
  }
];

export const MOCK_USERS = INITIAL_USERS;

// Sem dados de demonstração: as clients vêm sempre da base de dados.
export const MOCK_CLIENTS: Client[] = [];

// Sem dados de demonstração: as services vêm sempre da base de dados.
export const MOCK_SERVICES: ServiceItem[] = [];

// Sem dados de demonstração: as providers vêm sempre da base de dados.
export const MOCK_PROVIDERS: Provider[] = [];

export const INITIAL_FORM_QUESTIONS: FormQuestion[] = [
  {
    id: 'qst-001',
    text: 'Qual o grau de satisfação com a eficácia do serviço técnico executado?',
    description: 'Avalie a qualidade do acabamento, o rigor técnico e a resolução do problema identificado.',
    category: 'QUALIDADE',
    type: 'RATING_5',
    required: true,
    active: true,
    order: 1
  },
  {
    id: 'qst-002',
    text: 'O técnico compareceu pontualmente e cumpriu o tempo de intervenção previsto?',
    description: 'Respeito pelo horário de agendamento e duração da intervenção nas instalações.',
    category: 'PONTUALIDADE',
    type: 'RATING_5',
    required: true,
    active: true,
    order: 2
  },
  {
    id: 'qst-003',
    text: 'A equipa técnica utilizou EPIs adequados e respeitou as normas de segurança (HST)?',
    description: 'Uso de máscara, luvas, vestuário de proteção e respeito pelas zonas sinalizadas.',
    category: 'SEGURANCA',
    type: 'RATING_5',
    required: true,
    active: true,
    order: 3
  },
  {
    id: 'qst-004',
    text: 'Como classifica a postura profissional, cordialidade e esclarecimento prestado pelos técnicos?',
    description: 'Apresentação, educação, identificação da credencial e clareza nas orientações.',
    category: 'ATENDIMENTO',
    type: 'RATING_5',
    required: true,
    active: true,
    order: 4
  },
  {
    id: 'qst-005',
    text: 'Numa escala de 0 a 10, qual a probabilidade de recomendar a AETERNU a parceiros de negócio?',
    description: 'Indicador oficial Net Promoter Score (NPS) da AETERNU LDA.',
    category: 'GERAL',
    type: 'NPS_10',
    required: true,
    active: true,
    order: 5
  },
  {
    id: 'qst-006',
    text: 'Comentários adicionais, observações técnicas ou sugestões de melhoria:',
    description: 'Pode escrever a sua mensagem ou gravar um depoimento em áudio.',
    category: 'GERAL',
    type: 'AUDIO_AND_TEXT',
    required: false,
    active: true,
    order: 6
  }
];

export const MOCK_FORM_QUESTIONS: FormQuestion[] = INITIAL_FORM_QUESTIONS;

// Sem dados de demonstração: as evaluations vêm sempre da base de dados.
export const MOCK_EVALUATIONS: Evaluation[] = [];

export const MOCK_HR_CASES: HRCase[] = [
  {
    id: 'hr111111-1111-4111-8111-111111111111',
    evaluationId: 'e4444444-4444-4444-8444-444444444444',
    occurrenceType: 'QUALIDADE_SERVICO',
    internalNotes: 'Cliente Unitel reportou odor residual pós-desinfeção das condutas AVAC. Dra. Maria Fernandes contactou o Eng. Rui Afonso e alinhou visita técnica de medição e ventilação forçada.',
    assignedTo: 'Dra. Maria Fernandes (RH)',
    correctiveAction: 'Revisão da ficha técnica do biossanitizante utilizado e inclusão de protocolo de aeração prévia no checklist técnico da equipa.',
    status: 'EM_ANALISE',
    createdAt: '2026-10-31',
    updatedAt: '2026-11-01'
  }
];

export const MOCK_PERMISSION_AUDITS: ProviderPermissionAudit[] = [
  {
    id: 'pa111111-1111-4111-8111-111111111111',
    providerId: 'p1111111-1111-4111-8111-111111111111',
    providerName: 'Mateus Domingos',
    previousState: false,
    newState: true,
    changedBy: 'Dra. Maria Fernandes (RH)',
    changedAt: '2024-02-15 09:00:00',
    reason: 'Autorização inicial para consulta de avaliações técnicas e notas operacionais de satisfação.'
  }
];

export const MOCK_AUDIT_LOGS: AuditLog[] = [
  {
    id: 'log-001',
    timestamp: '2026-11-01 08:30:15',
    userEmail: 'admin@aeternu.co.ao',
    userName: 'Dr. António Silva',
    operationType: 'LOGIN',
    affectedEntity: 'Session',
    result: 'SUCCESS',
    details: 'Sessão iniciada com sucesso via autenticação segura'
  },
  {
    id: 'log-002',
    timestamp: '2026-10-31 16:45:00',
    userEmail: 'rh@aeternu.co.ao',
    userName: 'Dra. Maria Fernandes',
    operationType: 'UPDATE',
    affectedEntity: 'HRCase',
    recordId: 'hr111111-1111-4111-8111-111111111111',
    result: 'SUCCESS',
    details: 'Atualizada ocorrência de RH referente à avaliação AV-1004'
  },
  {
    id: 'log-003',
    timestamp: '2026-10-30 17:15:20',
    userEmail: 'rh@aeternu.co.ao',
    userName: 'Dra. Maria Fernandes',
    operationType: 'UPDATE',
    affectedEntity: 'Evaluation',
    recordId: 'e3333333-3333-4333-8333-333333333333',
    result: 'SUCCESS',
    details: 'Homologação técnica da avaliação AV-1003 (Hospital Geral) com nota 98%'
  }
];

export const MOCK_TEAMS: Team[] = [
  {
    id: 't1111111-1111-4111-8111-111111111111',
    name: 'Equipa Alfa — Pragas & Biocidas',
    code: 'EQ-ALFA',
    department: 'Operações de Terreno',
    supervisorName: 'Mateus Domingos',
    status: 'ACTIVE',
    membersCount: 4,
    createdAt: '2024-01-15'
  },
  {
    id: 't2222222-2222-4222-8222-222222222222',
    name: 'Equipa Bravo — AVAC & Descontaminação',
    code: 'EQ-BRAVO',
    department: 'Climatização e HST',
    supervisorName: 'Bernardo Kiala',
    status: 'ACTIVE',
    membersCount: 5,
    createdAt: '2024-03-01'
  },
  {
    id: 't3333333-3333-4333-8333-333333333333',
    name: 'Equipa Delta — Higiene Hospitalar Especializada',
    code: 'EQ-DELTA',
    department: 'Saúde e Esterilização',
    supervisorName: 'Daniel Cassule',
    status: 'ACTIVE',
    membersCount: 3,
    createdAt: '2024-05-10'
  }
];

export const MOCK_ACTIVITIES: Activity[] = [
  {
    id: 'act-001',
    title: 'Desinfestação Periódica — Sonangol Sede',
    description: 'Tratamento trimestral dos pisos 1 a 12, cantina e garagens.',
    clientId: 'c1111111-1111-4111-8111-111111111111',
    clientName: 'Sonangol E.P. — Sede',
    serviceId: 's1111111-1111-4111-8111-111111111111',
    serviceName: 'Desinfestação e Controlo de Pragas Integrado',
    location: 'Rua do 1º de Maio, Luanda',
    activityDate: '2026-11-03',
    startTime: '08:00',
    endTime: '12:30',
    teamId: 't1111111-1111-4111-8111-111111111111',
    teamName: 'Equipa Alfa — Pragas & Biocidas',
    assignedProviderIds: ['p1111111-1111-4111-8111-111111111111'],
    supervisorName: 'Mateus Domingos',
    status: 'SCHEDULED'
  },
  {
    id: 'act-002',
    title: 'Higienização de Condutas AVAC — Unitel Talatona',
    description: 'Manutenção preventiva das condutas principais do piso 2.',
    clientId: 'c3333333-3333-4333-8333-333333333333',
    clientName: 'Unitel Luanda Sul — Centro Técnico',
    serviceId: 's2222222-2222-4222-8222-222222222222',
    serviceName: 'Higienização e Desinfeção de Condutas de Climatização',
    location: 'Via C3, Talatona',
    activityDate: '2026-11-04',
    startTime: '14:00',
    endTime: '18:00',
    teamId: 't2222222-2222-4222-8222-222222222222',
    teamName: 'Equipa Bravo — AVAC & Descontaminação',
    assignedProviderIds: ['p4444444-4444-4444-8444-444444444444'],
    supervisorName: 'Bernardo Kiala',
    status: 'SCHEDULED'
  },
  {
    id: 'act-003',
    title: 'Esterilização Cirúrgica — Hospital Geral',
    description: 'Desinfeção com nebulização térmica no bloco de cirurgia geral.',
    clientId: 'c4444444-4444-4444-8444-444444444444',
    clientName: 'Hospital Geral de Luanda',
    serviceId: 's5555555-5555-4555-8555-555555555555',
    serviceName: 'Desinfeção Hospitalar e Esterilização Ambiental',
    location: 'Kilamba Kiaxi, Luanda',
    activityDate: '2026-11-05',
    startTime: '06:00',
    endTime: '10:00',
    teamId: 't3333333-3333-4333-8333-333333333333',
    teamName: 'Equipa Delta — Higiene Hospitalar Especializada',
    assignedProviderIds: ['p3333333-3333-4333-8333-333333333333'],
    supervisorName: 'Daniel Cassule',
    status: 'SCHEDULED'
  }
];
