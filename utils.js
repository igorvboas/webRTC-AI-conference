// utils.js - Funções auxiliares para processamento de áudio

/**
 * Converte Float32Array (formato do Web Audio API) para PCM16 (formato esperado pela OpenAI)
 * @param {Float32Array} float32Array - Array de samples em float32 (-1.0 a 1.0)
 * @returns {Int16Array} - Array de samples em PCM16
 */
function convertFloat32ToPCM16(float32Array) {
    const pcm16 = new Int16Array(float32Array.length);
    
    for (let i = 0; i < float32Array.length; i++) {
        // Clamp o valor entre -1 e 1
        let sample = Math.max(-1, Math.min(1, float32Array[i]));
        
        // Converter para 16-bit integer
        pcm16[i] = sample < 0 
            ? sample * 0x8000  // -32768
            : sample * 0x7FFF; // 32767
    }
    
    return pcm16;
}

/**
 * Converte PCM16 para Base64 (formato de envio para OpenAI)
 * @param {Int16Array} pcm16Array - Array PCM16
 * @returns {string} - String Base64
 */
function pcm16ToBase64(pcm16Array) {
    // Converter Int16Array para Uint8Array (bytes)
    const uint8Array = new Uint8Array(pcm16Array.buffer);
    
    // Converter para string binária
    let binary = '';
    const len = uint8Array.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(uint8Array[i]);
    }
    
    // Converter para Base64
    return btoa(binary);
}

/**
 * Converte Float32 diretamente para Base64 (combinação das duas funções acima)
 * @param {Float32Array} float32Array - Array de samples
 * @returns {string} - String Base64
 */
function audioToBase64(float32Array) {
    const pcm16 = convertFloat32ToPCM16(float32Array);
    return pcm16ToBase64(pcm16);
}

/**
 * Resample áudio de uma sample rate para outra (se necessário)
 * @param {Float32Array} audioData - Dados de áudio originais
 * @param {number} fromRate - Sample rate original
 * @param {number} toRate - Sample rate desejada
 * @returns {Float32Array} - Dados resampleados
 */
function resampleAudio(audioData, fromRate, toRate) {
    if (fromRate === toRate) return audioData;
    
    const ratio = fromRate / toRate;
    const newLength = Math.round(audioData.length / ratio);
    const result = new Float32Array(newLength);
    
    for (let i = 0; i < newLength; i++) {
        const srcIndex = i * ratio;
        const srcIndexFloor = Math.floor(srcIndex);
        const srcIndexCeil = Math.min(srcIndexFloor + 1, audioData.length - 1);
        const t = srcIndex - srcIndexFloor;
        
        // Interpolação linear
        result[i] = audioData[srcIndexFloor] * (1 - t) + audioData[srcIndexCeil] * t;
    }
    
    return result;
}

/**
 * Formata timestamp para exibição
 * @returns {string} - Timestamp formatado
 */
function getTimestamp() {
    const now = new Date();
    return now.toLocaleTimeString('pt-BR', { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
    });
}

/**
 * Debounce function para otimizar chamadas
 * @param {Function} func - Função a ser debounced
 * @param {number} wait - Tempo de espera em ms
 * @returns {Function} - Função debounced
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}