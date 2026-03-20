const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = 800;
canvas.height = 600;

// Track the state coming from the server
// Default position before first tick
let serverState = { x: 400, y: 100, angle: 0 };

// Listen for state updates
// Future Phase 3: We will buffer these updates and interpolate between them.
// For now, we simply update the variable directly.
socket.on('state', (state) => {
    serverState = state;
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

    // Draw floor 
    // Server says: x=400 (center), y=580 (center), w=800, h=40
    ctx.fillStyle = '#333';
    // fillRect wants top-left coordinates: 400 - 400 = 0, 580 - 20 = 560
    ctx.fillRect(0, 560, 800, 40); 

    // Draw player
    ctx.save();
    ctx.translate(serverState.x, serverState.y);
    ctx.rotate(serverState.angle);
    
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, 2 * Math.PI);
    ctx.fillStyle = '#ff4d4d'; // Red circle
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

    requestAnimationFrame(render);
}

// Start rendering loop immediately (at display rate)
render();
