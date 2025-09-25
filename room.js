// room.js - Lógica de gerenciamento da sala

// ==================== VARIÁVEIS GLOBAIS DA SALA ====================
let currentRoomId = null;
let currentUserName = null;
let currentUserRole = null; // 'host' ou 'participant'
let roomData = null;

// Variáveis WebRTC (mantidas do scripts.js original)
let localStream;
let remoteStream;
let peerConnection;
let didIOffer = false;
let audioProcessor = null;
let remoteUserName = null;

// Socket.IO
let socket = null;

// Configuração WebRTC
let peerConfiguration = {
    iceServers:[
        {
            urls:[
              'stun:stun.l.google.com:19302',
              'stun:stun1.l.google.com:19302'
            ]
        }
    ]
}

// ==================== INICIALIZAÇÃO ====================

document.addEventListener('DOMContentLoaded', async () => {
    logRoom('Página da sala carregada');

    // Extrair roomId e role da URL
    const urlParams = new URLSearchParams(window.location.search);
    currentRoomId = urlParams.get('roomId');
    const urlRole = urlParams.get('role'); // ✅ NOVO: Ler role da URL

    if (!currentRoomId) {
        alert('Erro: ID da sala não encontrado na URL');
        window.location.href = '/create-room.html';
        return;
    }

    logRoom('RoomId:', currentRoomId);
    logRoom('Role da URL:', urlRole || 'não especificado (participante)');

    // ✅ CORREÇÃO: Identificar se é host pela URL
    const isHostFromUrl = urlRole === 'host';
    
    if (isHostFromUrl) {
        // ✅ CORREÇÃO: Esconder modal do participante para o host
        document.getElementById('participant-form').classList.add('hide');
        
        // É o host - verificar se tem nome salvo
        const savedHostName = localStorage.getItem('hostName');
        
        if (savedHostName) {
            currentUserName = savedHostName;
            await joinRoomAsHost();
        } else {
            alert('Erro: Nome do host não encontrado. Crie uma nova sala.');
            window.location.href = '/create-room.html';
        }
    } else {
        // É um participante - mostrar modal para nome
        showParticipantNameModal();
    }
});

// ==================== ENTRAR NA SALA ====================

/**
 * Host entra na sala (com validação de role)
 */
async function joinRoomAsHost() {
    logRoom('Entrando como HOST:', currentUserName);

    // Conectar Socket.IO
    socket = io.connect('https://192.168.1.71:8181/', {
        auth: {
            userName: currentUserName,
            password: "x"
        }
    });

    // Configurar listeners do socket
    setupSocketListeners();

    // Entrar na sala
    socket.emit('joinRoom', {
        roomId: currentRoomId,
        participantName: currentUserName
    }, (response) => {
        if (response.success) {
            currentUserRole = response.role;
            roomData = response.roomData;
            
            // ✅ VALIDAÇÃO: Verificar se backend confirma que é host
            if (currentUserRole !== 'host') {
                alert('⚠️ Erro de autenticação: Você não é o host desta sala');
                window.location.href = '/create-room.html';
                return;
            }
            
            logRoom('✅ Entrou na sala como HOST (validado)');
            updateRoomUI();
            
            // Inicializar transcrição manager
            initializeTranscription();
        } else {
            alert('Erro ao entrar na sala: ' + response.error);
            window.location.href = '/create-room.html';
        }
    });
}

/**
 * Participante entra na sala (com validação de role)
 */
