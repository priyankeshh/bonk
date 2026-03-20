const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 800;
canvas.height = 600;

// Screens
const screens = {
    landing: document.getElementById('screen-landing'),
    lobby: document.getElementById('screen-lobby'),
    game: document.getElementById('screen-game'),
    matchend: document.getElementById('screen-matchend')
};

function showScreen(screenId) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[screenId].classList.add('active');
}

// UI Elements
const els = {
    usernameInput: document.getElementById('usernameInput'),
    btnCreateRoom: document.getElementById('btnCreateRoom'),
    roomCodeInput: document.getElementById('roomCodeInput'),
    btnJoinRoom: document.getElementById('btnJoinRoom'),
    landingError: document.getElementById('landingError'),
    
    lobbyRoomCode: document.getElementById('lobbyRoomCode'),
    btnCopyCode: document.getElementById('btnCopyCode'),
    playerCount: document.getElementById('playerCount'),
    playerList: document.getElementById('playerList'),
    hostControls: document.getElementById('hostControls'),
    nonHostControls: document.getElementById('nonHostControls'),
    pointsToWin: document.getElementById('pointsToWin'),
    btnStartGame: document.getElementById('btnStartGame'),
    btnLeaveLobby: document.getElementById('btnLeaveLobby'),
    
    scoreList: document.getElementById('scoreList'),
    roundMessage: document.getElementById('round-message'),
    eliminatedMessage: document.getElementById('eliminated-message'),
    
    matchWinnerMessage: document.getElementById('matchWinnerMessage'),
    finalScoreList: document.getElementById('finalScoreList'),
    btnPlayAgain: document.getElementById('btnPlayAgain'),
    matchEndHostControls: document.getElementById('matchEndHostControls'),
    btnLeaveMatch: document.getElementById('btnLeaveMatch'),
    
    chatMessages: document.getElementById('chatMessages'),
    chatInput: document.getElementById('chatInput'),
    btnSendChat: document.getElementById('btnSendChat'),
    btnBackToLobby: document.getElementById('btnBackToLobby')
};

// State
let myId = null;
let currentRoom = null;
let isHost = false;
let serverState = {};
let platforms = [];
let isEliminated = false;
let isGameActive = false; // When to render the canvas

// ==============================
// Socket Events
// ==============================

// Connection
socket.on('connect', () => {
    myId = socket.id;
});

socket.on('mapData', (data) => {
    platforms = data;
});

// Room Events
socket.on('roomCreated', (code) => {
    currentRoom = code;
    isHost = true;
    els.landingError.innerText = '';
    showScreen('lobby');
});

socket.on('roomJoined', (code) => {
    currentRoom = code;
    isHost = false;
    els.landingError.innerText = '';
    showScreen('lobby');
});

socket.on('roomError', (msg) => {
    els.landingError.innerText = msg;
});

socket.on('lobbyUpdate', (roomState) => {
    // roomState: { id, host, players: [ {id, name, score} ], maxPlayers }
    els.lobbyRoomCode.innerText = roomState.id;
    els.playerCount.innerText = roomState.players.length;
    
    isHost = (roomState.host === myId);
    els.hostControls.style.display = isHost ? 'block' : 'none';
    els.nonHostControls.style.display = isHost ? 'none' : 'block';
    els.matchEndHostControls.style.display = isHost ? 'block' : 'none';
    if (els.btnBackToLobby) {
        els.btnBackToLobby.style.display = isHost ? 'inline-block' : 'none';
    }
    
    els.playerList.innerHTML = '';
    roomState.players.forEach(p => {
        const li = document.createElement('li');
        li.innerText = p.name;
        if (p.id === roomState.host) {
            const badge = document.createElement('span');
            badge.className = 'host-badge';
            badge.innerText = 'HOST';
            li.appendChild(badge);
        }
        els.playerList.appendChild(li);
    });
});

socket.on('roundStart', () => {
    isGameActive = true;
    isEliminated = false;
    els.roundMessage.classList.add('hidden');
    els.eliminatedMessage.classList.add('hidden');
    showScreen('game');
    canvas.focus();
});

socket.on('roundEnd', ({ winnerId, winnerName, scores }) => {
    updateScoreboard(scores);
    els.roundMessage.innerText = winnerName ? `${winnerName} won the round!` : 'Round Draw!';
    els.roundMessage.classList.remove('hidden');
    setTimeout(() => {
        els.roundMessage.classList.add('hidden');
    }, 2000);
});

socket.on('matchEnd', ({ winnerName, scores }) => {
    isGameActive = false;
    els.matchWinnerMessage.innerText = `${winnerName} WINS THE MATCH!`;
    
    // Sort scores descending
    const sortedScores = Object.values(scores).sort((a,b) => b.score - a.score);
    els.finalScoreList.innerHTML = '';
    sortedScores.forEach(p => {
        const li = document.createElement('li');
        li.innerText = `${p.name} - ${p.score} pts`;
        els.finalScoreList.appendChild(li);
    });
    
    showScreen('matchend');
});

socket.on('playerEliminated', (id) => {
    if (id === myId) {
        isEliminated = true;
        els.eliminatedMessage.innerText = "You were eliminated!";
        els.eliminatedMessage.classList.remove('hidden');
    }
});

