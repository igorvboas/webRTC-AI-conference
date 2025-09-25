// transcription.js - Gerenciador de transcrição em tempo real (usando proxy backend)

class TranscriptionManager {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.isTranscribing = false;
        this.currentTranscript = '';
        this.transcriptHistory = [];
        this.audioProcessor = null;
        this.lastSpeaker = null; // Rastrear último falante
        this.currentSpeechText = ''; // Texto da fala atual sendo construída
    }

    /**
     * Define a referência do socket.io
     */
    setSocket(socketInstance) {
        this.socket = socketInstance;
        this.setupSocketListeners();
    }

    /**
     * Define a referência do AudioProcessor
     */
    setAudioProcessor(audioProcessorInstance) {
        this.audioProcessor = audioProcessorInstance;
    }

    /**
     * Configura listeners do socket.io para transcrição
     */
    setupSocketListeners() {
        // Mensagens da OpenAI
        this.socket.on('transcription:message', (data) => {
            this.handleMessage(data);
        });

        // Erros
        this.socket.on('transcription:error', (data) => {
            logError('Erro:', data.error);
            this.isConnected = false;
        });

        // Desconexão
        this.socket.on('transcription:disconnected', () => {
            log('Desconectado da OpenAI');
            this.isConnected = false;
        });

        // ========== RECEBER TRANSCRIÇÃO DE OUTRO PEER ==========
        this.socket.on('receiveTranscriptionFromPeer', (data) => {
            const { transcription, from } = data;
            log('📩 Transcrição recebida de', from, ':', transcription);
            this.displayTranscript(transcription, from, false);
        });
        // ========================================================
    }

    /**
     * Inicializa a conexão com OpenAI através do proxy
     */
    async init() {
        log('Inicializando TranscriptionManager...');
        
        if(!this.socket){
            logError('Socket.io não foi definido! Chame setSocket() primeiro');
            return false;
        }

        try {
            await this.connect();
            return true;
        } catch (error) {
            logError('Erro ao inicializar:', error);
            return false;
        }
    }

    /**
     * Conecta via proxy do backend
     */
    async connect() {
        return new Promise((resolve, reject) => {
            log('Conectando via proxy backend...');
            
            // Timeout de conexão
            const connectionTimeout = setTimeout(() => {
                reject(new Error('Timeout na conexão'));
            }, 10000);

            // Solicitar conexão ao backend
            this.socket.emit('transcription:connect', {}, (response) => {
                clearTimeout(connectionTimeout);
                
                if(response.success){
                    log('✅ Conectado via proxy!');
                    this.isConnected = true;
                    
                    // Configurar sessão após conectar
                    setTimeout(() => this.configureSession(), 500);
                    resolve();
                } else {
                    logError('Falha na conexão:', response.error);
                    reject(new Error(response.error));
                }
            });
        });
    }

    /**
     * Configura a sessão do OpenAI Realtime
     */
    configureSession() {
        log('Configurando sessão...');
        
        const sessionConfig = {
            type: 'session.update',
            session: {
                // ✅ APENAS TEXTO: Sem áudio de resposta do assistente
                modalities: ['text'],
                
                // ✅ INSTRUÇÕES CLARAS: Apenas transcrever, nunca responder
                instructions: 'Você é um assistente de transcrição. Apenas transcreva o áudio recebido em português brasileiro. NUNCA responda, NUNCA comente, NUNCA interaja. Apenas transcreva exatamente o que foi dito, palavra por palavra.',
                
                // ✅ FORMATO DE INPUT: PCM16 para áudio recebido
                input_audio_format: CONFIG.AUDIO.FORMAT,
                
                // ✅ TRANSCRIÇÃO DE INPUT: Usar Whisper para transcrever áudio do usuário
                input_audio_transcription: {
                    model: 'whisper-1'
                },
                
                // ✅ DETECÇÃO DE VOZ: VAD (Voice Activity Detection) automático
                turn_detection: {
                    type: 'server_vad', // Server-side Voice Activity Detection
                    threshold: 0.5,      // Sensibilidade (0.0 a 1.0)
                    prefix_padding_ms: 300,    // Capturar 300ms antes da fala
                    silence_duration_ms: 500   // Considerar pausa após 500ms de silêncio
                },
                
                // ❌ REMOVIDO: voice, output_audio_format, temperature, max_response_output_tokens
                // Não queremos que o assistente gere qualquer tipo de resposta
            }
        };

        this.send(sessionConfig);
        log('✅ Sessão configurada para transcrição apenas (sem respostas)');
    }

    /**
     * Envia mensagem através do proxy
     */
    send(data) {
        if (!this.isConnected || !this.socket) {
            logWarning('Não conectado ao proxy');
            return false;
        }

        try {
            this.socket.emit('transcription:send', JSON.stringify(data));
            return true;
        } catch (error) {
            logError('Erro ao enviar mensagem:', error);
            return false;
        }
    }

    /**
     * Processa mensagens recebidas do WebSocket
     */
    handleMessage(data) {
        try {
            const message = JSON.parse(data);
            log('📨 Mensagem recebida:', message.type);

            switch (message.type) {
                case 'session.created':
                    log('✅ Sessão criada:', message.session);
                    break;

                case 'session.updated':
                    log('✅ Sessão atualizada');
                    break;

                case 'input_audio_buffer.committed':
                    log('✅ Buffer de áudio confirmado');
                    break;

                case 'input_audio_buffer.speech_started':
                    log('🎤 Fala detectada!');
                    this.isTranscribing = true;
                    break;

                case 'input_audio_buffer.speech_stopped':
                    log('🤐 Fala pausada');
                    // Finalizar a fala atual quando detectar pausa
                    this.finalizeSpeech();
                    break;

                case 'conversation.item.created':
                    log('💬 Item de conversa criado:', message.item);
                    this.handleTranscription(message.item);
                    break;

                case 'conversation.item.input_audio_transcription.completed':
                    log('📝 Transcrição de input completa:', message.transcript);
                    // ✅ ÚNICO evento correto: transcrição do áudio do USUÁRIO
                    // Este evento contém APENAS o que o usuário falou, sem respostas do assistente
                    this.processUserTranscription(message.transcript);
                    break;

                case 'response.created':
                    log('🤖 Resposta criada');
                    // ⚠️ Ignorado: não queremos respostas do assistente
                    break;

                case 'response.output_item.added':
                    log('📤 Item de output adicionado:', message.item);
                    // ⚠️ Ignorado: outputs são respostas do assistente
                    break;

                case 'response.content_part.added':
                    log('📝 Parte de conteúdo adicionada');
                    // ⚠️ Ignorado: conteúdo gerado pelo assistente
                    break;

                case 'response.audio_transcript.delta':
                    log('📝 Delta de transcrição de áudio:', message.delta);
                    // ⚠️ Ignorado: transcrição do áudio gerado pelo assistente
                    break;

                // ❌ REMOVIDO: response.text.delta
                // Este evento capturava RESPOSTAS DO ASSISTENTE, não transcrições do usuário
                // Era a causa do problema 2 (texto do agente aparecendo)

                case 'response.done':
                    log('✅ Resposta completa');
                    break;

                case 'error':
                    logError('❌ Erro da API:', message.error);
                    break;

                default:
                    log('📦 Tipo de mensagem:', message.type, message);
            }
        } catch (error) {
            logError('Erro ao processar mensagem:', error);
        }
    }

    /**
     * Processa a transcrição do usuário (novo método específico)
     */
    processUserTranscription(transcript) {
        if (!transcript) return;

        log('🔍 DEBUG - didIOffer:', typeof didIOffer !== 'undefined' ? didIOffer : 'undefined');
        log('🔍 DEBUG - remoteUserName:', typeof remoteUserName !== 'undefined' ? remoteUserName : 'undefined');
        log('🔍 DEBUG - userName:', typeof userName !== 'undefined' ? userName : 'undefined');

        // ========== LÓGICA DE DECISÃO: EXIBIR OU ENVIAR ==========
        
        // CASO 1: Sou o OFFERER (quem iniciou a chamada)
        if (typeof didIOffer !== 'undefined' && didIOffer === true) {
            log('✅ Sou OFFERER - exibindo localmente');
            this.displayTranscript(
                transcript, 
                typeof userName !== 'undefined' ? userName : 'Você', 
                true
            );
        } 
        // CASO 2: Sou o ANSWERER (quem atendeu a chamada)
        else if (typeof didIOffer !== 'undefined' && didIOffer === false) {
            // ✅ CORREÇÃO PROBLEMA 1: Answerer SEMPRE envia, NUNCA exibe localmente
            if (typeof remoteUserName !== 'undefined' && remoteUserName) {
                log('✅ Sou ANSWERER - enviando para offerer:', remoteUserName);
                this.sendTranscriptionToPeer(transcript, remoteUserName);
            } else {
                logError('❌ ANSWERER sem remoteUserName definido!');
            }
        } 
        // CASO 3: FALLBACK (não deveria acontecer em produção)
        else {
            logWarning('⚠️ FALLBACK - variáveis não definidas corretamente');
            logWarning('Isso indica um problema de inicialização');
            // ❌ REMOVIDO: Não exibir mais no fallback para evitar duplicação
            // this.displayTranscript(transcript, 'Você', true);
        }
    }

    /**
     * Processa transcrição
     */
    handleTranscription(item) {
        if (item.type === 'message' && item.role === 'user') {
            const content = item.content?.[0];
            if (content?.type === 'input_audio' && content.transcript) {
                log('📝 Transcrição do usuário:', content.transcript);
                
                // Verificar se deve exibir localmente ou enviar para outro peer
                // didIOffer e userName são variáveis globais do scripts.js
                if (typeof didIOffer !== 'undefined' && didIOffer === true) {
                    // Sou o OFFERER (quem ligou) - Exibir localmente
                    this.displayTranscript(content.transcript, userName, true);
                } else if (typeof didIOffer !== 'undefined' && didIOffer === false && remoteUserName) {
                    // Sou o ANSWERER (quem atendeu) - Enviar para o offerer
                    this.sendTranscriptionToPeer(content.transcript, remoteUserName);
                } else {
                    // Fallback: exibir localmente
                    this.displayTranscript(content.transcript, userName, true);
                }
            }
        }
    }

    /**
     * Envia transcrição para outro peer
     */
    sendTranscriptionToPeer(transcription, targetUserName) {
        log('📤 Enviando transcrição para', targetUserName);
        
        this.socket.emit('sendTranscriptionToPeer', {
            transcription: transcription,
            from: userName, // variável global
            to: targetUserName
        });
    }

    /**
     * Exibe transcrição na UI de forma incremental
     */
    displayTranscript(text, speaker, isLocal) {
        if (!text) return;

        const label = isLocal ? 'Você' : speaker;
        
        // Se é o mesmo falante, atualizar a linha atual
        if (this.lastSpeaker === label) {
            this.currentSpeechText += ' ' + text;
        } else {
            // Falante diferente - finalizar fala anterior e começar nova
            if (this.lastSpeaker) {
                // Adicionar quebra de linha da fala anterior
                this.currentTranscript += '\n';
            }
            
            // Começar nova fala
            this.lastSpeaker = label;
            this.currentSpeechText = text;
            this.currentTranscript += `[${label}]: `;
        }
        
        // Atualizar textarea com transcrição completa + fala atual
        const transcriptInput = document.getElementById(CONFIG.UI.TRANSCRIPTION_INPUT_ID);
        if (transcriptInput) {
            transcriptInput.value = this.currentTranscript + this.currentSpeechText;
            // Auto-scroll para o final
            transcriptInput.scrollTop = transcriptInput.scrollHeight;
        }

        log('📄 Transcrição incremental:', `[${label}]: ${this.currentSpeechText}`);
    }

    /**
     * Finaliza a fala atual (chamado quando detecta pausa)
     */
    finalizeSpeech() {
        if (this.currentSpeechText) {
            // Consolidar a fala completa no histórico
            this.currentTranscript += this.currentSpeechText;
            this.currentSpeechText = '';
            log('✅ Fala finalizada');
        }
    }

    /**
     * Atualiza a transcrição na UI (mantido para compatibilidade)
     */
    updateTranscript(text) {
        if (!text) return;

        // Adicionar o novo texto
        if (this.currentTranscript) {
            this.currentTranscript += ' ' + text;
        } else {
            this.currentTranscript = text;
        }
        
        // Atualizar textarea de transcrição
        const transcriptInput = document.getElementById(CONFIG.UI.TRANSCRIPTION_INPUT_ID);
        if (transcriptInput) {
            transcriptInput.value = this.currentTranscript;
        }

        log('📄 Transcrição atual:', this.currentTranscript);
    }

    /**
     * Envia áudio para transcrição
     */
    sendAudio(audioBase64) {
        if (!this.isConnected) {
            logWarning('Não conectado, áudio não enviado');
            return false;
        }

        const audioMessage = {
            type: 'input_audio_buffer.append',
            audio: audioBase64
        };

        log('🎵 Enviando chunk de áudio...', audioBase64.length, 'bytes');
        return this.send(audioMessage);
    }

    /**
     * Envia áudio para transcrição
     */
    sendAudio(audioBase64) {
        if (!this.isConnected) {
            logWarning('Não conectado, áudio não enviado');
            return false;
        }

        const audioMessage = {
            type: 'input_audio_buffer.append',
            audio: audioBase64
        };

        return this.send(audioMessage);
    }

    /**
     * Inicia transcrição
     */
    start() {
        log('▶️ Iniciando transcrição...');
        this.isTranscribing = true;
        this.currentTranscript = '';

        // Iniciar processamento de áudio
        if (this.audioProcessor) {
            this.audioProcessor.start((audioBase64) => {
                this.sendAudio(audioBase64);
            });
        } else {
            logWarning('AudioProcessor não está disponível');
        }
    }

    /**
     * Para transcrição
     */
    stop() {
        log('⏸️ Parando transcrição...');
        this.isTranscribing = false;
        
        // Finalizar fala atual antes de parar
        this.finalizeSpeech();
        
        // Parar processamento de áudio
        if (this.audioProcessor) {
            this.audioProcessor.stop();
        }
        
        // Salvar no histórico
        if (this.currentTranscript) {
            this.transcriptHistory.push({
                timestamp: getTimestamp(),
                text: this.currentTranscript
            });
        }
    }

    /**
     * Desconecta e limpa recursos
     */
    disconnect() {
        log('Desconectando...');
        
        if (this.socket) {
            this.socket.emit('transcription:disconnect');
        }
        
        this.isConnected = false;
        this.isTranscribing = false;
    }

    /**
     * Verifica status da conexão
     */
    getStatus() {
        return {
            connected: this.isConnected,
            transcribing: this.isTranscribing,
            transcript: this.currentTranscript,
            history: this.transcriptHistory
        };
    }
}

// Instância global
const transcriptionManager = new TranscriptionManager();