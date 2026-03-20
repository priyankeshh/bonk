const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = 800;
canvas.height = 600;

// Track the state coming from the server
// Now a map of socket.id -> {x, y, angle}
let serverState = {};
let platforms = [];
let isEliminated = false;

// Listen for state updates
// Future Phase 3: We will buffer these updates and interpolate between them.
// For now, we simply update the variable directly.
socket.on('state', (state) => {
    serverState = state;
    if (serverState[socket.id]) {
        isEliminated = false;
    }
});

socket.on('mapData', (data) => {
    platforms = data;
});

socket.on('playerEliminated', (id) => {
    if (id === socket.id) {
        isEliminated = true;
    }
});

// Input mapping
const keys = {
    'w': 'up',
    'a': 'left',
    'd': 'right',
    'ArrowUp': 'up',
    'ArrowLeft': 'left',
    'ArrowRight': 'right',
    ' ': 'up' // spacebar jump
};

// Track local key state to PREVENT FLOODING
const keyState = { left: false, right: false, up: false };

window.addEventListener('keydown', (e) => {
    const action = keys[e.key];
    // If it's a valid action and the key wasn't ALREADY pressed down
    if (action && !keyState[action]) {
        keyState[action] = true;
        // Emit only ONCE per state change
        socket.emit('input', { type: 'keydown', key: action });
    }
});

window.addEventListener('keyup', (e) => {
    const action = keys[e.key];
    // If it's a valid action and the key was previously pressed down
    if (action && keyState[action]) {
        keyState[action] = false;
        // Emit only ONCE per state change
        socket.emit('input', { type: 'keyup', key: action });
    }
});

// Client render loop
function render() {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw platforms
    ctx.fillStyle = '#333';
    platforms.forEach(p => {
        // Matter.js rectangle coordinates are center-based, canvas fillRect is top-left
        ctx.fillRect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h);
    });

    // Draw all players
    for (const id in serverState) {
        const p = serverState[id];
        
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        
        ctx.beginPath();
        ctx.arc(0, 0, 20, 0, 2 * Math.PI);
        
        // Highlight own socket ID in red, others in blue
        if (id === socket.id) {
            ctx.fillStyle = '#ff4d4d'; // Red
        } else {
            ctx.fillStyle = '#4da6ff'; // Blue
        }
        
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#000';
        ctx.stroke();

        // Draw a visual indicator for rotation
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(20, 0);
        ctx.stroke();
        
        ctx.restore();
    }

    // Draw elimination screen overlay if eliminate
    if (isEliminated) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.fillStyle = 'white';
        ctx.font = '30px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('You were eliminated — respawning...', canvas.width / 2, canvas.height / 2);
    }

    requestAnimationFrame(render);
}

// Start rendering loop immediately (at display rate)
render();

// Focus canvas so the first keypress registers
window.onload = () => {
    canvas.focus();
};
