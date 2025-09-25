// transcription.js - Gerenciador de transcrição em tempo real (usando proxy backend)

class TranscriptionManager {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.isTranscribing = false;
        this.currentTranscript = '';
        this.transcriptHistory = [];
        this.audioProcessor = null;
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
                modalities: ['text'], // APENAS TEXTO - sem resposta de áudio!
                instructions: 'Você é um assistente de transcrição. Apenas transcreva o áudio recebido em português brasileiro. Não responda, não comente, apenas transcreva exatamente o que foi dito.',
                input_audio_format: CONFIG.AUDIO.FORMAT,
                input_audio_transcription: {
                    model: 'whisper-1'
                },
                turn_detection: {
                    type: 'server_vad', // Detecção automática de voz
                    threshold: 0.5,
                    prefix_padding_ms: 300,
                    silence_duration_ms: 500
                }
            }
        };

        this.send(sessionConfig);
        log('✅ Sessão configurada para transcrição apenas');
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
                    break;

                case 'conversation.item.created':
                    log('💬 Item de conversa criado:', message.item);
                    this.handleTranscription(message.item);
                    break;

                case 'conversation.item.input_audio_transcription.completed':
                    log('📝 Transcrição completa:', message.transcript);
                    this.updateTranscript(message.transcript);
                    break;

                case 'response.audio_transcript.delta':
                    log('📝 Delta de transcrição:', message.delta);
                    this.updateTranscript(message.delta);
                    break;

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
     * Processa transcrição
     */
    handleTranscription(item) {
        if (item.type === 'message' && item.role === 'user') {
            const content = item.content?.[0];
            if (content?.type === 'input_audio' && content.transcript) {
                log('📝 Transcrição do usuário:', content.transcript);
                this.updateTranscript(content.transcript);
            }
        }
    }

    /**
     * Atualiza a transcrição na UI
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