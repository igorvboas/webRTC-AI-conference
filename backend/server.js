// Carregar variáveis de ambiente
require('dotenv').config();

const fs = require('fs');
const https = require('https');
const express = require('express');
const app = express();
const socketio = require('socket.io');
const WebSocket = require('ws');
const crypto = require('crypto'); // Para gerar roomId único

// removi depois da separação de backend e frontend
// app.use(express.static(__dirname));

// Chave da API OpenAI (do .env)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
    console.error('❌ ERRO: OPENAI_API_KEY não encontrada no arquivo .env');
    process.exit(1);
}

const PORT = process.env.PORT || 8181;
const FRONTEND_PORT = process.env.FRONTEND_PORT || 3000;

const key = fs.readFileSync('cert.key');
const cert = fs.readFileSync('cert.crt');

const expressServer = https.createServer({key, cert}, app);

const io = socketio(expressServer, {
    cors: {
        origin: "*",
        //origin: process.env.FRONTEND_URL || `https://localhost:${FRONTEND_PORT}`, // URL do Vercel
        methods: ["GET", "POST"],
        credentials: true
    }
});

expressServer.listen(PORT, '0.0.0.0');

console.log(`🚀 Servidor rodando em https://localhost:${PORT}`);
console.log('📡 Sistema de Rooms ativo');
console.log(`🔑 API Key configurada: ${OPENAI_API_KEY.substring(0, 11)}...`);

// ==================== ESTRUTURAS DE DADOS ====================

// Mapa de salas: roomId -> roomData
const rooms = new Map();

// Mapa de usuário para sala ativa: userName -> roomId
const userToRoom = new Map();

// Mapa de socket para sala: socketId -> roomId
const socketToRoom = new Map();

// Mapa de conexões OpenAI: userName -> WebSocket
const openAIConnections = new Map();

// ✅ CORREÇÃO: Mapa separado para timers (não serializar com room data)
const roomTimers = new Map(); // roomId -> Timeout

// ==================== FUNÇÕES AUXILIARES ====================

/**
 * Gera um roomId único
 */
function generateRoomId() {
    return 'room-' + crypto.randomBytes(6).toString('hex'); // Ex: room-a1b2c3d4e5f6
}

/**
 * Limpa sala expirada (5 minutos de inatividade)
 */
function cleanExpiredRoom(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;

    console.log(`🧹 Limpando sala expirada: ${roomId}`);
    
    // Remover usuários do mapeamento
    if (room.hostUserName) userToRoom.delete(room.hostUserName);
    if (room.participantUserName) userToRoom.delete(room.participantUserName);
    
    // ✅ CORREÇÃO: Limpar timer do mapa separado
    if (roomTimers.has(roomId)) {
        clearTimeout(roomTimers.get(roomId));
        roomTimers.delete(roomId);
    }
    
    // Remover sala
    rooms.delete(roomId);
}

/**
 * Inicia timer de expiração de sala (5 minutos)
 */
function startRoomExpiration(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;

    // ✅ CORREÇÃO: Limpar timer anterior do mapa separado
    if (roomTimers.has(roomId)) {
        clearTimeout(roomTimers.get(roomId));
    }

    // ✅ CORREÇÃO: Criar novo timer de 5 minutos e armazenar no mapa separado
    const timer = setTimeout(() => {
        cleanExpiredRoom(roomId);
    }, 5 * 60 * 1000); // 5 minutos

    roomTimers.set(roomId, timer);

    // console.log(`⏱️ Timer de expiração iniciado para sala: ${roomId} (5 min)`);
}

/**
 * Reseta timer de expiração (chamado em atividade)
 */
function resetRoomExpiration(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;

    room.lastActivity = new Date().toISOString();
    startRoomExpiration(roomId); // Reinicia o timer
}

/**
 * Salva histórico de transcrições (simulado)
 */
function saveTranscriptionsToDatabase(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;

    console.log(`💾 [SIMULADO] Salvando transcrições da sala ${roomId} no banco de dados...`);
    console.log(`📝 Total de transcrições: ${room.transcriptions.length}`);
    
    // Aqui você implementaria a lógica real de salvar no banco
    // Por enquanto, apenas simula
    
    return {
        success: true,
        roomId: roomId,
        transcriptionsCount: room.transcriptions.length,
        transcriptions: room.transcriptions
    };
}

// ==================== SOCKET.IO EVENTS ====================

