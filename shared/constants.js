const platforms = [
    { x: 400, y: 450, w: 400, h: 40 }, // large central platform
    { x: 150, y: 300, w: 150, h: 30 }, // left side platform
    { x: 650, y: 300, w: 150, h: 30 }  // right side platform
];

const spawnPoints = [
    { x: 150, y: 100 },
    { x: 250, y: 100 },
    { x: 350, y: 100 },
    { x: 450, y: 100 },
    { x: 550, y: 100 },
    { x: 650, y: 100 },
    { x: 300, y: 0 },
    { x: 500, y: 0 }
];

module.exports = { platforms, spawnPoints };
