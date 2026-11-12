export type UserRole = 'ADMIN' | 'HR' | 'DIRECTOR' | 'OPERATIONAL' | 'PROVIDER';

export interface UserProfile {
  allowedPages?: string[];
  mustChangePassword?: boolean;
  id: string;
  name: string;
  email: string;
  role: UserRole;
  providerId?: string; // If role is PROVIDER
  department: string;
  avatarUrl?: string;
  active: boolean;
  lastLogin?: string;
}

export interface Client {
  id: string;
  companyName: string;
  internalCode: string;
  nif?: string;
  contactPerson: string;
  email: string;
  phone: string;
  address?: string;
  city?: string;
  sector?: string;
  contractStart?: string; // 'YYYY-MM-DD'
  contractEnd?: string;   // 'YYYY-MM-DD'
  notes?: string;
  contractedServices: string[];
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
}

export type GoalMetric = 'CSAT' | 'NPS' | 'EVALUATION_COUNT';
export type GoalStatus = 'PENDENTE' | 'EM_CURSO' | 'CONCLUIDA' | 'NAO_CUMPRIDA';

export interface ClientGoal {
  id: string;
  clientId: string;
  title: string;
  description?: string;
  metric: GoalMetric;
  targetValue: number;
  dueDate: string;     // 'YYYY-MM-DD'
  status: GoalStatus;
  achievedAt?: string;
  createdBy?: string;
  createdAt: string;
}

export interface ServiceItem {
  id: string;
  name: string;
  code: string;
  description: string;
  status: 'ACTIVE' | 'INACTIVE';
  evaluationIndicator: 'CSAT' | 'NPS' | 'CSAT_AND_NPS';
}

export interface Provider {
  id: string;
  /** Equipa a que o prestador pertence (usada para associar automaticamente o funcionário à avaliação). */
  teamId?: string;
  internalCode: string;
  name: string;
  professionalEmail: string;
  phone?: string;
  specialty?: string;
  department?: string;
  services: string[];
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  evaluationAccessAuthorized: boolean;
  accessAuthorizedAt?: string;
  accessAuthorizedBy?: string;
}

export type QuestionType =
  | 'RATING_5'        // estrelas 1 a 5
  | 'RATING_10'       // escala numérica 1 a 10
  | 'NPS_10'          // NPS 0 a 10
  | 'SINGLE_CHOICE'   // múltipla escolha, seleção única
  | 'MULTI_CHOICE'    // múltipla escolha, seleção múltipla
  | 'MULTIPLE_CHOICE' // legado: tratado como seleção única
  | 'YES_NO_NA'       // pergunta fechada Sim / Não / Não aplicável
  | 'TEXT_ONLY'       // pergunta aberta (texto livre)
  | 'SHORT_TEXT'      // pergunta aberta curta
  | 'AUDIO_AND_TEXT'; // nota de áudio + argumento escrito
export type QuestionCategory = 'QUALIDADE' | 'PONTUALIDADE' | 'SEGURANCA' | 'ATENDIMENTO' | 'GERAL' | string;

export interface FormCategoryItem {
  id: string;
  /** Serviços em que a categoria se aplica; vazio ou omitido = todos os serviços. */
  serviceIds?: string[];
  name: string;
  code: string;
  description?: string;
  color?: string;
  badgeBg?: string;
  active?: boolean;
  display_order?: number;
}

export interface FormQuestion {
  id: string;
  text: string;
  description?: string;
  category: QuestionCategory;
  type: QuestionType;
  required: boolean;
  active: boolean;
  order: number;
  service_id?: string;
  options?: string[];
  /** Conformidade (0 a 1) de cada opção; opções sem valor ficam fora do cálculo. */
  optionScores?: Record<string, number>;
  /** Conformidade (0 a 1) das respostas Sim / Não (Não aplicável fica sempre fora do cálculo). */
  yesScore?: number;
  noScore?: number;
  /** Quando falso, a resposta é mostrada ao auditor mas não influencia a nota sugerida. */
  affectsScore?: boolean;
}

export interface Evaluation {
  id: string;
  reference: string;
  clientId?: string;
  clientName: string;
  clientNameInput?: string;
  serviceId?: string;
  serviceName: string;
  providerId?: string;
  providerName: string;
  providerNameInput?: string;
  teamId?: string;
  teamName?: string;
  /** Avaliação qualitativa do auditor (áudio, argumentos escritos e notas por questão). */
  auditorReview?: AuditorReview;
  answers?: Array<{
    questionId: string;
    rating?: number;
    textAnswer?: string;
    audioUrl?: string;
  }>;
  serviceDate: string;
  evaluationDate: string;
  satisfactionRating: number; // 1 to 5 (Client overall perception)
  npsScore?: number; // 0 to 10
  comment: string;
  audioRecordingUrl?: string; // Voice feedback recording (base64 or object URL)
  audioDurationSeconds?: number;
  serviceTypesProvided?: string[]; // Multiple service types selected by client
  detailedAnswers?: Record<string, { 
    rating?: number; 
    textAnswer?: string; 
    audioUrl?: string;
    choice?: string;
    choices?: string[];
    yesNo?: 'YES' | 'NO' | 'NA';
    questionText?: string;
    questionCategory?: string;
    questionType?: string;
    serviceId?: string;
  }>;
  questionsSnapshot?: Array<{
    id: string;
    text: string;
    category: string;
    type: string;
    required: boolean;
    service_id?: string;
    description?: string;
    options?: string[];
    optionScores?: Record<string, number>;
    yesScore?: number;
    noScore?: number;
    affectsScore?: boolean;
  }>;
  status: 'PENDING_REVIEW' | 'REVIEWED' | 'APPROVED' | 'RESOLVED' | 'ARCHIVED';
  requiresFollowUp: boolean;
  correctiveActionStatus: 'NOT_NEEDED' | 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  
  // Módulo de Recursos Humanos: Avaliação Técnica Ponderada (0-100%)
  technicalScore?: number; // Pontuação oficial ponderada (0 a 100%)
  finalClassification?: 'POSITIVE' | 'NEGATIVE';
  finalizedAt?: string;
  finalizedBy?: string;
  criteriaSnapshot?: EvaluationHistoricalSnapshot;
  criterionRatings?: Record<string, number>; // Notas atribuídas por critério (ex: c1: 4, c2: 4.5, c3: 5, c4: 3)
}

