const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server);
const Matter = require('matter-js');
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

const Engine = Matter.Engine,
      World = Matter.World,
      Bodies = Matter.Bodies,
      Body = Matter.Body,
      Events = Matter.Events;

const { platforms, spawnPoints } = require('./shared/constants');

// State maps
const rooms = {}; // code -> Room object
const socketRooms = {}; // socket.id -> code

const TICK_RATE = 1000 / 60;

// Helper to generate 6 letter code
function generateCode() {
    let result = '';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function processRoomEndRound(room) {
    // If only one player left (or 0 if solo)
    let aliveCount = 0;
    let winner = null;
    
    room.players.forEach(p => {
        if (!p.eliminated) {
            aliveCount++;
            winner = p;
        }
    });

    // Handle solo mode win or multiplayer win
    if (aliveCount <= 1 && room.players.size > 0) {
        room.state = 'roundEnd';
        
        let winnerName = null;
        let winnerId = null;
        
        if (winner) {
            winner.score++;
            winnerName = winner.name;
            winnerId = winner.id;
        }

        const scores = {};
        room.players.forEach(p => {
            scores[p.id] = { name: p.name, score: p.score };
        });

        io.to(room.id).emit('roundEnd', { winnerId, winnerName, scores });

        setTimeout(() => {
            if (!rooms[room.id]) return; // room dissolved

            let matchOver = false;
            let matchWinnerName = null;
            
            room.players.forEach(p => {
                if (p.score >= room.pointsToWin) {
                    matchOver = true;
                    matchWinnerName = p.name;
                }
            });

            if (matchOver) {
                room.state = 'waiting';
                clearInterval(room.loopInterval);
                room.loopInterval = null;
                
                // reset scores for future
                room.players.forEach(p => p.score = 0);
                
                io.to(room.id).emit('matchEnd', { winnerName: matchWinnerName, scores });
            } else {
                startRound(room);
            }
        }, 3000);
    }
}

function startRound(room) {
    room.state = 'inRound';
    
    // Reset all players
    let i = 0;
    room.players.forEach(p => {
        p.eliminated = false;
        const sp = spawnPoints[i % spawnPoints.length];
        Body.setPosition(p.body, sp);
        Body.setVelocity(p.body, { x: 0, y: 0 });
        Matter.Sleeping.set(p.body, false);
        p.input = { left: false, right: false, up: false };
        World.add(room.engine.world, p.body);
        i++;
    });

    io.to(room.id).emit('roundStart');
}

function createRoomObject(code) {
    const engine = Engine.create();
    engine.gravity.y = 1;
    
    const staticPlatforms = platforms.map(p => 
        Bodies.rectangle(p.x, p.y, p.w, p.h, { isStatic: true, friction: 0.01 })
    );
    World.add(engine.world, staticPlatforms);

    // Collision events for this room
    Events.on(engine, 'collisionStart', (event) => {
        event.pairs.forEach((pair) => {
            if (pair.bodyA.label === 'player') pair.bodyA.isGrounded = true;
            if (pair.bodyB.label === 'player') pair.bodyB.isGrounded = true;
        });
    });
    Events.on(engine, 'collisionEnd', (event) => {
        event.pairs.forEach((pair) => {
            if (pair.bodyA.label === 'player') pair.bodyA.isGrounded = false;
            if (pair.bodyB.label === 'player') pair.bodyB.isGrounded = false;
        });
    });

    return {
        id: code,
        host: null,
        players: new Map(), // socket.id -> playerData
        engine: engine,
        state: 'waiting', // waiting, inRound, roundEnd
        loopInterval: null,
        pointsToWin: 5
    };
}

function broadcastLobbyUpdate(room) {
    const playersArr = Array.from(room.players.values()).map(p => ({
        id: p.id,
        name: p.name,
        score: p.score
    }));
    io.to(room.id).emit('lobbyUpdate', {
        id: room.id,
        host: room.host,
        players: playersArr,
        maxPlayers: 8
    });
}

function removePlayerFromRoom(socketId) {
    const code = socketRooms[socketId];
    if (!code) return;

    const room = rooms[code];
    if (!room) return;

    const p = room.players.get(socketId);
    if (p) {
        if (!p.eliminated && room.state === 'inRound') {
            World.remove(room.engine.world, p.body);
        }
        room.players.delete(socketId);
    }
    
    delete socketRooms[socketId];

    if (room.players.size === 0) {
        if (room.loopInterval) clearInterval(room.loopInterval);
        delete rooms[code];
    } else {
        if (room.host === socketId) {
            room.host = Array.from(room.players.keys())[0];
        }
        broadcastLobbyUpdate(room);
        
        if (room.state === 'inRound' && !p.eliminated) {
            io.to(room.id).emit('playerEliminated', socketId);
            processRoomEndRound(room);
        }
    }
}

io.on('connection', (socket) => {
    socket.emit('mapData', platforms);

    socket.on('createRoom', (username) => {
        removePlayerFromRoom(socket.id);
        
        let code = generateCode();
        while (rooms[code]) code = generateCode();

        const room = createRoomObject(code);
        rooms[code] = room;
        
        // Setup player
        setupPlayerInRoom(socket, room, username, true);
        socket.emit('roomCreated', code);
    });

    socket.on('joinRoom', ({ code, username }) => {
        removePlayerFromRoom(socket.id);
        
        const room = rooms[code];
        if (!room) {
            return socket.emit('roomError', 'Room not found');
        }
        if (room.players.size >= 8) {
            return socket.emit('roomError', 'Room is full');
        }
        if (room.state !== 'waiting') {
            return socket.emit('roomError', 'Game in progress');
        }

        setupPlayerInRoom(socket, room, username, false);
        socket.emit('roomJoined', code);
    });

    function setupPlayerInRoom(socket, room, username, isHost) {
        socket.join(room.id);
        socketRooms[socket.id] = room.id;
        if (isHost) room.host = socket.id;

        const pBody = Bodies.circle(0, -100, 20, {
            restitution: 0.5,
            frictionAir: 0.01,
            friction: 0.01,
            frictionStatic: 1.0,
            density: 0.001,
            inertia: Infinity,
            label: 'player'
        });
        pBody.isGrounded = false;
        
        room.players.set(socket.id, {
            id: socket.id,
            name: username.substring(0, 16),
            body: pBody,
            input: { left: false, right: false, up: false },
            eliminated: true,
            score: 0
        });

        broadcastLobbyUpdate(room);
    }

    socket.on('startGame', ({ pointsToWin }) => {
        const code = socketRooms[socket.id];
        if (!code) return;
        const room = rooms[code];
        if (room.host !== socket.id) return;
        if (room.state !== 'waiting') return;

        room.pointsToWin = pointsToWin || 5;

        startRound(room);
        
        if (!room.loopInterval) {
            room.loopInterval = setInterval(() => {
                roomLoop(room);
            }, TICK_RATE);
        }
    });

    socket.on('input', (data) => {
        const code = socketRooms[socket.id];
        if (!code) return;
        const room = rooms[code];
        if (room.state !== 'inRound') return;

        const p = room.players.get(socket.id);
        if (!p || p.eliminated) return;

        if (data.type === 'keydown') {
            if (data.key === 'left') p.input.left = true;
            if (data.key === 'right') p.input.right = true;
            if (data.key === 'up') p.input.up = true;
        } else if (data.type === 'keyup') {
            if (data.key === 'left') p.input.left = false;
            if (data.key === 'right') p.input.right = false;
            if (data.key === 'up') p.input.up = false;
        }
    });

    socket.on('leaveRoom', () => {
        const code = socketRooms[socket.id];
        if (code) {
            socket.leave(code);
            removePlayerFromRoom(socket.id);
        }
    });

    socket.on('disconnect', () => {
        removePlayerFromRoom(socket.id);
    });
});

function roomLoop(room) {
    if (room.state !== 'inRound') return; // Only process physics if in round

    const state = { playerStates: {}, scores: null };

    room.players.forEach(p => {
        if (p.eliminated) return;

        const pb = p.body;
        
        if (pb.position.y > 800) {
            p.eliminated = true;
            World.remove(room.engine.world, pb);
            io.to(room.id).emit('playerEliminated', p.id);
            processRoomEndRound(room);
            return;
        }

        const input = p.input;
        const moveForce = 0.015 * pb.mass;
        if (input.left) Body.applyForce(pb, pb.position, { x: -moveForce, y: 0 });
        if (input.right) Body.applyForce(pb, pb.position, { x: moveForce, y: 0 });

        if (input.up && pb.isGrounded) {
            Matter.Sleeping.set(pb, false);
            Body.setVelocity(pb, { x: pb.velocity.x, y: -12 });
            input.up = false;
        }

        const maxVelocity = 7;
        if (pb.velocity.x > maxVelocity) Body.setVelocity(pb, { x: maxVelocity, y: pb.velocity.y });
        else if (pb.velocity.x < -maxVelocity) Body.setVelocity(pb, { x: -maxVelocity, y: pb.velocity.y });

        state.playerStates[p.id] = {
            x: pb.position.x,
            y: pb.position.y,
            angle: pb.angle,
            name: p.name
        };
    });

    Engine.update(room.engine, TICK_RATE);
    io.to(room.id).emit('state', state);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
