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

export const MOCK_CLIENTS: Client[] = [
  {
    id: 'c1111111-1111-4111-8111-111111111111',
    companyName: 'Sonangol E.P. — Sede',
    internalCode: 'CLI-SNG-01',
    contactPerson: 'Dr. Manuel Costa',
    email: 'm.costa@sonangol.co.ao',
    phone: '+244 923 111 222',
    nif: '5402134567',
    address: 'Rua do 1º de Maio, Edifício Sede',
    city: 'Luanda',
    sector: 'Energia & Petróleos',
    contractStart: '2025-01-01',
    contractEnd: '2027-12-31',
    notes: 'Contrato corporativo anual de HST e controlo de pragas integral.',
    contractedServices: ['Desinfestação e Controlo de Pragas Integrado', 'Higienização e Desinfeção de Condutas de Climatização'],
    status: 'ACTIVE',
    createdAt: '2025-01-01'
  },
  {
    id: 'c2222222-2222-4222-8222-222222222222',
    companyName: 'Banco BAI — Edifício Sede',
    internalCode: 'CLI-BAI-02',
    contactPerson: 'Dra. Teresa Bento',
    email: 't.bento@bancobai.ao',
    phone: '+244 912 333 444',
    nif: '5418723901',
    address: 'Avenida 4 de Fevereiro, nº 40',
    city: 'Luanda',
    sector: 'Banca & Instituições Financeiras',
    contractStart: '2025-03-01',
    contractEnd: '2026-12-31',
    notes: 'Intervenções programadas quinzenais fora do horário de atendimento ao público.',
    contractedServices: ['Limpeza e Descontaminação Industrial HST', 'Desinfestação e Controlo de Pragas Integrado'],
    status: 'ACTIVE',
    createdAt: '2025-03-01'
  },
  {
    id: 'c3333333-3333-4333-8333-333333333333',
    companyName: 'Unitel Luanda Sul — Centro Técnico',
    internalCode: 'CLI-UTL-03',
    contactPerson: 'Eng. Rui Afonso',
    email: 'r.afonso@unitel.ao',
    phone: '+244 924 555 666',
    nif: '5409831204',
    address: 'Via C3, Luanda Sul, Talatona',
    city: 'Talatona',
    sector: 'Telecomunicações & TI',
    contractStart: '2025-02-15',
    contractEnd: '2027-02-14',
    notes: 'Data centers com requisitos estritos de controlo microbiológico e ar condicionado.',
    contractedServices: ['Higienização e Desinfeção de Condutas de Climatização', 'Controlo de Qualidade do Ar Interior'],
    status: 'ACTIVE',
    createdAt: '2025-02-15'
  },
  {
    id: 'c4444444-4444-4444-8444-444444444444',
    companyName: 'Hospital Geral de Luanda',
    internalCode: 'CLI-HGL-04',
    contactPerson: 'Enfª Chefe Isabel Neto',
    email: 'qualidade@hgl.min-saude.ao',
    phone: '+244 931 777 888',
    nif: '5410098231',
    address: 'Estrada do Palanca, Kilamba Kiaxi',
    city: 'Luanda',
    sector: 'Saúde Pública & Hospitalar',
    contractStart: '2024-06-01',
    contractEnd: '2026-12-31',
    notes: 'Esterilização ambiental contínua e certificação técnica semanal.',
    contractedServices: ['Desinfeção Hospitalar e Esterilização Ambiental', 'Gestão e Tratamento de Resíduos Perigosos'],
    status: 'ACTIVE',
    createdAt: '2024-06-01'
  },
  {
    id: 'c5555555-5555-4555-8555-555555555555',
    companyName: 'ENANA — Aeroporto Internacional 4 de Fevereiro',
    internalCode: 'CLI-AER-05',
    contactPerson: 'Comandante Pedro Viana',
    email: 'operacoes@enana.co.ao',
    phone: '+244 922 888 999',
    nif: '5403214560',
    address: 'Avenida 21 de Janeiro, Aeroporto',
    city: 'Luanda',
    sector: 'Aviação & Logística',
    contractStart: '2024-01-01',
    contractEnd: '2026-12-31',
    notes: 'Desinfestação de aeronaves e controlo de vetores biológicos nos terminais.',
    contractedServices: ['Desinfestação e Controlo de Pragas Integrado'],
    status: 'ACTIVE',
    createdAt: '2024-01-01'
  }
];