function joinRoomAsParticipant(participantName) {
    currentUserName = participantName;
    logRoom('Entrando como PARTICIPANTE:', currentUserName);

    // Conectar Socket.IO
    socket = io.connect('https://192.168.1.71:8181/', {
        auth: {
            userName: currentUserName,
            password: "x"
        }
    });

    // Configurar listeners do socket
    setupSocketListeners();

    // Entrar na sala
    socket.emit('joinRoom', {
        roomId: currentRoomId,
        participantName: participantName
    }, (response) => {
        if (response.success) {
            currentUserRole = response.role;
            roomData = response.roomData;
            
            // ✅ VALIDAÇÃO: Verificar se backend confirma que é participante
            if (currentUserRole === 'host') {
                // Se backend diz que é host, mas URL não tinha role=host, algo errado
                logWarning('⚠️ Backend identificou como host, mas URL não tinha role=host');
            }
            
            logRoom('✅ Entrou na sala como', currentUserRole);
            
            // Esconder modal
            document.getElementById('participant-form').classList.add('hide');
            
            updateRoomUI();
            
            // ✅ AJUSTE 2: Ativar transcrição automaticamente para participante
            initializeTranscription().then(() => {
                if (currentUserRole === 'participant') {
                    autoActivateTranscriptionForParticipant();
                }
            });
        } else {
            document.getElementById('error-message').textContent = response.error;
            document.getElementById('error-message').style.display = 'block';
        }
    });
}

// ==================== UI DA SALA ====================

/**
 * Mostrar modal para participante digitar nome
 */
function showParticipantNameModal() {
    document.getElementById('room-name-display').textContent = 'Carregando informações...';
    
    const joinBtn = document.getElementById('join-room-btn');
    const nameInput = document.getElementById('participant-name-input');

    joinBtn.addEventListener('click', () => {
        const name = nameInput.value.trim();
        if (name) {
            joinRoomAsParticipant(name);
        } else {
            alert('Por favor, digite seu nome');
        }
    });

    // Enter para enviar
    nameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            joinBtn.click();
        }
    });
}

/**
 * Atualizar interface da sala
 */
function updateRoomUI() {
    // Nome da sala
    document.getElementById('room-name').textContent = roomData.roomName;
    
    // Papel do usuário
    const roleText = currentUserRole === 'host' ? '👨‍⚕️ Host' : '🧑 Participante';
    document.getElementById('user-role').textContent = roleText;
    document.getElementById('user-name').textContent = currentUserName;

    // Transcrição e controles baseados no papel
    if (currentUserRole === 'host') {
        // HOST: Vê transcrição, botão finalizar e botão Call
        document.getElementById('transcription-card').style.display = 'block';
        document.getElementById('end-room-btn').style.display = 'inline-block';
        document.querySelector('#call').style.display = 'inline-block'; // Mostrar Call
        
        // Mostrar participante se já entrou
        if (roomData.participantUserName) {
            document.getElementById('participant-display').classList.add('show');
            document.getElementById('participant-name-text').textContent = roomData.participantUserName;
        }
    } else {
        // PARTICIPANTE: Não vê transcrição, não vê finalizar, não vê Call
        document.getElementById('transcription-card').style.display = 'none';
        document.getElementById('end-room-btn').style.display = 'none';
        document.querySelector('#call').style.display = 'none'; // Esconder Call (Answer aparece dinamicamente)
    }
}

// ==================== SOCKET LISTENERS ====================

function setupSocketListeners() {
    // Participante entrou (apenas host recebe)
    socket.on('participantJoined', (data) => {
        logRoom('Participante entrou:', data.participantName);
        document.getElementById('participant-display').classList.add('show');
        document.getElementById('participant-name-text').textContent = data.participantName;
        roomData.participantUserName = data.participantName;
    });

    // Sala foi finalizada
    socket.on('roomEnded', (data) => {
        alert(data.message);
        window.location.href = '/create-room.html';
    });

    // WebRTC listeners (adaptados com roomId)
    socket.on('newOfferAwaiting', (data) => {
        logRoom('Nova oferta recebida da sala:', data.roomId);
        if (data.roomId === currentRoomId) {
            remoteUserName = data.offererUserName;
            createAnswerButton(data);
        }
    });

    socket.on('answerResponse', (data) => {
        logRoom('Resposta recebida da sala:', data.roomId);
        if (data.roomId === currentRoomId) {
            addAnswer(data);
        }
    });

    socket.on('receivedIceCandidateFromServer', (iceCandidate) => {
        addNewIceCandidate(iceCandidate);
    });
}

