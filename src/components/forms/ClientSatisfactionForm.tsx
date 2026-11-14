import { traduzirErro } from '../../services/mensagensErro';
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { fetchTeamProvidersForPublic, isValidUuid, uploadEvaluationAudio } from '../../services/supabaseService';
import type { FormQuestion } from '../../types';
import { 
  Mic, 
  Square, 
  Play, 
  Pause, 
  Trash2, 
  Star, 
  CheckCircle2, 
  ArrowRight, 
  ArrowLeft, 
  Building2, 
  Briefcase, 
  UserCheck, 
  Calendar, 
  Volume2, 
  Sparkles, 
  X,
  AlertCircle,
  Search,
  PlusCircle,
  ShieldCheck
} from 'lucide-react';

interface ClientSatisfactionFormProps {
  onClose?: () => void;
  isModal?: boolean;
}

// Catálogo institucional oficial da AETERNU para apresentação e contingência (UUIDs RFC 4122)
export const DEFAULT_CATALOG_SERVICES = [
  { id: 'e1a80801-b234-4a21-99cd-000000000001', name: 'Higiene e Limpeza Profunda', code: 'SRV-HIG', description: 'Desinfeção, sanitização e limpeza técnica de instalações corporativas' },
  { id: 'e1a80802-b234-4a21-99cd-000000000002', name: 'Controlo Integrado de Pragas', code: 'SRV-PRG', description: 'Desinfestação, desratização e controlo biológico com certificação técnica' },
  { id: 'e1a80803-b234-4a21-99cd-000000000003', name: 'Auditoria de Segurança e HST', code: 'SRV-HST', description: 'Inspeção de conformidade normativa, prevenção de riscos e segurança no trabalho' },
  { id: 'e1a80804-b234-4a21-99cd-000000000004', name: 'Gestão de Resíduos e Ambiente', code: 'SRV-AMB', description: 'Recolha seletiva, transporte seguro e destinação ambiental de resíduos industriais' },
];

