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
const player = Bodies.circle(400, 100, 20, { 
    restitution: 0.5, 
    friction: 0.05,
    density: 0.002,
    sleepThreshold: -1
});

player.isGrounded = false;

Events.on(engine, 'collisionStart', (event) => {
    event.pairs.forEach((pair) => {
        if (pair.bodyA === player || pair.bodyB === player) player.isGrounded = true;
    });
});

Events.on(engine, 'collisionActive', (event) => {
    event.pairs.forEach((pair) => {
        if (pair.bodyA === player || pair.bodyB === player) player.isGrounded = true;
    });
});

Events.on(engine, 'collisionEnd', (event) => {
    event.pairs.forEach((pair) => {
        if (pair.bodyA === player || pair.bodyB === player) player.isGrounded = false;
    });
});

World.add(engine.world, [floor, player]);

// Track inputs for the single player (for Phase 1 prototype)
const playerInput = { left: false, right: false, up: false };

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Listen for input state changes from the client to avoid input flooding
    socket.on('input', (data) => {
        if (data.type === 'keydown') {
            if (data.key === 'left') playerInput.left = true;
            if (data.key === 'right') playerInput.right = true;
            if (data.key === 'up') playerInput.up = true;
        } else if (data.type === 'keyup') {
            if (data.key === 'left') playerInput.left = false;
            if (data.key === 'right') playerInput.right = false;
            // Depending on jump mechanics, you might not strictly need keyup for 'up', 
            // but we track it to prevent holding space to continuously bounce perfectly.
            if (data.key === 'up') playerInput.up = false;
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

// Server game loop (60Hz)
// Note: setInterval drift is acceptable for this prototype
const TICK_RATE = 1000 / 60;
setInterval(() => {
    // Apply continuous forces based on held inputs
    const moveForce = 0.01;
    if (playerInput.left) {
        Body.applyForce(player, player.position, { x: -moveForce, y: 0 });
    }
    if (playerInput.right) {
        Body.applyForce(player, player.position, { x: moveForce, y: 0 });
    }
    
    // Jump impulse
    if (playerInput.up && player.isGrounded) {
        Matter.Sleeping.set(player, false);
        Body.setVelocity(player, { x: player.velocity.x, y: -12 });
        playerInput.up = false; // consume the jump edge so they don't hold it down forever
    }

    // Cap horizontal velocity to keep movement manageable
    const maxVelocity = 7;
    if (player.velocity.x > maxVelocity) {
        Body.setVelocity(player, { x: maxVelocity, y: player.velocity.y });
    } else if (player.velocity.x < -maxVelocity) {
        Body.setVelocity(player, { x: -maxVelocity, y: player.velocity.y });
    }

    // Step the physics engine forward
    Engine.update(engine, TICK_RATE);

    // Broadcast state to all clients
    io.emit('state', {
        x: player.position.x,
        y: player.position.y,
        angle: player.angle
    });
}, TICK_RATE);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