io.on('connection', (socket) => {
    const userName = socket.handshake.auth.userName;
    const password = socket.handshake.auth.password;

    if (password !== "x") {
        socket.disconnect(true);
        return;
    }

    console.log(`[${userName}] conectado - Socket: ${socket.id}`);

    // ==================== CRIAR SALA ====================
    
    socket.on('createRoom', (data, callback) => {
        const { hostName, roomName } = data;
        
        // Verificar se usuário já está em outra sala
        if (userToRoom.has(hostName)) {
            const existingRoom = userToRoom.get(hostName);
            callback({ 
                success: false, 
                error: 'Você já está em outra sala ativa',
                existingRoomId: existingRoom
            });
            return;
        }

        const roomId = generateRoomId();
        
        // Criar sala
        const room = {
            roomId: roomId,
            roomName: roomName || 'Sala sem nome',
            hostUserName: hostName,
            hostSocketId: socket.id,
            participantUserName: null,
            participantSocketId: null,
            status: 'waiting', // waiting | active | ended
            offer: null,
            answer: null,
            offerIceCandidates: [],
            answererIceCandidates: [],
            transcriptions: [],
            createdAt: new Date().toISOString(),
            lastActivity: new Date().toISOString()
            // ✅ CORREÇÃO: Removido expirationTimer daqui
        };

        rooms.set(roomId, room);
        userToRoom.set(hostName, roomId);
        socketToRoom.set(socket.id, roomId);

        // Iniciar timer de expiração
        startRoomExpiration(roomId);

        console.log(`✅ Sala criada: ${roomId} por ${hostName}`);
        console.log("FRONTEND_URL: ", process.env.FRONTEND_URL)
        const FRONTEND_URL = process.env.FRONTEND_URL || `https://localhost:${process.env.FRONTEND_PORT || 3000}`;

        callback({ 
            success: true, 
            roomId: roomId,
            roomUrl: `${FRONTEND_URL}/room.html?roomId=${roomId}`
        });
    });

    // ==================== ENTRAR EM SALA ====================
    
    socket.on('joinRoom', (data, callback) => {
        const { roomId, participantName } = data;
        
        const room = rooms.get(roomId);
        
        // Verificar se sala existe
        if (!room) {
            callback({ 
                success: false, 
                error: 'Sala não encontrada ou expirada' 
            });
            return;
        }

        // Verificar se é reconexão do host
        if (participantName === room.hostUserName) {
            console.log(`🔄 Reconexão do host: ${participantName} na sala ${roomId}`);
            room.hostSocketId = socket.id;
            socketToRoom.set(socket.id, roomId);
            resetRoomExpiration(roomId);
            
            callback({ 
                success: true, 
                role: 'host',
                roomData: room
            });

            // ✅ CORREÇÃO: Se já tem participante E já tem oferta, reenviar para o participante
            if (room.participantSocketId && room.offer) {
                console.log(`🔄 Reenviando oferta para participante após reconexão do host`);
                io.to(room.participantSocketId).emit('newOfferAwaiting', {
                    roomId: roomId,
                    offer: room.offer,
                    offererUserName: room.hostUserName
                });
            }
            
            return;
        }

        // Verificar se usuário já está em outra sala
        if (userToRoom.has(participantName)) {
            const existingRoom = userToRoom.get(participantName);
            
            // Se é a mesma sala, é reconexão
            if (existingRoom === roomId) {
                console.log(`🔄 Reconexão do participante: ${participantName} na sala ${roomId}`);
                room.participantSocketId = socket.id;
                socketToRoom.set(socket.id, roomId);
                resetRoomExpiration(roomId);
                
                callback({ 
                    success: true, 
                    role: 'participant',
                    roomData: room
                });
                return;
            }
            
            callback({ 
                success: false, 
                error: 'Você já está em outra sala ativa' 
            });
            return;
        }

        // Verificar se sala já tem participante
        if (room.participantUserName && room.participantUserName !== participantName) {
            callback({ 
                success: false, 
                error: 'Esta sala já está cheia' 
            });
            return;
        }

        // Adicionar participante à sala
        room.participantUserName = participantName;
        room.participantSocketId = socket.id;
        room.status = 'active';
        
        userToRoom.set(participantName, roomId);
        socketToRoom.set(socket.id, roomId);
        
        resetRoomExpiration(roomId);

        console.log(`✅ ${participantName} entrou na sala ${roomId}`);

        callback({ 
            success: true, 
            role: 'participant',
            roomData: room
        });

        // Notificar host que participante entrou
        io.to(room.hostSocketId).emit('participantJoined', {
            participantName: participantName
        });

        // ✅ CORREÇÃO: Enviar oferta pendente se existir
        if (room.offer) {
            console.log(`📤 Enviando oferta pendente para ${participantName} na sala ${roomId}`);
            io.to(socket.id).emit('newOfferAwaiting', {
                roomId: roomId,
                offer: room.offer,
                offererUserName: room.hostUserName
            });
        }
    });

    // ==================== WEBRTC COM ROOMS ====================
    
    socket.on('newOffer', (data) => {
        const { roomId, offer } = data;
        const room = rooms.get(roomId);
        
        if (!room) {
            console.log(`❌ Oferta rejeitada: sala ${roomId} não existe`);
            return;
        }

        // ✅ ISOLAMENTO: Salvar oferta APENAS nesta sala específica
        room.offer = offer;
        room.offererUserName = userName;
        resetRoomExpiration(roomId);

        console.log(`📤 Nova oferta salva na sala ${roomId}`);

        // ✅ ISOLAMENTO: Enviar oferta APENAS para o participante DESTA sala
        if (room.participantSocketId) {
            io.to(room.participantSocketId).emit('newOfferAwaiting', {
                roomId: roomId,
                offer: offer,
                offererUserName: room.hostUserName
            });
            console.log(`📨 Oferta enviada para participante da sala ${roomId}`);
        } else {
            console.log(`📦 Oferta salva, aguardando participante entrar na sala ${roomId}`);
        }
    });

    socket.on('newAnswer', async (data, ackFunction) => {
        const { roomId, answer } = data;
        const room = rooms.get(roomId);

        if (!room) {
            console.log(`❌ Resposta rejeitada: sala ${roomId} não existe`);
            return;
        }

        room.answer = answer;
        room.answererUserName = userName;
        resetRoomExpiration(roomId);

        console.log(`📥 Nova resposta na sala ${roomId}`);

        // Enviar resposta para host
        io.to(room.hostSocketId).emit('answerResponse', {
            roomId: roomId,
            answer: answer,
            answererUserName: room.participantUserName
        });

        // Enviar ICE candidates do ofertante
        ackFunction(room.offerIceCandidates);
    });

    socket.on('sendIceCandidateToSignalingServer', (data) => {
        const { roomId, iceCandidate, didIOffer } = data;
        const room = rooms.get(roomId);

        if (!room) return;

        resetRoomExpiration(roomId);

        if (didIOffer) {
            // ICE do host
            room.offerIceCandidates.push(iceCandidate);
            
            if (room.participantSocketId && room.answererUserName) {
                io.to(room.participantSocketId).emit('receivedIceCandidateFromServer', iceCandidate);
            }
        } else {
            // ICE do participante
            room.answererIceCandidates.push(iceCandidate);
            
            if (room.hostSocketId) {
                io.to(room.hostSocketId).emit('receivedIceCandidateFromServer', iceCandidate);
            }
        }
    });

    // ==================== TRANSCRIÇÕES COM ROOMS ====================
    
    socket.on('transcription:connect', (data, callback) => {
        const roomId = socketToRoom.get(socket.id);
        
        if (!roomId) {
            callback({ success: false, error: 'Você não está em uma sala' });
            return;
        }

        console.log(`[${userName}] Solicitando conexão OpenAI na sala ${roomId}`);

        if (openAIConnections.has(userName)) {
            callback({ success: true, message: 'Já conectado' });
            return;
        }

        const openAIWs = new WebSocket(
            'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17',
            {
                headers: {
                    'Authorization': `Bearer ${OPENAI_API_KEY}`,
                    'OpenAI-Beta': 'realtime=v1'
                }
            }
        );

        openAIWs.on('open', () => {
            console.log(`[${userName}] ✅ Conectado à OpenAI na sala ${roomId}`);
            openAIConnections.set(userName, openAIWs);
            callback({ success: true, message: 'Conectado com sucesso' });
        });

        openAIWs.on('message', (data) => {
            socket.emit('transcription:message', data.toString());
        });

        openAIWs.on('error', (error) => {
            console.error(`[${userName}] ❌ Erro OpenAI:`, error.message);
            socket.emit('transcription:error', { error: error.message });
            callback({ success: false, error: error.message });
        });

        openAIWs.on('close', () => {
            console.log(`[${userName}] OpenAI WebSocket fechado`);
            openAIConnections.delete(userName);
            socket.emit('transcription:disconnected');
        });
    });

    socket.on('transcription:send', (data) => {
        const openAIWs = openAIConnections.get(userName);
        
        if (!openAIWs || openAIWs.readyState !== WebSocket.OPEN) {
            socket.emit('transcription:error', { error: 'Não conectado à OpenAI' });
            return;
        }

        openAIWs.send(data);
    });

    socket.on('transcription:disconnect', () => {
        const openAIWs = openAIConnections.get(userName);
        if (openAIWs) {
            openAIWs.close();
            openAIConnections.delete(userName);
        }
    });

    socket.on('sendTranscriptionToPeer', (data) => {
        const { roomId, transcription, from, to } = data;
        const room = rooms.get(roomId);

        if (!room) {
            console.log(`❌ Transcrição rejeitada: sala ${roomId} não existe`);
            return;
        }

        // Salvar transcrição no histórico da sala
        room.transcriptions.push({
            speaker: from,
            text: transcription,
            timestamp: new Date().toISOString()
        });

        resetRoomExpiration(roomId);

        console.log(`[ROOM ${roomId}] ${from} -> ${to}: "${transcription}"`);

        // Enviar para o host (apenas o host recebe todas as transcrições)
        if (room.hostSocketId) {
            io.to(room.hostSocketId).emit('receiveTranscriptionFromPeer', {
                roomId: roomId,
                transcription: transcription,
                from: from
            });
        }
    });

    // ==================== FINALIZAR SALA ====================
    
    socket.on('endRoom', (data, callback) => {
        const { roomId } = data;
        const room = rooms.get(roomId);

        if (!room) {
            callback({ success: false, error: 'Sala não encontrada' });
            return;
        }

        // Verificar se quem está finalizando é o host
        if (socket.id !== room.hostSocketId) {
            callback({ success: false, error: 'Apenas o host pode finalizar a sala' });
            return;
        }

        console.log(`🏁 Finalizando sala ${roomId}...`);

        // Salvar transcrições (simulado)
        const saveResult = saveTranscriptionsToDatabase(roomId);

        // Notificar participante que sala foi finalizada
        if (room.participantSocketId) {
            io.to(room.participantSocketId).emit('roomEnded', {
                roomId: roomId,
                message: 'A sala foi finalizada pelo host'
            });
        }

        // ✅ CORREÇÃO: Limpar timer do mapa separado
        if (roomTimers.has(roomId)) {
            clearTimeout(roomTimers.get(roomId));
            roomTimers.delete(roomId);
        }

        // Remover mapeamentos
        if (room.hostUserName) userToRoom.delete(room.hostUserName);
        if (room.participantUserName) userToRoom.delete(room.participantUserName);
        socketToRoom.delete(room.hostSocketId);
        if (room.participantSocketId) socketToRoom.delete(room.participantSocketId);

        // Remover sala
        rooms.delete(roomId);

        console.log(`✅ Sala ${roomId} finalizada`);

        callback({ 
            success: true, 
            message: 'Sala finalizada com sucesso',
            saveResult: saveResult
        });
    });

    // ==================== DESCONEXÃO ====================
    
    socket.on('disconnect', () => {
        console.log(`[${userName}] desconectado - Socket: ${socket.id}`);

        const roomId = socketToRoom.get(socket.id);
        
        if (roomId) {
            const room = rooms.get(roomId);
            
            if (room) {
                // Se host desconectou
                if (socket.id === room.hostSocketId) {
                    console.log(`⚠️ Host desconectou da sala ${roomId}`);
                    room.hostSocketId = null;
                }
                
                // Se participante desconectou
                if (socket.id === room.participantSocketId) {
                    console.log(`⚠️ Participante desconectou da sala ${roomId}`);
                    room.participantSocketId = null;
                }

                // Continuar com timer de expiração (permite reconexão)
                resetRoomExpiration(roomId);
            }
        }

        // Limpar conexão OpenAI
        const openAIWs = openAIConnections.get(userName);
        if (openAIWs) {
            openAIWs.close();
            openAIConnections.delete(userName);
        }

        socketToRoom.delete(socket.id);
    });
});