export const MOCK_SERVICES: ServiceItem[] = [
  {
    id: 's1111111-1111-4111-8111-111111111111',
    name: 'Desinfestação e Controlo de Pragas Integrado',
    code: 'SRV-DPI-01',
    description: 'Tratamento de desbaratização, desratização e desinsetização biológica em edifícios corporativos e industriais.',
    status: 'ACTIVE',
    evaluationIndicator: 'CSAT_AND_NPS'
  },
  {
    id: 's2222222-2222-4222-8222-222222222222',
    name: 'Higienização e Desinfeção de Condutas de Climatização',
    code: 'SRV-AVAC-02',
    description: 'Limpeza mecânica e sanitização química de condutas de ar condicionado central e tratamento contra fungos.',
    status: 'ACTIVE',
    evaluationIndicator: 'CSAT_AND_NPS'
  },
  {
    id: 's3333333-3333-4333-8333-333333333333',
    name: 'Limpeza e Descontaminação Industrial HST',
    code: 'SRV-HST-03',
    description: 'Descontaminação de superfícies pesadas, áreas técnicas, plataformas e armazéns com protocolos HST certificados.',
    status: 'ACTIVE',
    evaluationIndicator: 'CSAT_AND_NPS'
  },
  {
    id: 's4444444-4444-4444-8444-444444444444',
    name: 'Gestão e Tratamento de Resíduos Perigosos',
    code: 'SRV-RES-04',
    description: 'Recolha seletiva, transporte seguro e homologação de incineração ou tratamento ambiental de resíduos perigosos.',
    status: 'ACTIVE',
    evaluationIndicator: 'CSAT'
  },
  {
    id: 's5555555-5555-4555-8555-555555555555',
    name: 'Desinfeção Hospitalar e Esterilização Ambiental',
    code: 'SRV-HOS-05',
    description: 'Protocolos de grau cirúrgico para blocos operatórios, enfermarias e laboratórios de análise clínica.',
    status: 'ACTIVE',
    evaluationIndicator: 'CSAT_AND_NPS'
  }
];

export const MOCK_PROVIDERS: Provider[] = [
  {
    id: 'p1111111-1111-4111-8111-111111111111',
    internalCode: 'TEC-101',
    name: 'Mateus Domingos',
    professionalEmail: 'mateus.domingos@aeternu.co.ao',
    phone: '+244 923 456 781',
    department: 'Operações de Terreno',
    services: ['Desinfestação e Controlo de Pragas Integrado', 'Limpeza e Descontaminação Industrial HST'],
    status: 'ACTIVE',
    createdAt: '2024-02-10',
    evaluationAccessAuthorized: true,
    accessAuthorizedAt: '2024-02-15T09:00:00Z',
    accessAuthorizedBy: 'Dra. Maria Fernandes (RH)'
  },
  {
    id: 'p2222222-2222-4222-8222-222222222222',
    internalCode: 'TEC-102',
    name: 'Sebastião Kuenda',
    professionalEmail: 'sebastiao.kuenda@aeternu.co.ao',
    phone: '+244 931 872 109',
    department: 'Operações de Terreno',
    services: ['Limpeza e Descontaminação Industrial HST', 'Gestão e Tratamento de Resíduos Perigosos'],
    status: 'ACTIVE',
    createdAt: '2024-04-12',
    evaluationAccessAuthorized: true,
    accessAuthorizedAt: '2024-04-20T10:30:00Z',
    accessAuthorizedBy: 'Dra. Maria Fernandes (RH)'
  },
  {
    id: 'p3333333-3333-4333-8333-333333333333',
    internalCode: 'TEC-103',
    name: 'Daniel Cassule',
    professionalEmail: 'daniel.cassule@aeternu.co.ao',
    phone: '+244 945 112 334',
    department: 'Saúde e HST Hospitalar',
    services: ['Desinfeção Hospitalar e Esterilização Ambiental', 'Higienização e Desinfeção de Condutas de Climatização'],
    status: 'ACTIVE',
    createdAt: '2024-05-02',
    evaluationAccessAuthorized: true,
    accessAuthorizedAt: '2024-05-10T14:15:00Z',
    accessAuthorizedBy: 'Dra. Maria Fernandes (RH)'
  },
  {
    id: 'p4444444-4444-4444-8444-444444444444',
    internalCode: 'TEC-104',
    name: 'Bernardo Kiala',
    professionalEmail: 'bernardo.kiala@aeternu.co.ao',
    phone: '+244 922 901 842',
    department: 'AVAC e Qualidade do Ar',
    services: ['Higienização e Desinfeção de Condutas de Climatização', 'Desinfestação e Controlo de Pragas Integrado'],
    status: 'ACTIVE',
    createdAt: '2024-08-18',
    evaluationAccessAuthorized: true,
    accessAuthorizedAt: '2024-08-25T11:00:00Z',
    accessAuthorizedBy: 'Dra. Maria Fernandes (RH)'
  }
];

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

