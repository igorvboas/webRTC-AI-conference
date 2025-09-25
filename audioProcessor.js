// audioProcessor.js - Captura e processa áudio para transcrição

class AudioProcessor {
    constructor() {
        this.audioContext = null;
        this.sourceNode = null;
        this.processorNode = null;
        this.isProcessing = false;
        this.audioStream = null;
    }

    /**
     * Inicializa o processamento de áudio
     */
    async init(stream) {
        log('Inicializando AudioProcessor...');
        
        try {
            // Criar AudioContext
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: CONFIG.AUDIO.SAMPLE_RATE
            });

            log(`AudioContext criado com sample rate: ${this.audioContext.sampleRate}Hz`);

            // Extrair apenas o áudio do stream
            const audioTracks = stream.getAudioTracks();
            if (audioTracks.length === 0) {
                throw new Error('Nenhuma track de áudio encontrada');
            }

            this.audioStream = new MediaStream([audioTracks[0]]);
            
            // Criar source node do stream
            this.sourceNode = this.audioContext.createMediaStreamSource(this.audioStream);
            
            // Criar processor node (ScriptProcessor)
            this.processorNode = this.audioContext.createScriptProcessor(
                CONFIG.AUDIO.BUFFER_SIZE, 
                1, // 1 canal de entrada (mono)
                1  // 1 canal de saída
            );

            // Conectar nodes
            this.sourceNode.connect(this.processorNode);
            this.processorNode.connect(this.audioContext.destination);

            log('✅ AudioProcessor inicializado');
            return true;

        } catch (error) {
            logError('Erro ao inicializar AudioProcessor:', error);
            return false;
        }
    }

    /**
     * Inicia o processamento e envio de áudio
     */
    start(onAudioData) {
        if (!this.processorNode) {
            logWarning('ProcessorNode não inicializado');
            return false;
        }

        log('▶️ Iniciando processamento de áudio...');
        this.isProcessing = true;

        // Handler de processamento de áudio
        this.processorNode.onaudioprocess = (audioEvent) => {
            if (!this.isProcessing) return;

            // Pegar dados de áudio do buffer de entrada
            const inputData = audioEvent.inputBuffer.getChannelData(0);
            
            // Resample se necessário (do sample rate do AudioContext para 24kHz)
            let audioData = inputData;
            if (this.audioContext.sampleRate !== CONFIG.AUDIO.SAMPLE_RATE) {
                audioData = resampleAudio(
                    inputData, 
                    this.audioContext.sampleRate, 
                    CONFIG.AUDIO.SAMPLE_RATE
                );
            }

            // Converter para base64
            const base64Audio = audioToBase64(audioData);

            // Callback com os dados
            if (onAudioData && typeof onAudioData === 'function') {
                onAudioData(base64Audio);
            }
        };

        log('✅ Processamento ativo');
        return true;
    }

    /**
     * Para o processamento de áudio
     */
    stop() {
        log('⏸️ Parando processamento de áudio...');
        this.isProcessing = false;
        
        if (this.processorNode) {
            this.processorNode.onaudioprocess = null;
        }
    }

    /**
     * Limpa recursos
     */
    cleanup() {
        log('Limpando AudioProcessor...');
        
        this.stop();
        
        if (this.sourceNode) {
            this.sourceNode.disconnect();
            this.sourceNode = null;
        }
        
        if (this.processorNode) {
            this.processorNode.disconnect();
            this.processorNode = null;
        }
        
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close();
            this.audioContext = null;
        }

        if (this.audioStream) {
            this.audioStream.getTracks().forEach(track => track.stop());
            this.audioStream = null;
        }

        log('✅ AudioProcessor limpo');
    }

    /**
     * Retorna o estado atual
     */
    getStatus() {
        return {
            initialized: this.audioContext !== null,
            processing: this.isProcessing,
            sampleRate: this.audioContext?.sampleRate || 0
        };
    }
}