export interface EvaluationQueueCounts {
  total: number;
  unassignedClient: number;
  unassignedProvider: number;
  readyToFinalize: number;
  homologated: number;
}


export interface HRCase {
  id: string;
  evaluationId: string;
  occurrenceType: 'QUALIDADE_SERVICO' | 'COMPORTAMENTO' | 'ATRASO' | 'SEGURANCA' | 'ELOGIO';
  internalNotes: string;
  assignedTo: string;
  correctiveAction: string;
  status: 'ABERTO' | 'EM_ANALISE' | 'RESOLVIDO';
  resolutionDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderPermissionAudit {
  id: string;
  providerId: string;
  providerName: string;
  previousState: boolean;
  newState: boolean;
  changedBy: string;
  changedAt: string;
  reason: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  userEmail: string;
  userName: string;
  operationType: 'CREATE' | 'UPDATE' | 'DELETE' | 'GRANT_ACCESS' | 'REVOKE_ACCESS' | 'EXPORT' | 'LOGIN';
  affectedEntity: string;
  recordId?: string;
  result: 'SUCCESS' | 'WARNING' | 'DENIED';
  details: string;
}

export interface Team {
  id: string;
  name: string;
  code: string;
  department: string;
  supervisorName?: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  membersCount?: number;
}

export interface Activity {
  id: string;
  title: string;
  description?: string;
  clientId?: string;
  clientName?: string;
  serviceId?: string;
  serviceName?: string;
  location: string;
  activityDate: string; // 'YYYY-MM-DD'
  startTime: string;    // 'HH:MM'
  endTime: string;      // 'HH:MM'
  teamId?: string;
  teamName?: string;
  assignedProviderIds: string[];
  supervisorName?: string;
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'CONFLICT';
}

export interface EvaluationCriterion {
  id: string;
  /** Código da categoria do formulário a que o critério corresponde (ex.: QUALIDADE). */
  categoryCode?: string;
  categoryName: string;
  description?: string;
  weightPercentage: number; // 0 a 100, soma dos ativos deve ser 100%
  maxScore: number;         // Pontuação máxima (ex: 5)
  minScore?: number;        // Pontuação mínima (ex: 0 ou 1)
  active: boolean;          // Critério ativo para novas avaliações
  order?: number;
  updatedAt?: string;
  updatedBy?: string;
}

export interface CriterionScoreSnapshot {
  criterionId: string;
  categoryName: string;
  weightPercentage: number;
  maxScore: number;
  scoreObtained: number;
  normalizedPercentage: number; // (scoreObtained ÷ maxScore) × 100
  weightedContribution: number;  // (scoreObtained ÷ maxScore) × weightPercentage
}

export interface EvaluationHistoricalSnapshot {
  versionId: string;
  finalizedAt: string;
  finalizedBy: string; // Nome e cargo do avaliador de RH
  finalScore: number;  // Resultado ponderado oficial (0 a 100%)
  passingThreshold: number; // Limiar de aprovação aplicado (ex: 70%)
  classification: 'POSITIVE' | 'NEGATIVE';
  criteriaSnapshot: CriterionScoreSnapshot[];
  formula: string; // Fórmula descritiva auditável
}

export interface CriteriaConfiguration {
  id: string;
  version: number;
  passingThreshold: number; // Limite de aprovação configurável (ex: 70%)
  criteria: EvaluationCriterion[];
  updatedAt: string;
  updatedBy: string;
}

export interface WorkerNotification {
  id: string;
  evaluationId: string;
  evaluationReference?: string;
  providerId: string;
  providerName?: string;
  finalScore: number;
  resultStatus: 'POSITIVE' | 'NEGATIVE';
  notifiedAt: string;
  notifiedBy: string;
  sharedFeedback?: string;
}



/** Nota qualitativa do auditor (0 a 5) sobre um conteúdo livre do cliente. */
export interface QualitativeScore {
  score: number;
  notes?: string;
}

/** Avaliação do auditor sobre os conteúdos que não são numéricos. */
export interface AuditorReview {
  audio?: QualitativeScore & { transcript?: string };
  writtenArguments?: QualitativeScore;
  perQuestion?: Record<string, QualitativeScore>;
}