// ==================== WEBRTC COM ROOMS ====================

const call = async (e) => {
    await fetchUserMedia();
    await createPeerConnection();

    try {
        logRoom("Criando oferta para sala:", currentRoomId);
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        didIOffer = true;
        
        // Enviar oferta com roomId
        socket.emit('newOffer', {
            roomId: currentRoomId,
            offer: offer
        });
    } catch(err) {
        console.error(err);
    }
}

const answerOffer = async(offerData) => {
    await fetchUserMedia();
    await createPeerConnection({offer: offerData.offer});
    
    const answer = await peerConnection.createAnswer({});
    await peerConnection.setLocalDescription(answer);
    
    remoteUserName = offerData.offererUserName;
    logRoom('Peer remoto identificado:', remoteUserName);
    
    // Enviar resposta com roomId
    socket.emit('newAnswer', {
        roomId: currentRoomId,
        answer: answer
    }, (offerIceCandidates) => {
        offerIceCandidates.forEach(c => {
            peerConnection.addIceCandidate(c);
        });
    });
}

const addAnswer = async(data) => {
    await peerConnection.setRemoteDescription(data.answer);
}

const fetchUserMedia = () => {
    return new Promise(async(resolve, reject) => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true,
            });
            
            document.querySelector('#local-video').srcObject = stream;
            localStream = stream;
            
            // Inicializar AudioProcessor
            if (!audioProcessor) {
                audioProcessor = new AudioProcessor();
                transcriptionManager.setAudioProcessor(audioProcessor);
            }
            
            await audioProcessor.init(stream);
            resolve();
        } catch(err) {
            console.error(err);
            reject();
        }
    });
}

const createPeerConnection = (offerObj) => {
    return new Promise(async(resolve, reject) => {
        peerConnection = await new RTCPeerConnection(peerConfiguration);
        remoteStream = new MediaStream();
        document.querySelector('#remote-video').srcObject = remoteStream;

        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        peerConnection.addEventListener('icecandidate', e => {
            if(e.candidate) {
                socket.emit('sendIceCandidateToSignalingServer', {
                    roomId: currentRoomId,
                    iceCandidate: e.candidate,
                    iceUserName: currentUserName,
                    didIOffer,
                });
            }
        });
        
        peerConnection.addEventListener('track', e => {
            e.streams[0].getTracks().forEach(track => {
                remoteStream.addTrack(track, remoteStream);
            });
        });

        if(offerObj) {
            await peerConnection.setRemoteDescription(offerObj.offer);
        }
        
        resolve();
    });
}

const addNewIceCandidate = (iceCandidate) => {
    peerConnection.addIceCandidate(iceCandidate);
}

function createAnswerButton(offerData) {
    const answerEl = document.querySelector('#answer');
    answerEl.innerHTML = '';
    
    const newAnswerEl = document.createElement('div');
    newAnswerEl.innerHTML = `<button class="btn btn-success col-1">Answer ${offerData.offererUserName}</button>`;
    newAnswerEl.addEventListener('click', () => answerOffer(offerData));
    answerEl.appendChild(newAnswerEl);
}

// ==================== TRANSCRIÇÃO ====================

