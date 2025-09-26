// inputOutput.js - ESTRUTURA CORRETA

// ==================== FUNÇÕES DE DISPOSITIVOS ====================
const getDevices = async () => {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        console.log('Dispositivos encontrados:', devices);
        
        const audioInputEl = document.querySelector('#audio-input');
        const audioOutputEl = document.querySelector('#audio-output');
        const videoInputEl = document.querySelector('#video-input');
        
        devices.forEach(d => {
            const option = document.createElement('option');
            option.value = d.deviceId;
            option.text = d.label || `${d.kind} (sem nome)`;
            
            if(d.kind === "audioinput" && audioInputEl){
                audioInputEl.appendChild(option);
            } else if(d.kind === "audiooutput" && audioOutputEl){
                audioOutputEl.appendChild(option);
            } else if(d.kind === "videoinput" && videoInputEl){
                videoInputEl.appendChild(option);
            }
        });
    } catch (error) {
        console.error('Erro ao listar dispositivos:', error);
    }
}

const changeAudioInput = async(e) => {
    const deviceId = e.target.value;
    const newConstraints = {
        audio: {deviceId: {exact: deviceId}},
        video: true,
    }
    try {
        const wasTranscribing = transcriptionManager?.isTranscribing || false;
        
        if(wasTranscribing && transcriptionManager) {
            transcriptionManager.stop();
        }
        
        if(audioProcessor) {
            audioProcessor.cleanup();
        }
        
        if(localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }
        
        localStream = await navigator.mediaDevices.getUserMedia(newConstraints);
        document.querySelector('#local-video').srcObject = localStream;
        
        if(peerConnection) {
            const audioTrack = localStream.getAudioTracks()[0];
            const sender = peerConnection.getSenders().find(s => s.track?.kind === 'audio');
            if(sender) {
                await sender.replaceTrack(audioTrack);
            }
        }
        
        if(audioProcessor) {
            await audioProcessor.init(localStream);
            
            setTimeout(() => {
                if(wasTranscribing && transcriptionManager) {
                    transcriptionManager.start();
                }
            }, 100);
        }
        
        console.log('✅ Microfone alterado');
    } catch(err) {
        console.error('❌ Erro:', err);
    }
}

const changeAudioOutput = async(e) => {
    const remoteVideoEl = document.querySelector('#remote-video');
    if(remoteVideoEl && remoteVideoEl.setSinkId) {
        await remoteVideoEl.setSinkId(e.target.value);
        console.log("✅ Saída de áudio alterada");
    } else {
        console.log("⚠️ setSinkId não suportado");
    }
}

const changeVideo = async (e) => {
    const deviceId = e.target.value;
    const newConstraints = {
        audio: true,
        video: {deviceId: {exact: deviceId}},
    }
    try {
        const wasTranscribing = transcriptionManager?.isTranscribing || false;
        
        if(wasTranscribing && transcriptionManager) {
            transcriptionManager.stop();
        }
        
        if(audioProcessor) {
            audioProcessor.cleanup();
        }
        
        if(localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }
        
        localStream = await navigator.mediaDevices.getUserMedia(newConstraints);
        document.querySelector('#local-video').srcObject = localStream;
        
        if(peerConnection) {
            const videoTrack = localStream.getVideoTracks()[0];
            const sender = peerConnection.getSenders().find(s => s.track?.kind === 'video');
            if(sender) {
                await sender.replaceTrack(videoTrack);
            }
        }
        
        if(audioProcessor) {
            await audioProcessor.init(localStream);
            
            setTimeout(() => {
                if(wasTranscribing && transcriptionManager) {
                    transcriptionManager.start();
                }
            }, 100);
        }
        
        console.log('✅ Câmera alterada');
    } catch(err) {
        console.error('❌ Erro:', err);
    }
}

// ==================== TOGGLE CÂMERA (ESCOPO GLOBAL) ====================
const toggleCamera = () => {
    console.log('📹 toggleCamera chamado');
    
    if (!localStream) {
        console.warn('⚠️ Stream não disponível');
        return;
    }

    const videoTrack = localStream.getVideoTracks()[0];
    
    if (!videoTrack) {
        console.warn('⚠️ Track de vídeo não encontrada');
        return;
    }

    videoTrack.enabled = !videoTrack.enabled;
    
    const btn = document.getElementById('toggle-camera-btn');
    if (btn) {
        if (videoTrack.enabled) {
            btn.innerHTML = '📹 Desligar Câmera';
            btn.className = 'btn btn-danger';
        } else {
            btn.innerHTML = '📹 Ligar Câmera';
            btn.className = 'btn btn-success';
        }
    }
    
    console.log(`📹 Câmera ${videoTrack.enabled ? 'ligada' : 'desligada'}`);
}

// ==================== TOGGLE MICROFONE (ESCOPO GLOBAL) ====================
const toggleMicrophone = () => {
    console.log('🎤 toggleMicrophone chamado');
    
    if (!localStream) {
        console.warn('⚠️ Stream não disponível');
        return;
    }

    const audioTrack = localStream.getAudioTracks()[0];
    
    if (!audioTrack) {
        console.warn('⚠️ Track de áudio não encontrada');
        return;
    }

    audioTrack.enabled = !audioTrack.enabled;
    
    const btn = document.getElementById('toggle-mic-btn');
    if (btn) {
        if (audioTrack.enabled) {
            btn.innerHTML = '🎤 Desligar Microfone';
            btn.className = 'btn btn-danger';
        } else {
            btn.innerHTML = '🎤 Ligar Microfone';
            btn.className = 'btn btn-success';
        }
    }
    
    console.log(`🎤 Microfone ${audioTrack.enabled ? 'ligado' : 'desligado'}`);
    
    if (!audioTrack.enabled && transcriptionManager?.isTranscribing) {
        transcriptionManager.stop();
        console.log('⏸️ Transcrição pausada');
    } else if (audioTrack.enabled && transcriptionManager?.isConnected && !transcriptionManager?.isTranscribing) {
        transcriptionManager.start();
        console.log('▶️ Transcrição retomada');
    }
}

// ==================== EVENT LISTENERS ====================
document.addEventListener('DOMContentLoaded', () => {
    const audioInputEl = document.querySelector('#audio-input');
    const audioOutputEl = document.querySelector('#audio-output');
    const videoInputEl = document.querySelector('#video-input');
    const toggleCameraBtn = document.getElementById('toggle-camera-btn');
    const toggleMicBtn = document.getElementById('toggle-mic-btn');
    
    if(audioInputEl) audioInputEl.addEventListener('change', changeAudioInput);
    if(audioOutputEl) audioOutputEl.addEventListener('change', changeAudioOutput);
    if(videoInputEl) videoInputEl.addEventListener('change', changeVideo);
    if(toggleCameraBtn) toggleCameraBtn.addEventListener('click', toggleCamera);
    if(toggleMicBtn) toggleMicBtn.addEventListener('click', toggleMicrophone);
    
    console.log('✅ Listeners configurados');
});