export const MOCK_EVALUATIONS: Evaluation[] = [
  {
    id: 'e1111111-1111-4111-8111-111111111111',
    reference: 'AV-1001',
    clientId: 'c1111111-1111-4111-8111-111111111111',
    clientName: 'Sonangol E.P. — Sede',
    serviceId: 's1111111-1111-4111-8111-111111111111',
    serviceName: 'Desinfestação e Controlo de Pragas Integrado',
    providerId: 'p1111111-1111-4111-8111-111111111111',
    providerName: 'Mateus Domingos',
    serviceDate: '2026-10-27',
    evaluationDate: '2026-10-28',
    satisfactionRating: 5,
    npsScore: 10,
    comment: 'Excelente trabalho no piso administrativo e na cantina da sede. Técnicos com conduta exemplar e cumprimento integral das normas de segurança.',
    status: 'APPROVED',
    requiresFollowUp: false,
    correctiveActionStatus: 'NOT_NEEDED',
    technicalScore: 96,
    finalClassification: 'POSITIVE',
    finalizedAt: '2026-10-28T16:00:00Z',
    finalizedBy: 'Dra. Maria Fernandes (RH)'
  },
  {
    id: 'e2222222-2222-4222-8222-222222222222',
    reference: 'AV-1002',
    clientId: 'c2222222-2222-4222-8222-222222222222',
    clientName: 'Banco BAI — Edifício Sede',
    serviceId: 's3333333-3333-4333-8333-333333333333',
    serviceName: 'Limpeza e Descontaminação Industrial HST',
    providerId: 'p2222222-2222-4222-8222-222222222222',
    providerName: 'Sebastião Kuenda',
    serviceDate: '2026-10-28',
    evaluationDate: '2026-10-29',
    satisfactionRating: 4,
    npsScore: 9,
    comment: 'Muito rigorosos na limpeza das áreas técnicas do subsolo e casa de máquinas. Relatório técnico homologado com rapidez.',
    status: 'APPROVED',
    requiresFollowUp: false,
    correctiveActionStatus: 'NOT_NEEDED',
    technicalScore: 88,
    finalClassification: 'POSITIVE',
    finalizedAt: '2026-10-29T14:30:00Z',
    finalizedBy: 'Dra. Maria Fernandes (RH)'
  },
  {
    id: 'e3333333-3333-4333-8333-333333333333',
    reference: 'AV-1003',
    clientId: 'c4444444-4444-4444-8444-444444444444',
    clientName: 'Hospital Geral de Luanda',
    serviceId: 's5555555-5555-4555-8555-555555555555',
    serviceName: 'Desinfeção Hospitalar e Esterilização Ambiental',
    providerId: 'p3333333-3333-4333-8333-333333333333',
    providerName: 'Daniel Cassule',
    serviceDate: '2026-10-29',
    evaluationDate: '2026-10-30',
    satisfactionRating: 5,
    npsScore: 10,
    comment: 'Desinfeção nos blocos operatórios realizada com o mais elevado rigor sanitário. Protocolo cumprido à risca.',
    status: 'APPROVED',
    requiresFollowUp: false,
    correctiveActionStatus: 'NOT_NEEDED',
    technicalScore: 98,
    finalClassification: 'POSITIVE',
    finalizedAt: '2026-10-30T17:15:00Z',
    finalizedBy: 'Dra. Maria Fernandes (RH)'
  },
  {
    id: 'e4444444-4444-4444-8444-444444444444',
    reference: 'AV-1004',
    clientId: 'c3333333-3333-4333-8333-333333333333',
    clientName: 'Unitel Luanda Sul — Centro Técnico',
    serviceId: 's2222222-2222-4222-8222-222222222222',
    serviceName: 'Higienização e Desinfeção de Condutas de Climatização',
    providerId: 'p4444444-4444-4444-8444-444444444444',
    providerName: 'Bernardo Kiala',
    serviceDate: '2026-10-30',
    evaluationDate: '2026-10-31',
    satisfactionRating: 3,
    npsScore: 7,
    comment: 'A higienização foi concluída, mas o produto residual teve odor forte durante o turno da tarde. Sugerimos pré-aviso para ventilação prolongada.',
    status: 'PENDING_REVIEW',
    requiresFollowUp: true,
    correctiveActionStatus: 'PENDING'
  },
  {
    id: 'e5555555-5555-4555-8555-555555555555',
    reference: 'AV-1005',
    clientId: 'c5555555-5555-4555-8555-555555555555',
    clientName: 'ENANA — Aeroporto Internacional 4 de Fevereiro',
    serviceId: 's1111111-1111-4111-8111-111111111111',
    serviceName: 'Desinfestação e Controlo de Pragas Integrado',
    providerId: 'p1111111-1111-4111-8111-111111111111',
    providerName: 'Mateus Domingos',
    serviceDate: '2026-10-31',
    evaluationDate: '2026-11-01',
    satisfactionRating: 5,
    npsScore: 10,
    comment: 'Intervenção no terminal de cargas rápida e sem interrupção dos voos operacionais. Muito satisfeitos.',
    status: 'PENDING_REVIEW',
    requiresFollowUp: false,
    correctiveActionStatus: 'NOT_NEEDED'
  }
];

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
