// config.js - Configurações centralizadas para transcrição

const CONFIG = {
    // OpenAI Realtime API (via proxy backend)
    OPENAI: {
        // API Key agora está no backend por segurança!
        MODEL: 'gpt-4o-realtime-preview-2024-12-17'
    },
    
    // ------------------------ AAAAAAAAAAATENÇÃAAAAAAAAAAAAAAAOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO ------------------------
    // ------------------------ AAAAAAAAAAATENÇÃAAAAAAAAAAAAAAAOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO ------------------------
    // ------------------------ AAAAAAAAAAATENÇÃAAAAAAAAAAAAAAAOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO ------------------------
    // ------------------------ AAAAAAAAAAATENÇÃAAAAAAAAAAAAAAAOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO ------------------------
    
    // Backend URL (local ou Vercel) 
    //BACKEND_URL: 'https://localhost:8181', // ← TROCAR PARA https://seu-backend.gcp.app'
    BACKEND_URL: 'https://webrtc-backend-1022548423771.us-central1.run.app:8181',

    // ------------------------ AAAAAAAAAAATENÇÃAAAAAAAAAAAAAAAOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO ------------------------
    // ------------------------ AAAAAAAAAAATENÇÃAAAAAAAAAAAAAAAOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO ------------------------
    // ------------------------ AAAAAAAAAAATENÇÃAAAAAAAAAAAAAAAOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO ------------------------
    // ------------------------ AAAAAAAAAAATENÇÃAAAAAAAAAAAAAAAOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO ------------------------
    // Configurações de Áudio
    AUDIO: {
        SAMPLE_RATE: 24000,        // OpenAI espera 24kHz
        CHANNELS: 1,               // Mono
        FORMAT: 'pcm16',           // PCM 16-bit
        BUFFER_SIZE: 4096,         // Tamanho do buffer de processamento
        CHUNK_DURATION_MS: 100     // Enviar chunks a cada 100ms
    },
    
    // Configurações de UI
    UI: {
        TRANSCRIPTION_INPUT_ID: 'text-input-transcription',
        STATUS_INDICATOR_ID: 'transcription-status',
        TOGGLE_BUTTON_ID: 'toggle-transcription'
    },
    
    // Configurações de Room
    ROOM: {
        EXPIRATION_TIME: 5 * 60 * 1000,  // 5 minutos em ms
        MAX_PARTICIPANTS: 2,              // Host + 1 participante
        ALLOW_RECONNECTION: true          // Permitir reconexão
    },
    
    // Debug
    DEBUG: true
};

// Helper para logs
const log = (...args) => {
    if (CONFIG.DEBUG) {
        console.log('[TRANSCRIPTION]', ...args);
    }
};

const logError = (...args) => {
    console.error('[TRANSCRIPTION ERROR]', ...args);
};

const logWarning = (...args) => {
    console.warn('[TRANSCRIPTION WARNING]', ...args);
};

// Helper para Room logs
const logRoom = (...args) => {
    if (CONFIG.DEBUG) {
        console.log('[ROOM]', ...args);
    }
};