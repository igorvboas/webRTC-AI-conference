const fs = require('fs');
const https = require('https');
const express = require('express');
const app = express();
const socketio = require('socket.io');
const WebSocket = require('ws'); // Instalar: npm install ws

// Carregar variáveis de ambiente do .env
require('dotenv').config();

app.use(express.static(__dirname));

// Chave da API OpenAI (lida do .env)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY; // defina em .env

const key = fs.readFileSync('cert.key');
const cert = fs.readFileSync('cert.crt');

const expressServer = https.createServer({key, cert}, app);

// Configurar Socket.IO com CORS
const io = socketio(expressServer, {
    cors: {
        origin: "*", // Em produção, especifique os domínios permitidos
        methods: ["GET", "POST"],
        credentials: true
    }
});

expressServer.listen(8181);

// Armazenamento de ofertas e sockets conectados
const offers = [];
const connectedSockets = [];

// Mapa de conexões OpenAI por usuário
const openAIConnections = new Map();

io.on('connection', (socket) => {
    const userName = socket.handshake.auth.userName;
    const password = socket.handshake.auth.password;

    if(password !== "x"){
        socket.disconnect(true);
        return;
    }
    
    connectedSockets.push({
        socketId: socket.id,
        userName
    });

    console.log(`[${userName}] conectado`);

    // Enviar ofertas disponíveis
    if(offers.length){
        socket.emit('availableOffers', offers);
    }
    
    // Handler: Nova oferta
    socket.on('newOffer', newOffer => {
        offers.push({
            offererUserName: userName,
            offer: newOffer,
            offerIceCandidates: [],
            answererUserName: null,
            answer: null,
            answererIceCandidates: []
        });
        socket.broadcast.emit('newOfferAwaiting', offers.slice(-1));
    });

    // Handler: Nova resposta
    socket.on('newAnswer', (offerObj, ackFunction) => {
        const socketToAnswer = connectedSockets.find(s => s.userName === offerObj.offererUserName);
        if(!socketToAnswer) return;
        
        const socketIdToAnswer = socketToAnswer.socketId;
        const offerToUpdate = offers.find(o => o.offererUserName === offerObj.offererUserName);
        if(!offerToUpdate) return;
        
        ackFunction(offerToUpdate.offerIceCandidates);
        offerToUpdate.answer = offerObj.answer;
        offerToUpdate.answererUserName = userName;
        socket.to(socketIdToAnswer).emit('answerResponse', offerToUpdate);
    });

    // Handler: ICE Candidate
    socket.on('sendIceCandidateToSignalingServer', iceCandidateObj => {
        const { didIOffer, iceUserName, iceCandidate } = iceCandidateObj;
        
        if(didIOffer){
            const offerInOffers = offers.find(o => o.offererUserName === iceUserName);
            if(offerInOffers){
                offerInOffers.offerIceCandidates.push(iceCandidate);
                if(offerInOffers.answererUserName){
                    const socketToSendTo = connectedSockets.find(s => s.userName === offerInOffers.answererUserName);
                    if(socketToSendTo){
                        socket.to(socketToSendTo.socketId).emit('receivedIceCandidateFromServer', iceCandidate);
                    }
                }
            }
        } else {
            const offerInOffers = offers.find(o => o.answererUserName === iceUserName);
            const socketToSendTo = connectedSockets.find(s => s.userName === offerInOffers.offererUserName);
            if(socketToSendTo){
                socket.to(socketToSendTo.socketId).emit('receivedIceCandidateFromServer', iceCandidate);
            }
        }
    });

    // ==================== PROXY OPENAI REALTIME API ====================
    
    // Handler: Conectar à OpenAI
    socket.on('transcription:connect', (data, callback) => {
        console.log(`[${userName}] Solicitando conexão com OpenAI...`);
        
        // Verificar se já existe conexão
        if(openAIConnections.has(userName)){
            console.log(`[${userName}] Já possui conexão ativa`);
            callback({ success: true, message: 'Já conectado' });
            return;
        }

        if(!OPENAI_API_KEY){
            const msg = 'OPENAI_API_KEY não definida no .env';
            console.error(`[${userName}] ❌ ${msg}`);
            callback({ success: false, error: msg });
            return;
        }

        // Criar WebSocket com OpenAI
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
            console.log(`[${userName}] ✅ Conectado à OpenAI`);
            openAIConnections.set(userName, openAIWs);
            callback({ success: true, message: 'Conectado com sucesso' });
        });

        openAIWs.on('message', (data) => {
            // Encaminhar mensagens da OpenAI para o cliente
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

    // Handler: Enviar mensagem para OpenAI
    socket.on('transcription:send', (data) => {
        const openAIWs = openAIConnections.get(userName);
        
        if(!openAIWs || openAIWs.readyState !== WebSocket.OPEN){
            console.warn(`[${userName}] Tentou enviar, mas não está conectado`);
            socket.emit('transcription:error', { error: 'Não conectado à OpenAI' });
            return;
        }

        openAIWs.send(data);
    });

    // Handler: Desconectar da OpenAI
    socket.on('transcription:disconnect', () => {
        const openAIWs = openAIConnections.get(userName);
        if(openAIWs){
            openAIWs.close();
            openAIConnections.delete(userName);
            console.log(`[${userName}] Desconectado da OpenAI`);
        }
    });

    // Cleanup ao desconectar
    socket.on('disconnect', () => {
        console.log(`[${userName}] desconectado`);
        
        // Fechar conexão OpenAI se existir
        const openAIWs = openAIConnections.get(userName);
        if(openAIWs){
            openAIWs.close();
            openAIConnections.delete(userName);
        }
        
        // Remover da lista
        const index = connectedSockets.findIndex(s => s.socketId === socket.id);
        if(index !== -1){
            connectedSockets.splice(index, 1);
        }
    });
});

console.log('🚀 Servidor rodando em https://localhost:8181');
console.log('📡 Proxy OpenAI Realtime ativo');