export const ClientSatisfactionForm: React.FC<ClientSatisfactionFormProps> = ({ onClose, isModal = false }) => {
  const { 
    services, 
    providers, 
    teams,
    activities,
    addEvaluation, 
    formQuestions,
    formCategories
  } = useApp();

  // Active step (1 to 4)
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [submittedReference, setSubmittedReference] = useState<string>('');

  // Step 1: Identificação da Empresa Cliente (Escrita Livre sem Enumeração)
  const [clientNameInput, setClientNameInput] = useState<string>('');

  // Lista de serviços exclusivamente do banco de dados (tabela services)
  const availableServices = useMemo(() => {
    return services && services.length > 0 ? services.filter(s => s.status === 'ACTIVE') : [];
  }, [services]);

  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  // Funcionários ativos da equipa escolhida (só nomes) e o escolhido
  const [teamProviders, setTeamProviders] = useState<{ id: string; name: string }[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string>('');
  const [customTeamName, setCustomTeamName] = useState<string>('');
  const [serviceDate, setServiceDate] = useState<string>(new Date().toISOString().substring(0, 10));

  // Ao escolher a equipa, carrega os seus funcionários. Com um só, fica selecionado automaticamente.
  useEffect(() => {
    let active = true;
    setSelectedProviderId('');
    setTeamProviders([]);
    if (!isValidUuid(selectedTeamId)) return;
    fetchTeamProvidersForPublic(selectedTeamId).then((list) => {
      if (!active) return;
      setTeamProviders(list);
      if (list.length === 1) setSelectedProviderId(list[0].id);
    });
    return () => { active = false; };
  }, [selectedTeamId]);

  // Equipas agendadas no calendário operacional para a data de serviço selecionada
  const scheduledTeamsForDate = useMemo(() => {
    const acts = activities.filter(a => a.activityDate === serviceDate);
    const teamNames = Array.from(new Set(acts.map(a => a.teamName).filter((n): n is string => Boolean(n))));
    return teams.filter(t => teamNames.includes(t.name) || teamNames.some(tn => tn && t.name.toLowerCase().includes(tn.toLowerCase())));
  }, [activities, teams, serviceDate]);

  // Step 2 & 3: Respostas das Perguntas
  // questionId -> rating (1-5)
  const [ratings, setRatings] = useState<Record<string, number>>({});
  // questionId -> text answer
  const [textAnswers, setTextAnswers] = useState<Record<string, string>>({});
  // Respostas dos tipos estruturados (escala 1-10, escolha única/múltipla, Sim/Não/N.A.)
  const [scaleAnswers, setScaleAnswers] = useState<Record<string, number>>({});
  const [choiceAnswers, setChoiceAnswers] = useState<Record<string, string>>({});
  const [multiAnswers, setMultiAnswers] = useState<Record<string, string[]>>({});
  const [yesNoAnswers, setYesNoAnswers] = useState<Record<string, 'YES' | 'NO' | 'NA'>>({});
  
  // Audio Recording State for open questions
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingDuration, setRecordingDuration] = useState<number>(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);
  const [audioError, setAudioError] = useState<string | null>(null);

  // Step 4: NPS & Recomendação
  const [npsScore, setNpsScore] = useState<number>(10);
  // NPS é opcional: só é gravado se o respondente escolher um valor
  const [npsAnswered, setNpsAnswered] = useState<boolean>(false);
  const [generalComment, setGeneralComment] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Refs for audio handling & memory management
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<any>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const recordingSessionIdRef = useRef<number>(0);

  // Initialize defaults if available (NUNCA auto-seleciona clientes para proteger o dossiê da AETERNU)
  useEffect(() => {
    if (availableServices.length > 0 && selectedServiceIds.length === 0) {
      setSelectedServiceIds([availableServices[0].id]);
    }
    if (teams.length > 0 && !selectedTeamId) {
      setSelectedTeamId(teams[0].id);
    }

    // Default ratings for RATING_5 questions
    const initialRatings: Record<string, number> = {};
    formQuestions.forEach(q => {
      if (q.type === 'RATING_5') {
        initialRatings[q.id] = 5;
      }
    });
    setRatings(initialRatings);
  }, [availableServices, teams, formQuestions]);

  // Clean up media stream, audio player, timer and memory on unmount
  useEffect(() => {
    return () => {
      recordingSessionIdRef.current += 1;
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop());
        mediaStreamRef.current = null;
      }
      if (audioElementRef.current) {
        audioElementRef.current.pause();
        audioElementRef.current.src = '';
        audioElementRef.current = null;
      }
      if (audioUrl && audioUrl.startsWith('blob:')) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  // Active filtered questions by selected services & general questions
  const activeQuestions = useMemo(() => {
    return formQuestions
      .filter(q => {
        if (!q.active) return false;
        // Categoria restrita a certos serviços: só aparece se algum deles estiver selecionado
        const cat = formCategories.find(c => c.code === q.category || c.id === q.category);
        // Categoria desativada: as suas perguntas não aparecem
        if (cat && cat.active === false) return false;
        if (cat?.serviceIds && cat.serviceIds.length > 0 && !cat.serviceIds.some(id => selectedServiceIds.includes(id))) return false;
        // General questions (no specific service_id) are always included for all services
        if (!q.service_id) return true;
        // Specific service questions are included if the service is selected
        return selectedServiceIds.includes(q.service_id);
      })
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [formQuestions, formCategories, selectedServiceIds]);

  const ratingQuestions = useMemo(() => activeQuestions.filter(q => q.type === 'RATING_5'), [activeQuestions]);
  const openQuestions = useMemo(() => activeQuestions.filter(q => q.type === 'AUDIO_AND_TEXT' || q.type === 'TEXT_ONLY' || q.type === 'SHORT_TEXT'), [activeQuestions]);
  const structuredQuestions = useMemo(
    () => activeQuestions.filter(q => ['RATING_10', 'SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'MULTI_CHOICE', 'YES_NO_NA'].includes(q.type)),
    [activeQuestions]
  );
  const isStructuredAnswered = (q: FormQuestion): boolean => {
    if (q.type === 'RATING_10') return scaleAnswers[q.id] !== undefined;
    if (q.type === 'MULTI_CHOICE') return (multiAnswers[q.id] || []).length > 0;
    if (q.type === 'YES_NO_NA') return yesNoAnswers[q.id] !== undefined;
    return Boolean(choiceAnswers[q.id]);
  };

  // Toggle selected service
  const toggleService = (srvId: string) => {
    if (selectedServiceIds.includes(srvId)) {
      if (selectedServiceIds.length > 1) {
        setSelectedServiceIds(selectedServiceIds.filter(id => id !== srvId));
      }
    } else {
      setSelectedServiceIds([...selectedServiceIds, srvId]);
    }
  };

  // Audio recording handlers — Gestão completa, sem conflito de buffers e sem retenção residual
  const deleteRecording = useCallback(() => {
    // 1. Invalidar token de sessão assíncrona para anular eventuais callbacks pendentes de FileReader
    recordingSessionIdRef.current += 1;

    // 2. Parar e descartar reprodutor de áudio se estiver ativo
    if (audioElementRef.current) {
      try {
        audioElementRef.current.pause();
        audioElementRef.current.currentTime = 0;
        audioElementRef.current.src = '';
      } catch {}
      audioElementRef.current = null;
    }

    // 3. Parar MediaRecorder ativo se ainda estiver a captar
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
    mediaRecorderRef.current = null;

    // 4. Parar todas as faixas do microfone para libertar hardware no dispositivo
    if (mediaStreamRef.current) {
      try {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
      } catch {}
      mediaStreamRef.current = null;
    }

    // 5. Cancelar temporizador
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    // 6. Revogar URL de Blob se aplicável para prevenir fuga de memória
    if (audioUrl && audioUrl.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(audioUrl);
      } catch {}
    }

    // 7. Esvaziar buffers de chunks
    audioChunksRef.current = [];

    // 8. Limpar estados React sincronizados de imediato
    setAudioUrl(null);
    setRecordingDuration(0);
    setIsRecording(false);
    setIsPlayingAudio(false);
    setAudioError(null);
  }, [audioUrl]);

  const stopRecording = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
    setIsRecording(false);
  }, []);

  const startRecording = async () => {
    // Limpeza integral de áudio anterior para garantir que não sobram buffers nem ficheiros obsoletos
    deleteRecording();
    setAudioError(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setAudioError('A gravação de voz não é suportada neste navegador ou dispositivo.');
      return;
    }

    const sessionId = recordingSessionIdRef.current;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });

      // Se o utilizador cancelou durante o diálogo de permissão
      if (recordingSessionIdRef.current !== sessionId) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }

      mediaStreamRef.current = stream;

      // Seleção defensiva de formato suportado (compatível com Safari iOS, Chrome Android e Desktop)
      let mimeType = '';
      if (typeof MediaRecorder !== 'undefined') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          mimeType = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        } else if (MediaRecorder.isTypeSupported('audio/aac')) {
          mimeType = 'audio/aac';
        } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
          mimeType = 'audio/ogg';
        }
      }

      const recorderOptions: MediaRecorderOptions = {};
      if (mimeType) recorderOptions.mimeType = mimeType;
      if (mimeType.includes('opus') || mimeType.includes('webm')) {
        recorderOptions.audioBitsPerSecond = 16000;
      }

      const mediaRecorder = Object.keys(recorderOptions).length > 0
        ? new MediaRecorder(stream, recorderOptions)
        : new MediaRecorder(stream);

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        // Se a sessão foi invalidada por eliminação ou nova gravação, descartar este ficheiro
        if (recordingSessionIdRef.current !== sessionId) {
          return;
        }

        const finalMime = mediaRecorder.mimeType || mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: finalMime });

        if (audioBlob.size < 100) {
          setAudioError('A gravação de áudio ficou vazia. Por favor, tente gravar novamente.');
          deleteRecording();
          return;
        }

        // Converter blob para base64 Data URL para armazenamento e reprodução universal
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          if (recordingSessionIdRef.current !== sessionId) {
            return; // Sessão foi eliminada enquanto o reader lia o ficheiro
          }
          const base64data = reader.result as string;
          setAudioUrl(base64data);
        };

        // Parar faixas de áudio para libertar o microfone
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach(track => track.stop());
          mediaStreamRef.current = null;
        }
      };

      mediaRecorder.start(250);
      setIsRecording(true);
      setRecordingDuration(0);

      timerIntervalRef.current = setInterval(() => {
        setRecordingDuration(prev => {
          if (prev >= 45) { // Limite estrito de 45 segundos
            stopRecording();
            return 45;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err: any) {
      console.error('Microphone error:', err);
      setAudioError('Não foi possível aceder ao microfone. Verifique as permissões do navegador ou escreva a resposta em texto.');
      deleteRecording();
    }
  };

  const togglePlayAudio = () => {
    if (!audioUrl) return;

    if (isPlayingAudio && audioElementRef.current) {
      audioElementRef.current.pause();
      setIsPlayingAudio(false);
      return;
    }

    if (!audioElementRef.current) {
      const audio = new Audio(audioUrl);
      audio.onended = () => setIsPlayingAudio(false);
      audio.onerror = () => {
        setIsPlayingAudio(false);
        setAudioError('Não foi possível reproduzir o áudio gravado.');
      };
      audioElementRef.current = audio;
    }

    audioElementRef.current.play().then(() => {
      setIsPlayingAudio(true);
    }).catch(err => {
      console.error('Audio play error:', err);
      setIsPlayingAudio(false);
      setAudioError('Não foi possível iniciar a reprodução no navegador.');
    });
  };

  const formatSeconds = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const remaining = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${remaining.toString().padStart(2, '0')}`;
  };

  // Stepper navigation logic
  // Stepper navigation logic
  const handleNext = () => {
    setErrorMessage('');
    if (currentStep === 1) {
      const clientName = clientNameInput.trim();
      if (!clientName || clientName.length < 2) {
        setErrorMessage('Por favor indique o nome da empresa cliente (mínimo 2 caracteres).');
        return;
      }
      if (clientName.length > 200) {
        setErrorMessage('O nome da empresa cliente não pode exceder 200 caracteres.');
        return;
      }
      if (selectedServiceIds.length === 0) {
        setErrorMessage('Selecione pelo menos um tipo de serviço prestado.');
        return;
      }
      setCurrentStep(2);
    } else if (currentStep === 2) {
      const missing = structuredQuestions.find(q => q.required && !isStructuredAnswered(q));
      if (missing) {
        setErrorMessage(`Responda à questão obrigatória: "${missing.text}".`);
        return;
      }
      setCurrentStep(3);
    } else if (currentStep === 3) {
      if (isRecording) {
        stopRecording();
      }
      setCurrentStep(4);
    }
  };

  const handleBack = () => {
    setErrorMessage('');
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Final submission
  const handleSubmitForm = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSubmitting) return;
    setErrorMessage('');
    setSubmitError(null);

    // Validate Step 1 basics
    const clientName = clientNameInput.trim();
    if (!clientName || clientName.length < 2) {
      setCurrentStep(1);
      setErrorMessage('Por favor indique o nome da empresa cliente (mínimo 2 caracteres) antes de submeter.');
      return;
    }
    if (clientName.length > 200) {
      setCurrentStep(1);
      setErrorMessage('O nome da empresa cliente não pode exceder 200 caracteres.');
      return;
    }

    if (selectedServiceIds.length === 0) {
      setCurrentStep(1);
      setErrorMessage('Selecione pelo menos um tipo de serviço prestado antes de submeter.');
      return;
    }

    if (npsScore < 0 || npsScore > 10) {
      setSubmitError('A pontuação NPS deve estar entre 0 e 10.');
      return;
    }

    setIsSubmitting(true);

    try {
      // Áudio: envia o conteúdo para o bucket privado e grava apenas o caminho interno
      let audioRef: string | undefined;
      if (audioUrl) {
        if (audioUrl.startsWith('data:')) {
          const blob = await (await fetch(audioUrl)).blob();
          const upload = await uploadEvaluationAudio(blob);
          if (!upload.success || !upload.path) {
            setSubmitError(upload.error || 'Falha ao enviar o áudio. A avaliação não foi gravada.');
            return;
          }
          audioRef = upload.path;
        } else {
          audioRef = audioUrl;
        }
      }

      // Determine client, services, provider
      const selectedServiceObjs = availableServices.filter(s => selectedServiceIds.includes(s.id));
      const serviceName = selectedServiceObjs.length > 0 
        ? selectedServiceObjs.map(s => s.name).join(', ') 
        : 'Serviço de Higiene e Ambiente';

      const teamObj = teams.find(t => t.id === selectedTeamId);
      const teamName = teamObj ? teamObj.name : (customTeamName.trim() || 'Equipa Técnica Operacional AETERNU');

      // Calculate average satisfaction rating from rating questions
      const ratingValues = Object.values(ratings);
      const scaleValues: number[] = Object.values(scaleAnswers);
      const averageRating = ratingValues.length > 0
        ? Math.round(ratingValues.reduce((a, b) => a + b, 0) / ratingValues.length)
        : scaleValues.length > 0
        // Sem estrelas no formulário: a perceção global deriva da escala 1-10 (convertida para 1-5)
        ? Math.min(5, Math.max(1, Math.round(scaleValues.reduce((a, b) => a + b, 0) / scaleValues.length / 2)))
        : null;
      if (averageRating === null) {
        setCurrentStep(2);
        setSubmitError('Responda às questões de avaliação antes de submeter.');
        return;
      }

      // Detailed answers map with static historical snapshot of question metadata
      const detailedAnswers: Record<string, { 
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
      }> = {};

      const questionsSnapshot = activeQuestions.map(q => ({
        id: q.id,
        text: q.text,
        category: q.category,
        type: q.type,
        required: q.required,
        service_id: q.service_id,
        // Configuração congelada no momento da resposta: permite mostrar o formulário tal como o cliente o viu
        description: q.description,
        options: q.options,
        optionScores: q.optionScores,
        yesScore: q.yesScore,
        noScore: q.noScore,
        affectsScore: q.affectsScore
      }));

      // Array canónico de respostas para validação do procedimento submit_evaluation no servidor
      const answersArray = activeQuestions.map(q => {
        const item: any = { questionId: q.id };
        if (q.type === 'RATING_5') {
          if (ratings[q.id] !== undefined) item.rating = ratings[q.id];
        }
        if (q.type === 'RATING_10' && scaleAnswers[q.id] !== undefined) item.rating = scaleAnswers[q.id];
        if (choiceAnswers[q.id]) item.choice = choiceAnswers[q.id];
        if ((multiAnswers[q.id] || []).length > 0) item.choices = multiAnswers[q.id];
        if (yesNoAnswers[q.id]) item.yesNo = yesNoAnswers[q.id];
        if (textAnswers[q.id]) {
          item.textAnswer = textAnswers[q.id];
        }
        if (q.type === 'AUDIO_AND_TEXT' && audioUrl) {
          item.audioUrl = audioRef;
        }
        return item;
      });

      activeQuestions.forEach(q => {
        detailedAnswers[q.id] = {
          rating: q.type === 'RATING_10' ? scaleAnswers[q.id] : ratings[q.id],
          choice: choiceAnswers[q.id],
          choices: (multiAnswers[q.id] || []).length > 0 ? multiAnswers[q.id] : undefined,
          yesNo: yesNoAnswers[q.id],
          textAnswer: textAnswers[q.id],
          audioUrl: q.type === 'AUDIO_AND_TEXT' ? (audioRef || undefined) : undefined,
          questionText: q.text,
          questionCategory: q.category,
          questionType: q.type,
          serviceId: q.service_id || undefined
        };
      });

      // Compile comment from open questions & general comment
      const openAnswers = Object.entries(textAnswers)
        .map(([qId, ans]) => {
          const qText = activeQuestions.find(q => q.id === qId)?.text || 'Questão';
          return `[${qText}]: ${ans}`;
        })
        .join('\n');

      const fullComment = [
        generalComment.trim(),
        openAnswers,
        audioUrl ? '*(Áudio de testemunho gravado pelo cliente)*' : ''
      ].filter(Boolean).join('\n\n');

      // Proteção de formato UUID: apenas envia se for formato UUID genuíno
      const validServiceId = isValidUuid(selectedServiceIds[0]) ? selectedServiceIds[0] : undefined;
      const validTeamId = isValidUuid(selectedTeamId) ? selectedTeamId : undefined;

      const result = await addEvaluation({
        clientId: undefined, // Submissão pública anónima SEMPRE gera client_id = NULL
        clientName,
        clientNameInput: clientName,
        serviceId: validServiceId,
        serviceName,
        providerId: selectedProviderId || undefined,
        providerName: teamName,
        teamId: validTeamId,
        teamName: teamName,
        serviceDate,
        satisfactionRating: Math.max(1, Math.min(5, averageRating)),
        npsScore: npsAnswered ? npsScore : undefined,
        comment: fullComment,
        audioRecordingUrl: audioRef || undefined,
        audioDurationSeconds: (audioUrl && recordingDuration > 0) ? recordingDuration : undefined,
        serviceTypesProvided: selectedServiceObjs.map(s => s.name),
        answers: answersArray,
        detailedAnswers,
        questionsSnapshot,
        status: 'PENDING_REVIEW',
        requiresFollowUp: averageRating <= 2 || (npsAnswered && npsScore <= 6),
        correctiveActionStatus: (averageRating <= 2 || (npsAnswered && npsScore <= 6)) ? 'PENDING' : 'NOT_NEEDED',
      });

      if (result.success) {
        setSubmittedReference(result.reference || '');
        setIsSubmitted(true);
        // Limpeza profunda de estados e ficheiros após submissão confirmada
        deleteRecording();
        setTextAnswers({});
        setGeneralComment('');
      } else {
        setSubmitError(result.error || 'Falha ao registar a avaliação no Supabase. Os seus dados foram preservados. Tente novamente.');
      }
    } catch (err: any) {
      setSubmitError(traduzirErro(err, 'Erro inesperado na comunicação com o Supabase.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartNewEvaluation = () => {
    setCurrentStep(1);
    setIsSubmitted(false);
    deleteRecording();
    setTextAnswers({});
    setGeneralComment('');
    setErrorMessage('');
    setSubmitError(null);
  };

  const stepTitles = [
    { step: 1, name: 'Identificação & Serviços', shortName: 'Identificação', desc: 'Dados da empresa, prestador e tipos de serviços prestados' },
    { step: 2, name: 'Avaliação de Desempenho', shortName: 'Critérios', desc: 'Pontuação de qualidade, pontualidade, segurança e atendimento' },
    { step: 3, name: 'Testemunho & Áudio', shortName: 'Testemunho & Voz', desc: 'Feedback detalhado por escrito ou gravação de microfone' },
    { step: 4, name: 'Recomendação & Envio', shortName: 'NPS & Conclusão', desc: 'Classificação final Net Promoter Score e envio seguro' },
  ];

  const progressPercent = Math.round((currentStep / 4) * 100);

  // NPS Promoter badge
  const getNpsCategory = (score: number) => {
    if (score >= 9) return { label: 'Promotor (Excelente)', color: 'text-brand border-brand/30 bg-brand/10' };
    if (score >= 7) return { label: 'Neutro (Satisfeito)', color: 'text-amber-400 border-amber-500/30 bg-amber-500/10' };
    return { label: 'Detrator (Necessita de Atenção)', color: 'text-rose-400 border-rose-500/30 bg-rose-500/10' };
  };

  return (
    <div className={`w-full min-h-screen bg-[#071324] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#0F2342] via-[#0A1628] to-[#050C16] text-slate-100 p-3 sm:p-6 lg:p-8 flex flex-col justify-between antialiased selection:bg-brand selection:text-slate-950 font-['Inter',sans-serif] relative overflow-x-hidden`}>
      
      {/* Luz ambiente e profundidade estética corporativa AETERNU */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[350px] bg-[#1E3A8A]/15 rounded-full blur-[120px] pointer-events-none -z-0"></div>
      <div className="absolute top-24 right-10 w-[420px] h-[320px] bg-brand-dark/15 rounded-full blur-[110px] pointer-events-none -z-0"></div>

      {/* CABEÇALHO DO FORMULÁRIO */}
      <header className="max-w-4xl w-full mx-auto mb-6 flex flex-col sm:flex-row items-center justify-between gap-4 bg-[#0B1A30]/90 backdrop-blur-md p-4 sm:p-5 rounded-2xl border border-[#1E3A5F] shadow-2xl relative z-10">
        {/* Logo AETERNU */}
        <div className="flex items-center gap-3.5">
          <div className="p-1.5 rounded-xl bg-[#071324] border border-[#1E3A5F] shadow-inner flex items-center justify-center">
            <svg className="w-9 h-9 flex-shrink-0" viewBox="0 0 100 100" fill="none">
              <defs>
                <linearGradient id="aeternuFormGradLeft" x1="0%" y1="100%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#2D6A28"/>
                  <stop offset="100%" stopColor="#8CBF26"/>
                </linearGradient>
                <linearGradient id="aeternuFormGradRight" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#8CBF26"/>
                  <stop offset="100%" stopColor="#1B4D1B"/>
                </linearGradient>
              </defs>
              <path d="M 20 85 L 50 15 L 68 50 L 50 85 Z" fill="url(#aeternuFormGradLeft)" />
              <path d="M 50 15 L 80 85 L 62 85 L 42 45 Z" fill="url(#aeternuFormGradRight)" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-black tracking-wider text-white leading-none block">AETERNU</span>
              <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-brand/20 text-brand border border-brand/30">
                SICSC
              </span>
            </div>
            <span className="text-[9px] font-bold tracking-widest text-brand uppercase block mt-1">
              HIGIENE · SEGURANÇA · AMBIENTE
            </span>
          </div>
        </div>

        {/* Indicador de Progresso com Explicação Transparente da Etapa & Fechar */}
        <div className="flex items-center gap-3">
          {/* Caixa de Progresso: Explica de onde vem a percentagem (Passo 1/4 = 25%) */}
          <div className="bg-[#071324] border border-[#1E3A5F] px-4 py-2 rounded-xl flex items-center gap-3.5 shadow-inner">
            <div className="text-right">
              <div className="flex items-center gap-1.5 justify-end">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Etapa</span>
                <span className="text-xs font-black text-brand">
                  Passo {currentStep} de 4 · {progressPercent}%
                </span>
              </div>
              <p className="text-[10px] text-slate-300 font-medium truncate max-w-[130px]">
                {stepTitles[currentStep - 1]?.shortName}
              </p>
            </div>

            {/* Micro Barra Segmentada de 4 Etapas */}
            <div className="flex items-center gap-1 w-20">
              {[1, 2, 3, 4].map((stepNum) => (
                <div 
                  key={stepNum}
                  className={`h-2.5 flex-1 rounded-sm transition-all duration-300 ${
                    stepNum <= currentStep 
                      ? 'bg-brand shadow-[0_0_8px_rgba(140,191,38,0.5)]' 
                      : 'bg-slate-700/60'
                  }`}
                  title={`Passo ${stepNum} de 4: ${stepTitles[stepNum - 1]?.name}`}
                />
              ))}
            </div>
          </div>

          {onClose && (
            <button 
              onClick={onClose}
              className="p-2.5 rounded-xl bg-[#071324] hover:bg-[#12243B] text-slate-300 hover:text-white transition border border-[#1E3A5F] hover:border-slate-500 shadow-md group"
              title="Fechar formulário e voltar ao painel"
            >
              <X className="w-5 h-5 group-hover:rotate-90 transition-transform duration-200" />
            </button>
          )}
        </div>
      </header>

      {/* CONTAINER PRINCIPAL DO FORMULÁRIO */}
      <main className="max-w-4xl w-full mx-auto bg-white rounded-3xl shadow-2xl border border-slate-200/90 overflow-hidden flex flex-col flex-1 relative z-10 text-slate-900">
        
        {/* NAVEGAÇÃO POR ABAS (STEPPER ELEGANTE) */}
        {!isSubmitted && (
          <div className="border-b border-slate-200 bg-slate-50/90 p-2.5 sm:p-3.5 overflow-x-auto">
            <div className="flex items-center min-w-max justify-around text-xs font-bold gap-2">
              {stepTitles.map((st) => {
                const isActive = currentStep === st.step;
                const isPast = currentStep > st.step;
                return (
                  <button 
                    key={st.step}
                    onClick={() => {
                      if (isPast) setCurrentStep(st.step);
                      else if (st.step === currentStep + 1) handleNext();
                    }}
                    className={`flex items-center gap-2.5 px-3.5 py-2 rounded-xl transition-all duration-150 border ${
                      isActive 
                        ? 'bg-brand/15 text-slate-950 border-brand shadow-xs font-black' 
                        : isPast
                        ? 'bg-white text-slate-800 border-slate-200 hover:border-slate-300 hover:bg-slate-100 font-semibold cursor-pointer'
                        : 'text-slate-400 border-transparent cursor-not-allowed opacity-75'
                    }`}
                  >
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black transition ${
                      isActive 
                        ? 'bg-brand text-black shadow-xs' 
                        : isPast
                        ? 'bg-brand-dark text-white'
                        : 'bg-slate-200 text-slate-500'
                    }`}>
                      {isPast ? <CheckCircle2 className="w-3.5 h-3.5" /> : st.step}
                    </span>
                    <span>{st.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* CONTEÚDO PRINCIPAL DO FORMULÁRIO */}
        <div className="p-5 sm:p-8 flex-1 flex flex-col justify-between">
          
          {/* Mensagem de Erro Global */}
          {(errorMessage || submitError) && (
            <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-950 text-xs flex items-center gap-3 font-medium">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <span>{errorMessage || submitError}</span>
            </div>
          )}

          {/* TELA DE SUCESSO APÓS SUBMISSÃO */}
          {isSubmitted ? (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-6">
              <div className="w-20 h-20 rounded-full bg-brand/20 border-2 border-brand-dark flex items-center justify-center text-brand-dark shadow-lg shadow-brand/20 animate-bounce">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <div className="space-y-2 max-w-lg">
                <span className="px-3.5 py-1 rounded-full text-xs font-black tracking-wider uppercase bg-brand/20 text-slate-950 border border-brand/40">
                  Avaliação Submetida com Sucesso
                </span>
                <h3 className="text-2xl font-black text-slate-950">Obrigado pelo seu parecer!</h3>
                <p className="text-xs text-slate-600 leading-relaxed font-medium">
                  O seu feedback é fundamental para o controlo da qualidade e melhoria contínua dos serviços de Higiene, Segurança e Ambiente da <strong className="text-slate-950 font-black">AETERNU LDA</strong>.
                </p>
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 mt-4 text-xs shadow-xs">
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Código de Referência da Avaliação:</span>
                  <span className="text-lg font-mono font-black text-brand-dark tracking-wider">{submittedReference}</span>
                </div>
              </div>

              <div className="pt-4 flex flex-wrap items-center justify-center gap-3">
                <button
                  onClick={handleStartNewEvaluation}
                  className="px-6 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-900 border border-slate-300 text-xs font-bold transition shadow-xs"
                >
                  Preencher Nova Avaliação
                </button>
                {onClose && (
                  <button
                    onClick={onClose}
                    className="px-6 py-2.5 rounded-xl bg-brand text-black font-black text-xs hover:bg-[#7cb01f] transition shadow-md"
                  >
                    Concluir e Voltar
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* ETAPA 1: Identificação & Tipos de Serviço */}
              {currentStep === 1 && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-xl font-black text-slate-950">Identificação da Intervenção</h3>
                    <p className="text-xs text-slate-600 mt-1 font-medium">
                      Indique a empresa cliente e os tipos de serviços prestados pela AETERNU.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Empresa Cliente — Escrita Livre (Sem Pesquisa nem Dependência de UUID) */}
                    <div className="space-y-2">
                      <label className="block text-xs font-black text-slate-950 uppercase tracking-wide flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-brand-dark" /> Empresa Cliente / Organização *
                        </span>
                        <span className="text-[10px] font-bold text-slate-500 lowercase">escrita livre</span>
                      </label>
                      
                      <div className="relative">
                        <Building2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          required
                          value={clientNameInput}
                          onChange={(e) => {
                            setClientNameInput(e.target.value);
                            setErrorMessage('');
                          }}
                          placeholder="Ex: Unitel, Sonangol, Banco BAI, Chevron..."
                          className="w-full bg-white border border-slate-300 text-slate-950 placeholder-slate-400 rounded-xl pl-10 pr-4 py-3 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand transition shadow-2xs"
                        />
                      </div>

                      <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-1 font-medium">
                        <ShieldCheck className="w-3 h-3 text-brand-dark flex-shrink-0" />
                        Escreva livremente a sua entidade. Os dados serão registados de forma confidencial para análise da AETERNU.
                      </p>
                    </div>

                    {/* Equipa Responsável */}
                    <div className="space-y-2">
                      <label className="block text-xs font-black text-slate-950 uppercase tracking-wide flex items-center gap-1.5">
                        <UserCheck className="w-3.5 h-3.5 text-brand-dark" /> Equipa Responsável *
                      </label>
                      {teams.length > 0 ? (
                        <select
                          value={selectedTeamId}
                          onChange={(e) => setSelectedTeamId(e.target.value)}
                          className="w-full bg-white border border-slate-300 text-slate-950 rounded-xl px-4 py-3 text-xs focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand font-medium shadow-2xs transition"
                        >
                          {teams.map(t => (
                            <option key={t.id} value={t.id} className="bg-white text-slate-950">{t.name} ({t.code}) - {t.department}</option>
                          ))}
                          <option value="custom" className="bg-white text-slate-950">Outra Equipa (Escrever Livremente)...</option>
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={customTeamName}
                          onChange={(e) => setCustomTeamName(e.target.value)}
                          placeholder="Nome da Equipa Operacional..."
                          className="w-full bg-white border border-slate-300 text-slate-950 placeholder-slate-400 rounded-xl px-4 py-3 text-xs focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand font-medium shadow-2xs transition"
                        />
                      )}
                      {selectedTeamId === 'custom' && teams.length > 0 && (
                        <input
                          type="text"
                          value={customTeamName}
                          onChange={(e) => setCustomTeamName(e.target.value)}
                          placeholder="Escreva o nome da equipa..."
                          className="w-full mt-2 bg-white border border-slate-300 text-slate-950 placeholder-slate-400 rounded-xl px-4 py-3 text-xs focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand font-medium shadow-2xs transition"
                        />
                      )}
                    </div>
                  </div>

                  {/* Funcionário que prestou o serviço (opcional quando a equipa tem vários) */}
                  {teamProviders.length > 1 && (
                    <div className="space-y-2">
                      <label className="block text-xs font-black text-slate-950 uppercase tracking-wide">Funcionário que prestou o serviço</label>
                      <select
                        value={selectedProviderId}
                        onChange={(e) => setSelectedProviderId(e.target.value)}
                        className="w-full bg-white border border-slate-300 text-slate-950 rounded-xl px-4 py-3 text-xs focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
                      >
                        <option value="">Não sei / não indicar</option>
                        {teamProviders.map((pr) => (
                          <option key={pr.id} value={pr.id} className="bg-white text-slate-950">{pr.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {teamProviders.length === 1 && (
                    <p className="text-xs text-slate-700">Funcionário que prestou o serviço: <strong>{teamProviders[0].name}</strong></p>
                  )}

                  {/* Data do Serviço */}
                  <div className="space-y-2">
                    <label className="block text-xs font-black text-slate-950 uppercase tracking-wide flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-brand-dark" /> Data da Intervenção *
                    </label>
                    <input
                      type="date"
                      value={serviceDate}
                      onChange={(e) => setServiceDate(e.target.value)}
                      className="w-full max-w-xs bg-white border border-slate-300 text-slate-950 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand font-bold shadow-2xs transition"
                    />
                  </div>

                  {/* Tipos de Serviços Prestados */}
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-black text-slate-950 uppercase tracking-wide flex items-center gap-1.5">
                        <Briefcase className="w-3.5 h-3.5 text-brand-dark" /> Tipos de Serviços Prestados *
                      </label>
                      <span className="text-[11px] text-slate-500 font-medium">Selecione todos os serviços aplicáveis</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                      {availableServices.map(srv => {
                        const isSelected = selectedServiceIds.includes(srv.id);
                        return (
                          <button
                            key={srv.id}
                            type="button"
                            onClick={() => toggleService(srv.id)}
                            className={`p-3.5 rounded-2xl border text-left text-xs transition flex items-start gap-3 ${
                              isSelected 
                                ? 'bg-brand/15 border-2 border-brand-dark text-slate-950 shadow-xs' 
                                : 'bg-white border border-slate-200 hover:border-slate-300 text-slate-900 hover:bg-slate-50'
                            }`}
                          >
                            <div className={`w-4 h-4 rounded-md mt-0.5 flex items-center justify-center flex-shrink-0 border transition ${
                              isSelected ? 'bg-brand border-brand-dark text-slate-950 font-black' : 'bg-white border-slate-300'
                            }`}>
                              {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-brand-dark" />}
                            </div>
                            <div>
                              <p className="font-black text-slate-950">{srv.name}</p>
                              <p className="text-[10px] text-slate-600 mt-0.5 line-clamp-1 font-medium">
                                {srv.code ? `${srv.code} — ` : ''}{srv.description || 'Intervenção técnica especializada AETERNU'}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* ETAPA 2: Avaliação de Desempenho (Escala de 1 a 5) */}
              {currentStep === 2 && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-xl font-black text-slate-950">Avaliação de Desempenho do Serviço</h3>
                    <p className="text-xs text-slate-600 mt-1 font-medium">
                      Classifique cada aspeto de 1 a 5 estrelas segundo o vosso grau de satisfação.
                    </p>
                  </div>

                  <div className="space-y-4">
                    {ratingQuestions.map((question, idx) => {
                      const currentVal = ratings[question.id] || 0;
                      const labels: Record<number, string> = {
                        0: 'Toque para classificar',
                        1: 'Péssimo (1★)',
                        2: 'Insuficiente (2★)',
                        3: 'Regular (3★)',
                        4: 'Bom (4★)',
                        5: 'Excelente (5★)'
                      };

                      return (
                        <div 
                          key={question.id}
                          className="p-5 bg-slate-50/70 border border-slate-200 rounded-2xl space-y-3 shadow-xs hover:border-slate-300 hover:bg-slate-50 transition"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-brand/20 text-slate-950 border border-brand/30">
                                  {question.category}
                                </span>
                                <h4 className="text-sm font-bold text-slate-950">
                                  {idx + 1}. {question.text}
                                </h4>
                              </div>
                              {question.description && (
                                <p className="text-xs text-slate-600 mt-1 font-medium">{question.description}</p>
                              )}
                            </div>
                            <span className="text-xs font-black text-slate-950 bg-white px-3 py-1 rounded-lg border border-slate-200 shadow-2xs self-start sm:self-auto">
                              {labels[currentVal]}
                            </span>
                          </div>

                          {/* 5-Star / Numeric Selector */}
                          <div className="flex items-center gap-2 pt-1">
                            {[1, 2, 3, 4, 5].map((starNum) => {
                              const isSelected = currentVal > 0 && starNum <= currentVal;
                              return (
                                <button
                                  key={starNum}
                                  type="button"
                                  onClick={() => setRatings({ ...ratings, [question.id]: starNum })}
                                  className={`flex-1 py-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 transition ${
                                    isSelected 
                                      ? 'bg-brand/25 border-2 border-brand-dark text-slate-950 font-black shadow-xs' 
                                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-950'
                                  }`}
                                >
                                  <Star className={`w-5 h-5 ${isSelected ? 'fill-brand-dark text-brand-dark' : 'text-slate-300'}`} />
                                  <span className="text-[11px] font-bold">{starNum}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Questões de escala, escolha e Sim/Não configuradas pelo RH */}
                  {structuredQuestions.length > 0 && (
                    <div className="space-y-4">
                      {structuredQuestions.map((q) => {
                        const options = q.options || [];
                        const chipBase = 'px-3 py-2 rounded-xl border text-xs font-bold transition';
                        const chipOn = 'bg-brand/25 border-2 border-brand-dark text-slate-950';
                        const chipOff = 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100';
                        return (
                          <div key={q.id} className="p-5 bg-slate-50/70 border border-slate-200 rounded-2xl space-y-3 shadow-xs">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-brand/20 text-slate-950 border border-brand/30">{q.category}</span>
                              <h4 className="text-sm font-bold text-slate-950">{q.text}{q.required ? ' *' : ''}</h4>
                            </div>
                            {q.description && <p className="text-xs text-slate-600 font-medium">{q.description}</p>}

                            {q.type === 'RATING_10' && (
                              <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5" role="radiogroup" aria-label={q.text}>
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                                  <button key={n} type="button" role="radio" aria-checked={scaleAnswers[q.id] === n}
                                    onClick={() => setScaleAnswers({ ...scaleAnswers, [q.id]: n })}
                                    className={`${chipBase} ${scaleAnswers[q.id] === n ? chipOn : chipOff}`}>{n}</button>
                                ))}
                              </div>
                            )}

                            {(q.type === 'SINGLE_CHOICE' || q.type === 'MULTIPLE_CHOICE') && (
                              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={q.text}>
                                {options.map((o) => (
                                  <button key={o} type="button" role="radio" aria-checked={choiceAnswers[q.id] === o}
                                    onClick={() => setChoiceAnswers({ ...choiceAnswers, [q.id]: o })}
                                    className={`${chipBase} ${choiceAnswers[q.id] === o ? chipOn : chipOff}`}>{o}</button>
                                ))}
                              </div>
                            )}

                            {q.type === 'MULTI_CHOICE' && (
                              <div className="flex flex-wrap gap-2" role="group" aria-label={q.text}>
                                {options.map((o) => {
                                  const on = (multiAnswers[q.id] || []).includes(o);
                                  return (
                                    <button key={o} type="button" aria-pressed={on}
                                      onClick={() => {
                                        const cur = multiAnswers[q.id] || [];
                                        setMultiAnswers({ ...multiAnswers, [q.id]: on ? cur.filter(x => x !== o) : [...cur, o] });
                                      }}
                                      className={`${chipBase} ${on ? chipOn : chipOff}`}>{on ? '✓ ' : ''}{o}</button>
                                  );
                                })}
                              </div>
                            )}

                            {q.type === 'YES_NO_NA' && (
                              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={q.text}>
                                {([['YES', 'Sim'], ['NO', 'Não'], ['NA', 'Não aplicável']] as const).map(([v, label]) => (
                                  <button key={v} type="button" role="radio" aria-checked={yesNoAnswers[q.id] === v}
                                    onClick={() => setYesNoAnswers({ ...yesNoAnswers, [q.id]: v })}
                                    className={`${chipBase} ${yesNoAnswers[q.id] === v ? chipOn : chipOff}`}>{label}</button>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ETAPA 3: Testemunho & Gravação de Áudio */}
              {currentStep === 3 && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-xl font-black text-slate-950">Testemunho & Feedback em Áudio</h3>
                    <p className="text-xs text-slate-600 mt-1 font-medium">
                      Algumas questões podem ser respondidas diretamente por gravação de voz com o seu microfone ou por escrito.
                    </p>
                  </div>

                  {/* Open Questions configuradas pelo RH */}
                  {openQuestions.map((q) => (
                    <div key={q.id} className="p-4 bg-slate-50/70 border border-slate-200 rounded-2xl space-y-2 shadow-xs">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-brand/20 text-slate-950 border border-brand/30">
                          {q.category}
                        </span>
                        <h4 className="text-xs font-bold text-slate-950">{q.text}</h4>
                      </div>
                      {q.description && <p className="text-[11px] text-slate-600 font-medium">{q.description}</p>}
                      <textarea
                        rows={2}
                        value={textAnswers[q.id] || ''}
                        onChange={(e) => setTextAnswers({ ...textAnswers, [q.id]: e.target.value })}
                        placeholder="Escreva a sua resposta ou observações aqui..."
                        className="w-full bg-white border border-slate-300 text-slate-950 rounded-xl p-3 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand shadow-2xs transition"
                      />
                    </div>
                  ))}

                  {/* GRAVADOR DE ÁUDIO OFICIAL AETERNU COM ESTÉTICA DE ESTÚDIO */}
                  <div className="bg-gradient-to-br from-[#0B1A30] to-[#071324] border border-[#1E3A5F] text-white rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center border ${
                          isRecording 
                            ? 'bg-red-500/20 border-red-500 text-red-400 animate-pulse' 
                            : audioUrl 
                            ? 'bg-brand/20 border-brand/40 text-brand' 
                            : 'bg-slate-800 border-slate-700 text-slate-400'
                        }`}>
                          <Mic className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="text-sm font-black text-white">Gravação de Depoimento por Voz</h4>
                          <p className="text-[11px] text-slate-400 font-medium">Grave comentários detalhados sobre o serviço prestado.</p>
                        </div>
                      </div>

                      {/* Timer & Status */}
                      <div className="flex items-center gap-2 bg-[#071324] px-3.5 py-1.5 rounded-xl border border-[#1E3A5F]">
                        {isRecording && <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping"></div>}
                        <span className={`text-xs font-mono font-bold ${isRecording ? 'text-red-400' : 'text-slate-300'}`}>
                          {formatSeconds(recordingDuration)} / 00:45
                        </span>
                      </div>
                    </div>

                    {/* Waveform / Visualizer */}
                    <div className="h-16 bg-[#050C16] rounded-2xl border border-[#1E3A5F] flex items-center justify-center gap-1.5 px-4 overflow-hidden">
                      {isRecording ? (
                        Array.from({ length: 28 }).map((_, i) => (
                          <div 
                            key={i} 
                            className="w-1.5 bg-brand rounded-full animate-bar shadow-[0_0_6px_rgba(140,191,38,0.7)]"
                            style={{ 
                              animationDelay: `${(i % 5) * 0.15}s`,
                              height: `${Math.max(8, (i * 7) % 36)}px`
                            }}
                          ></div>
                        ))
                      ) : audioUrl ? (
                        <div className="flex items-center gap-3 text-brand text-xs font-bold">
                          <CheckCircle2 className="w-5 h-5 text-brand" />
                          <span>Gravação de áudio capturada com sucesso ({formatSeconds(recordingDuration)})</span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 font-medium flex items-center gap-2">
                          <Mic className="w-4 h-4 text-slate-500" />
                          Pressione o botão abaixo para iniciar a gravação do seu microfone.
                        </span>
                      )}
                    </div>

                    {/* Audio Error Banner */}
                    {audioError && (
                      <div className="p-3 bg-red-950/50 border border-red-500/50 rounded-xl text-red-300 text-xs font-medium">
                        {audioError}
                      </div>
                    )}

                    {/* Controlo de Gravação / Player */}
                    <div className="flex flex-wrap items-center justify-center gap-3">
                      {!isRecording && !audioUrl && (
                        <button
                          type="button"
                          onClick={startRecording}
                          className="px-6 py-3 bg-brand hover:bg-[#7cb01f] text-slate-950 font-black rounded-xl text-xs flex items-center gap-2.5 shadow-lg shadow-brand/20 transition transform active:scale-95"
                        >
                          <Mic className="w-4 h-4" />
                          <span>Iniciar Gravação de Áudio</span>
                        </button>
                      )}

                      {isRecording && (
                        <button
                          type="button"
                          onClick={stopRecording}
                          className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-black rounded-xl text-xs flex items-center gap-2.5 shadow-lg shadow-red-600/30 transition transform active:scale-95"
                        >
                          <Square className="w-4 h-4 fill-current" />
                          <span>Parar Gravação</span>
                        </button>
                      )}

                      {audioUrl && !isRecording && (
                        <>
                          <button
                            type="button"
                            onClick={togglePlayAudio}
                            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs flex items-center gap-2 border border-slate-700 transition"
                          >
                            {isPlayingAudio ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
                            <span>{isPlayingAudio ? 'Pausar Áudio' : 'Ouvir Resposta'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={deleteRecording}
                            className="px-4 py-2.5 bg-slate-800/80 hover:bg-red-950/60 hover:text-red-300 text-slate-300 font-bold rounded-xl text-xs flex items-center gap-1.5 border border-slate-700 transition"
                          >
                            <Trash2 className="w-4 h-4" />
                            <span>Eliminar e Gravar Novamente</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Caixa de Texto Opcional Adicional */}
                  <div className="space-y-2">
                    <label className="block text-xs font-black text-slate-950 uppercase tracking-wide">
                      Comentários ou Sugestões Adicionais por Escrito (Opcional)
                    </label>
                    <textarea
                      rows={3}
                      value={generalComment}
                      onChange={(e) => setGeneralComment(e.target.value)}
                      placeholder="Descreva elogios, pontos de atenção ou notas para a Direção e Recursos Humanos..."
                      className="w-full bg-white border border-slate-300 text-slate-950 rounded-xl p-3.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand shadow-2xs transition"
                    />
                  </div>
                </div>
              )}

              {/* ETAPA 4: Recomendação (NPS) & Submissão */}
              {currentStep === 4 && (
                <div className="space-y-8">
                  <div>
                    <h3 className="text-xl font-black text-slate-950">Recomendação & Conclusão</h3>
                    <p className="text-xs text-slate-600 mt-1 font-medium">
                      Numa escala de 0 a 10, qual a probabilidade de recomendar os serviços da AETERNU?
                    </p>
                  </div>

                  {/* NPS Slider Interativo */}
                  <div className="bg-slate-50/70 p-6 sm:p-8 rounded-3xl border border-slate-200 space-y-6 shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-slate-950 uppercase tracking-wide">
                        Net Promoter Score (NPS)
                      </span>
                      <div className={`px-4 py-1.5 rounded-full border text-xs font-black ${
                        npsScore >= 9 ? 'bg-brand/20 border-brand/40 text-brand-dark' : npsScore >= 7 ? 'bg-amber-100 border-amber-300 text-amber-950' : 'bg-rose-100 border-rose-300 text-rose-950'
                      }`}>
                        {npsScore} / 10 — {getNpsCategory(npsScore).label}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <input
                        type="range"
                        min="0"
                        max="10"
                        step="1"
                        value={npsScore}
                        onChange={(e) => { setNpsScore(Number(e.target.value)); setNpsAnswered(true); }}
                        className="w-full h-3 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-brand-dark"
                      />
                      <div className="flex justify-between text-[11px] font-bold text-slate-600 px-1">
                        <span>0 (Nada Provável)</span>
                        <span>5 (Neutro)</span>
                        <span>10 (Extremamente Provável)</span>
                      </div>
                    </div>

                    {/* Numeric quick buttons */}
                    <div className="grid grid-cols-6 sm:grid-cols-11 gap-1.5 pt-2">
                      {Array.from({ length: 11 }).map((_, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => { setNpsScore(idx); setNpsAnswered(true); }}
                          className={`py-2 rounded-xl font-mono text-xs font-bold transition border ${
                            npsScore === idx 
                              ? 'bg-brand border-2 border-brand-dark text-slate-950 font-black shadow-sm scale-105' 
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {idx}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Resumo antes de submeter */}
                  <div className="bg-slate-50/70 p-5 rounded-2xl border border-slate-200 space-y-3 text-xs shadow-xs">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-950">
                      Resumo da Avaliação
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-slate-800">
                      <div>
                        <span className="text-slate-500 font-semibold block">Cliente:</span>
                        <strong className="text-slate-950 font-black">
                          {clientNameInput.trim() || 'Empresa Avaliadora'}
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-500 font-semibold block">Serviços Prestados:</span>
                        <strong className="text-slate-950 font-black">
                          {availableServices.filter(s => selectedServiceIds.includes(s.id)).map(s => s.name).join(', ') || 'Serviços de Higiene e Ambiente'}
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-500 font-semibold block">Gravação de Áudio:</span>
                        <strong className={audioUrl ? 'text-brand-dark font-black' : 'text-slate-500'}>
                          {audioUrl ? `Áudio Anexado (${formatSeconds(recordingDuration)})` : 'Nenhum áudio gravado'}
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-500 font-semibold block">Índice NPS:</span>
                        <strong className="text-brand-dark font-black">{npsScore} / 10</strong>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* BOTÕES DE NAVEGAÇÃO DO RODAPÉ */}
              <div className="pt-6 border-t border-slate-200 flex items-center justify-between gap-3">
                {currentStep > 1 ? (
                  <button
                    type="button"
                    onClick={handleBack}
                    className="px-5 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-950 font-bold text-xs flex items-center gap-2 border border-slate-300 shadow-2xs transition"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Voltar</span>
                  </button>
                ) : (
                  <div></div>
                )}

                {currentStep < 4 ? (
                  <button
                    type="button"
                    onClick={handleNext}
                    className="px-6 py-2.5 rounded-xl bg-brand hover:bg-[#7cb01f] text-slate-950 font-black text-xs flex items-center gap-2 shadow-md hover:shadow-lg transition transform active:scale-95"
                  >
                    <span>Avançar</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={handleSubmitForm}
                    className={`px-8 py-3 rounded-xl font-black text-xs flex items-center gap-2 shadow-lg transition transform ${
                      isSubmitting 
                        ? 'bg-slate-200 text-slate-500 cursor-not-allowed opacity-80' 
                        : 'bg-brand hover:bg-[#7cb01f] text-slate-950 shadow-brand/30 active:scale-95'
                    }`}
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin"></div>
                        <span>A Registar no Supabase...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Submeter Avaliação Oficial</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </>
          )}

        </div>
      </main>

      {/* RODAPÉ INSTITUCIONAL */}
      <footer className="max-w-4xl w-full mx-auto mt-6 text-center text-xs text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-2 relative z-10">
        <span className="text-slate-400">SICSC — Sistema Integrado de Controlo da Satisfação de Clientes &copy; 2026 AETERNU</span>
        <span className="text-brand text-[11px] font-semibold tracking-wide">Higiene | Segurança | Ambiente — Luanda, Angola</span>
      </footer>

    </div>
  );
};