function initializeTranscription() {
    return new Promise((resolve) => {
        transcriptionManager.setSocket(socket);
        
        // Definir variáveis globais para transcription.js acessar
        window.userName = currentUserName;
        window.didIOffer = didIOffer;
        window.remoteUserName = remoteUserName;
        window.currentRoomId = currentRoomId;

        // Botão de toggle transcrição (apenas para host)
        const toggleBtn = document.getElementById('toggle-transcription');
        const statusBadge = document.getElementById('transcription-status');
        const statusInfo = document.getElementById('transcription-info');
        
        if (!toggleBtn) {
            resolve(); // Participante não tem este botão
            return;
        }

        toggleBtn.addEventListener('click', async () => {
            if (!transcriptionManager.isConnected) {
                toggleBtn.disabled = true;
                toggleBtn.textContent = 'Conectando...';
                statusInfo.textContent = 'Estabelecendo conexão com OpenAI...';
                
                const success = await transcriptionManager.init();
                
                if (success) {
                    statusBadge.className = 'badge bg-success';
                    statusBadge.textContent = 'Conectado';
                    toggleBtn.textContent = 'Iniciar Transcrição';
                    toggleBtn.className = 'btn btn-sm btn-primary ms-2';
                    statusInfo.textContent = 'Clique em "Call" e depois aqui para começar a transcrever';
                } else {
                    statusBadge.className = 'badge bg-danger';
                    statusBadge.textContent = 'Erro';
                    toggleBtn.textContent = 'Tentar Novamente';
                    statusInfo.textContent = 'Falha na conexão';
                }
                
                toggleBtn.disabled = false;
            } else if (!transcriptionManager.isTranscribing) {
                transcriptionManager.start();
                statusBadge.className = 'badge bg-danger';
                statusBadge.textContent = 'Transcrevendo';
                toggleBtn.textContent = 'Parar Transcrição';
                toggleBtn.className = 'btn btn-sm btn-warning ms-2';
                statusInfo.textContent = 'Fale algo... a transcrição aparecerá abaixo';
            } else {
                transcriptionManager.stop();
                statusBadge.className = 'badge bg-success';
                statusBadge.textContent = 'Conectado';
                toggleBtn.textContent = 'Iniciar Transcrição';
                toggleBtn.className = 'btn btn-sm btn-primary ms-2';
                statusInfo.textContent = 'Transcrição pausada';
            }
        });

        resolve();
    });
}

/**
 * ✅ AJUSTE 2: Ativar transcrição automaticamente para participante (após Answer)
 */
async function autoActivateTranscriptionForParticipant() {
    logRoom('🎤 Ativando transcrição automaticamente para participante...');
    
    try {
        // Conectar à OpenAI
        const success = await transcriptionManager.init();
        
        if (success) {
            logRoom('✅ Transcrição conectada (aguardando AudioProcessor)');
            
            // ✅ CORREÇÃO: Aguardar AudioProcessor ser inicializado (quando clicar Answer)
            // Verificar a cada 500ms se audioProcessor está pronto
            const checkAudioProcessor = setInterval(() => {
                if (audioProcessor && audioProcessor.audioContext) {
                    clearInterval(checkAudioProcessor);
                    
                    // Agora sim, iniciar transcrição
                    transcriptionManager.start();
                    logRoom('✅ Transcrição iniciada automaticamente após AudioProcessor estar pronto');
                }
            }, 500);
            
            // Timeout de segurança: se após 30s não iniciou, cancelar
            setTimeout(() => {
                clearInterval(checkAudioProcessor);
            }, 30000);
        } else {
            logError('❌ Falha ao conectar transcrição automaticamente');
        }
    } catch (error) {
        logError('❌ Erro ao ativar transcrição:', error);
    }
}

// ==================== FINALIZAR SALA ====================

document.getElementById('end-room-btn')?.addEventListener('click', () => {
    if (confirm('Tem certeza que deseja finalizar esta sala? As transcrições serão salvas.')) {
        socket.emit('endRoom', {
            roomId: currentRoomId
        }, (response) => {
            if (response.success) {
                // Simular salvamento no banco
                alert('✅ Sala finalizada!\n\n💾 Transcrições salvas no banco de dados\n📝 Total: ' + response.saveResult.transcriptionsCount + ' transcrições');
                window.location.href = '/create-room.html';
            } else {
                alert('Erro ao finalizar sala: ' + response.error);
            }
        });
    }
});

// ==================== BOTÕES WEBRTC ====================

document.querySelector('#call').addEventListener('click', call);