socket.on('state', ({ playerStates, scores }) => {
    serverState = playerStates;
    if (scores) updateScoreboard(scores);
});

function updateScoreboard(scores) {
    els.scoreList.innerHTML = '';
    const sortedScores = Object.values(scores).sort((a,b) => b.score - a.score);
    sortedScores.forEach(p => {
        const li = document.createElement('li');
        li.innerText = `${p.name}: ${p.score}`;
        els.scoreList.appendChild(li);
    });
}

socket.on('chatMessage', ({ username, message }) => {
    if (!els.chatMessages) return;
    const li = document.createElement('li');
    li.innerHTML = `<strong>${username}:</strong> ${message}`;
    els.chatMessages.appendChild(li);
    els.chatMessages.scrollTop = els.chatMessages.scrollHeight;

    if (isGameActive) {
        setTimeout(() => {
            li.classList.add('fade-out');
        }, 5000);
    }
});

socket.on('returnedToLobby', () => {
    isGameActive = false;
    showScreen('lobby');
});

// ==============================
// DOM Events
// ==============================

els.btnCreateRoom.addEventListener('click', () => {
    const name = els.usernameInput.value.trim();
    if (!name) return els.landingError.innerText = "Username required";
    socket.emit('createRoom', name);
});

els.btnJoinRoom.addEventListener('click', () => {
    const name = els.usernameInput.value.trim();
    const code = els.roomCodeInput.value.trim().toUpperCase();
    if (!name) return els.landingError.innerText = "Username required";
    if (!code) return els.landingError.innerText = "Room code required";
    socket.emit('joinRoom', { code, username: name });
});

els.btnCopyCode.addEventListener('click', () => {
    navigator.clipboard.writeText(currentRoom);
});

els.btnStartGame.addEventListener('click', () => {
    const pointsToWin = parseInt(els.pointsToWin.value);
    socket.emit('startGame', { pointsToWin });
});

els.btnPlayAgain.addEventListener('click', () => {
    const pointsToWin = parseInt(els.pointsToWin.value); // uses the same value from lobby
    socket.emit('startGame', { pointsToWin });
});

function leaveRoom() {
    socket.emit('leaveRoom');
    currentRoom = null;
    isHost = false;
    isGameActive = false;
    showScreen('landing');
}

els.btnLeaveLobby.addEventListener('click', leaveRoom);
els.btnLeaveMatch.addEventListener('click', leaveRoom);

if (els.btnSendChat && els.chatInput) {
    els.btnSendChat.addEventListener('click', () => {
        const msg = els.chatInput.value.trim();
        if (msg) {
            socket.emit('chatMessage', { message: msg });
            els.chatInput.value = '';
        }
    });
}

if (els.btnBackToLobby) {
    els.btnBackToLobby.addEventListener('click', () => {
        socket.emit('backToLobby');
    });
}

// Input mapping
const keys = { 
    'w': 'up', 'a': 'left', 's': 'down', 'd': 'right', 
    'ArrowUp': 'up', 'ArrowLeft': 'left', 'ArrowDown': 'down', 'ArrowRight': 'right', 
    ' ': 'up', 'W': 'up', 'A': 'left', 'S': 'down', 'D': 'right' 
};
const keyState = { left: false, right: false, up: false, down: false };

let isChatFocused = false;
if (els.chatInput) {
    els.chatInput.addEventListener('focus', () => isChatFocused = true);
    els.chatInput.addEventListener('blur', () => isChatFocused = false);
}

window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        if (!isChatFocused) {
            if (els.chatInput) els.chatInput.focus();
            e.preventDefault();
            return;
        } else {
            if (els.btnSendChat) els.btnSendChat.click();
            return;
        }
    }

    if (isChatFocused) return; // Block game keys while chatting

    if (e.target.tagName !== 'INPUT' && ['w','W','s','S',' ','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
        e.preventDefault();
    }
    if (!isGameActive || isEliminated) return;
    const action = keys[e.key];
    if (action && !keyState[action]) {
        keyState[action] = true;
        socket.emit('input', { type: 'keydown', key: action });
    }
});

window.addEventListener('keyup', (e) => {
    if (!isGameActive) return;
    const action = keys[e.key];
    if (action && keyState[action]) {
        keyState[action] = false;
        socket.emit('input', { type: 'keyup', key: action });
    }
});

// ==============================
// Render Loop
// ==============================
function render() {
    if (isGameActive) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw platforms
        ctx.fillStyle = '#f8fafc';
        platforms.forEach(p => {
            ctx.fillRect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h);
        });

        // Draw all players
        for (const id in serverState) {
            const p = serverState[id];
            
            ctx.save();
            ctx.translate(p.x, p.y);
            
            // Name tag (unrotated)
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.font = '12px Outfit';
            ctx.textAlign = 'center';
            ctx.fillText(p.name, 0, -30);

            ctx.rotate(p.angle);
            
            ctx.beginPath();
            ctx.arc(0, 0, 20, 0, 2 * Math.PI);
            
            ctx.fillStyle = (id === myId) ? '#38bdf8' : '#e2e8f0';
            
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#0f172a';
            ctx.stroke();

            // Rotation indicator
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(20, 0);
            ctx.stroke();
            
            ctx.restore();
        }
    }

    requestAnimationFrame(render);
}

render();

