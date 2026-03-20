const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server);
const Matter = require('matter-js');
const path = require('path');

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Matter.js aliases
const Engine = Matter.Engine,
    World = Matter.World,
    Bodies = Matter.Bodies,
    Body = Matter.Body,
    Events = Matter.Events;

// Create engine and world
const engine = Engine.create();
// Normal gravity
engine.gravity.y = 1;

// Create static floor
// Canvas will be 800x600. Floor at bottom.
const floor = Bodies.rectangle(400, 580, 800, 40, { isStatic: true });

// Create a single dynamic circle (Player)
const players = {}; // Map socket.id to { body, input }

Events.on(engine, 'collisionStart', (event) => {
    event.pairs.forEach((pair) => {
        if (pair.bodyA.label === 'player') pair.bodyA.isGrounded = true;
        if (pair.bodyB.label === 'player') pair.bodyB.isGrounded = true;
    });
});

Events.on(engine, 'collisionActive', (event) => {
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

World.add(engine.world, [floor]);

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Spawn a new player body for this connection
    const newPlayer = Bodies.circle(400, 100, 20, {
        restitution: 0.4,
        frictionAir: 0.01,
        friction: 0.8,
        frictionStatic: 1.0,
        density: 0.001,
        inertia: Infinity,
        label: 'player'
    });
    newPlayer.isGrounded = false;
    newPlayer.socketId = socket.id; // Helpful reference

    players[socket.id] = {
        body: newPlayer,
        input: { left: false, right: false, up: false }
    };

    World.add(engine.world, newPlayer);

    // Listen for input state changes
    socket.on('input', (data) => {
        const p = players[socket.id];
        if (!p) return;

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

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        if (players[socket.id]) {
            World.remove(engine.world, players[socket.id].body);
            delete players[socket.id];
        }
    });
});

// Server game loop (60Hz)
const TICK_RATE = 1000 / 60;
setInterval(() => {
    const state = {};

    Object.values(players).forEach(p => {
        const playerBody = p.body;
        const playerInput = p.input;

        // Apply continuous forces based on held inputs
        const moveForce = 0.005 * playerBody.mass;
        if (playerInput.left) {
            Body.applyForce(playerBody, playerBody.position, { x: -moveForce, y: 0 });
        }
        if (playerInput.right) {
            Body.applyForce(playerBody, playerBody.position, { x: moveForce, y: 0 });
        }

        // Jump impulse
        if (playerInput.up && playerBody.isGrounded) {
            Matter.Sleeping.set(playerBody, false);
            Body.setVelocity(playerBody, { x: playerBody.velocity.x, y: -12 });
            playerInput.up = false; // consume jump
        }

        // Cap horizontal velocity
        const maxVelocity = 7;
        if (playerBody.velocity.x > maxVelocity) {
            Body.setVelocity(playerBody, { x: maxVelocity, y: playerBody.velocity.y });
        } else if (playerBody.velocity.x < -maxVelocity) {
            Body.setVelocity(playerBody, { x: -maxVelocity, y: playerBody.velocity.y });
        }

        state[playerBody.socketId] = {
            x: playerBody.position.x,
            y: playerBody.position.y,
            angle: playerBody.angle
        };
    });

    // Step the physics engine forward
    Engine.update(engine, TICK_RATE);

    // Broadcast full state to all clients
    io.emit('state', state);
}, TICK_RATE);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
