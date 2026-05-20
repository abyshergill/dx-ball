
// Audio Synthesizer Node Engine
const SoundFX = {
    ctx: null,
    init() { if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)(); },
    play(freq, type, duration, volume, endFreq = null) {
        try {
            this.init();
            let osc = this.ctx.createOscillator();
            let gain = this.ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
            if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, this.ctx.currentTime + duration);
            gain.gain.setValueAtTime(volume, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + duration);
        } catch(e) {}
    },
    paddle() { this.play(300, 'sine', 0.08, 0.15, 150); },
    brick(hits) { this.play(hits === 1 ? 600 : 450, 'triangle', 0.1, 0.15, 800); },
    laser() { this.play(900, 'sawtooth', 0.12, 0.06, 200); },
    powerUp() { this.play(400, 'sine', 0.2, 0.15, 900); },
    lose() { this.play(180, 'sawtooth', 0.4, 0.2, 60); },
    levelUp() {
        this.play(523.25, 'sine', 0.15, 0.2, 783.99);
        setTimeout(() => this.play(783.99, 'sine', 0.3, 0.2, 1046.50), 150);
    }
};

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const themeToggle = document.getElementById('theme-toggle');
const speedToggle = document.getElementById('speed-toggle');

const config = {
    brickHeight: 22,
    brickPadding: 6,
    brickOffsetTop: 35,
    brickOffsetLeft: 25
};

// --- MASTER CUSTOM MAP PACK GRID CONFIGURATION ---
// 0 = Empty Space, 1 = Green (1 hit), 2 = Cyan (2 hits), 3 = Magenta (3 hits)
const levelMaps = [
    // Level 1: Checkered Field layout pattern
    [
        [3,0,3,0,3,0,3,0,3,0],
        [0,2,0,2,0,2,0,2,0,2],
        [1,0,1,0,1,0,1,0,1,0],
        [0,2,0,2,0,2,0,2,0,2],
        [3,0,3,0,3,0,3,0,3,0]
    ],
    // Level 2: Space Invader / Crown pattern layout
    [
        [0,3,0,0,3,3,0,0,3,0],
        [0,3,3,3,2,2,3,3,3,0],
        [1,1,2,2,2,2,2,2,1,1],
        [1,0,1,0,0,0,0,1,0,1],
        [0,0,0,1,1,1,1,0,0,0]
    ],
    // Level 3: Neon Castle Fort wall pattern layout
    [
        [3,3,3,3,3,3,3,3,3,3],
        [3,0,0,2,2,2,2,0,0,3],
        [2,2,0,1,1,1,1,0,2,2],
        [1,1,1,0,0,0,0,1,1,1],
        [3,0,3,0,2,2,0,3,0,3]
    ]
];

let currentLevel = 0; // Indexes array position maps
let paddle = { x: 350, y: 465, width: 110, height: 14, targetWidth: 110, moveSpeed: 11 };
let ball = { x: 400, y: 400, vx: 4, vy: -5, radius: 7, active: false, maxSpeed: 14 };

let bricks = [];
let fallingItems = [];
let lasers = [];

let score = 0;
let lives = 3;
let gameState = "menu"; 
let hasLaser = false;

let keyboardState = { ArrowLeft: false, ArrowRight: false, KeyA: false, KeyD: false };

const getAssetColors = () => {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    return {
        ballColor: isLight ? '#0f172a' : '#ffffff',
        paddleColor: isLight ? '#0284c7' : '#00f2fe',
        laserColor: '#ff007f',
        brickThemes: {
            3: { color: '#db2777', shadow: 'rgba(219, 39, 119, 0.4)' },
            2: { color: '#0284c7', shadow: 'rgba(2, 132, 199, 0.4)' },
            1: { color: '#16a34a', shadow: 'rgba(22, 163, 74, 0.4)' }
        }
    };
};

const itemTypes = [
    { label: "E", color: "#0284c7", action: () => { paddle.targetWidth = 170; SoundFX.powerUp(); } }, 
    { label: "L", color: "#db2777", action: () => { hasLaser = true; SoundFX.powerUp(); } },         
    { label: "P", color: "#16a34a", action: () => { lives++; updateHUD(); SoundFX.powerUp(); } }     
];

// --- CONTROL INPUT LISTENERS ---
window.addEventListener('mousemove', (e) => {
    if (gameState !== "playing") return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    paddle.x = ((e.clientX - rect.left) * scaleX) - paddle.width / 2;
    clampPaddle();
});

window.addEventListener('mousedown', () => { triggerActionTrigger(); });

function handleMobileTouch(e) {
    if (gameState !== "playing") return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    paddle.x = ((e.touches[0].clientX - rect.left) * scaleX) - paddle.width / 2;
    clampPaddle();
}

canvas.addEventListener('touchstart', (e) => { e.preventDefault(); triggerActionTrigger(); handleMobileTouch(e); }, { passive: false });
canvas.addEventListener('touchmove', (e) => { e.preventDefault(); handleMobileTouch(e); }, { passive: false });

window.addEventListener('keydown', (e) => {
    if (e.code in keyboardState) keyboardState[e.code] = true;
    if (e.code === 'Space') { e.preventDefault(); triggerActionTrigger(); }
});
window.addEventListener('keyup', (e) => { if (e.code in keyboardState) keyboardState[e.code] = false; });

function handleKeyboardMovement() {
    if (keyboardState.ArrowLeft || keyboardState.KeyA) paddle.x -= paddle.moveSpeed;
    if (keyboardState.ArrowRight || keyboardState.KeyD) paddle.x += paddle.moveSpeed;
    clampPaddle();
}

function clampPaddle() {
    if (paddle.x < 0) paddle.x = 0;
    if (paddle.x + paddle.width > canvas.width) paddle.x = canvas.width - paddle.width;
}

function triggerActionTrigger() {
    if (gameState === "playing") {
        if (!ball.active) ball.active = true;
        else if (hasLaser) fireLasers();
    }
}

document.getElementById('start-btn').addEventListener('click', () => {
    document.getElementById('menu-overlay').style.display = 'none';
    if (gameState === "menu" || gameState === "gameover" || gameState === "win") {
        currentLevel = 0;
        score = 0;
        lives = 3;
    }
    resetSession();
});

themeToggle.addEventListener('change', () => {
    document.documentElement.setAttribute('data-theme', themeToggle.checked ? 'light' : 'dark');
});

// --- GAME CORE ENGINE PROCEDURES ---
function resetSession() {
    hasLaser = false;
    paddle.width = 110;
    paddle.targetWidth = 110;
    updateHUD();
    buildBrickMatrix();
    spawnBallOnPaddle();
    gameState = "playing";
}

function spawnBallOnPaddle() {
    ball.active = false;
    ball.vx = 4;
    ball.vy = -5;
    fallingItems = [];
    lasers = [];
    hasLaser = false;
    paddle.targetWidth = 110;
}

function buildBrickMatrix() {
    bricks = [];
    const blueprint = levelMaps[currentLevel];
    const rows = blueprint.length;
    const cols = blueprint[0].length;
    
    // Auto-calculate exact block size ratios down columns count
    const blockW = Math.floor((canvas.width - (config.brickOffsetLeft * 2)) / cols) - config.brickPadding;
    
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            let typeValue = blueprint[r][c];
            if (typeValue > 0) {
                bricks.push({
                    x: c * (blockW + config.brickPadding) + config.brickOffsetLeft,
                    y: r * (config.brickHeight + config.brickPadding) + config.brickOffsetTop,
                    w: blockW,
                    h: config.brickHeight,
                    durability: typeValue,
                    alive: true
                });
            }
        }
    }
}

function updateHUD() {
    document.getElementById('level-ticker').innerText = currentLevel + 1;
    document.getElementById('score-ticker').innerText = score.toString().padStart(4, '0');
    document.getElementById('lives-counter').innerText = "♥".repeat(Math.max(0, lives));
}

function fireLasers() {
    SoundFX.laser();
    lasers.push({ x: paddle.x + 10, y: paddle.y, vy: -7 });
    lasers.push({ x: paddle.x + paddle.width - 12, y: paddle.y, vy: -7 });
}

function triggerAutoSpeedEnhancement() {
    if (!speedToggle.checked) return;
    let currentSpeed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
    if (currentSpeed < ball.maxSpeed) {
        ball.vx *= 1.015;
        ball.vy *= 1.015;
    }
}

// Processing Step Loop Frame Calculations
function updateStep() {
    if (gameState !== "playing") return;

    handleKeyboardMovement();

    if (paddle.width !== paddle.targetWidth) {
        paddle.width += (paddle.targetWidth - paddle.width) * 0.1;
    }

    if (!ball.active) {
        ball.x = paddle.x + paddle.width / 2;
        ball.y = paddle.y - ball.radius - 2;
    } else {
        ball.x += ball.vx;
        ball.y += ball.vy;

        if (ball.x - ball.radius <= 0 || ball.x + ball.radius >= canvas.width) ball.vx *= -1;
        if (ball.y - ball.radius <= 0) ball.vy *= -1;

        if (ball.y + ball.radius >= paddle.y && ball.y - ball.radius <= paddle.y + paddle.height) {
            if (ball.x >= paddle.x && ball.x <= paddle.x + paddle.width) {
                SoundFX.paddle();
                let intersectX = ball.x - (paddle.x + paddle.width / 2);
                let normalizeIntersectX = intersectX / (paddle.width / 2);
                let bounceAngle = normalizeIntersectX * (Math.PI / 3); 

                let speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
                ball.vx = speed * Math.sin(bounceAngle);
                ball.vy = -speed * Math.cos(bounceAngle);
                ball.y = paddle.y - ball.radius - 1; 
            }
        }

        if (ball.y + ball.radius >= canvas.height) {
            SoundFX.lose();
            lives--;
            updateHUD();
            if (lives <= 0) endSession(false); else spawnBallOnPaddle();
        }
    }

    lasers.forEach((laser, idx) => {
        laser.y += laser.vy;
        if (laser.y < 0) lasers.splice(idx, 1);
    });

    fallingItems.forEach((item, idx) => {
        item.y += 2.5;
        if (item.y + 10 >= paddle.y && item.y <= paddle.y + paddle.height) {
            if (item.x + 10 >= paddle.x && item.x - 10 <= paddle.x + paddle.width) {
                item.type.action();
                fallingItems.splice(idx, 1);
            }
        }
        if (item.y > canvas.height) fallingItems.splice(idx, 1);
    });

    let bricksRemaining = false;
    bricks.forEach(brick => {
        if (!brick.alive) return;
        bricksRemaining = true;

        if (ball.x + ball.radius >= brick.x && ball.x - ball.radius <= brick.x + brick.w &&
            ball.y + ball.radius >= brick.y && ball.y - ball.radius <= brick.y + brick.h) {
            
            brick.durability--;
            SoundFX.brick(brick.durability);
            score += 5;
            updateHUD();
            triggerAutoSpeedEnhancement();

            if (brick.durability <= 0) {
                brick.alive = false;
                score += 20; 
                if (Math.random() < 0.25) {
                    let pickedType = itemTypes[Math.floor(Math.random() * itemTypes.length)];
                    fallingItems.push({ x: brick.x + brick.w / 2, y: brick.y + brick.h, type: pickedType });
                }
            }

            let prevX = ball.x - ball.vx;
            let prevY = ball.y - ball.vy;
            if (prevX < brick.x || prevX > brick.x + brick.w) ball.vx *= -1;
            if (prevY < brick.y || prevY > brick.y + brick.h) ball.vy *= -1;
        }

        lasers.forEach((laser, lIdx) => {
            if (laser.x >= brick.x && laser.x <= brick.x + brick.w &&
                laser.y >= brick.y && laser.y <= brick.y + brick.h) {
                lasers.splice(lIdx, 1);
                brick.durability--;
                SoundFX.brick(brick.durability);
                triggerAutoSpeedEnhancement();
                
                if (brick.durability <= 0) {
                    brick.alive = false;
                    score += 25;
                    if (Math.random() < 0.25) {
                        let pickedType = itemTypes[Math.floor(Math.random() * itemTypes.length)];
                        fallingItems.push({ x: brick.x + brick.w / 2, y: brick.y + brick.h, type: pickedType });
                    }
                }
                updateHUD();
            }
        });
    });

    // Level Complete Progression Engine Routing
    if (!bricksRemaining) {
        currentLevel++;
        if (currentLevel < levelMaps.length) {
            SoundFX.levelUp();
            resetSession();
        } else {
            endSession(true); // Player beat all layout maps configurations!
        }
    }
}

function endSession(isVictory) {
    gameState = isVictory ? "win" : "gameover";
    const overlay = document.getElementById('menu-overlay');
    const title = document.getElementById('menu-title');
    const sub = document.getElementById('menu-subtitle');
    const btn = document.getElementById('start-btn');

    overlay.style.display = "flex";
    btn.innerText = "PLAY AGAIN";
    if (isVictory) {
        title.innerText = "GRAND VICTORY! 🏆";
        sub.innerText = `Incredible skill! You conquered all levels. Final Score: ${score}`;
    } else {
        title.innerText = "GAME OVER 👾";
        sub.innerText = `The field collapsed at Level ${currentLevel + 1}! Final Score: ${score}`;
    }
}

// Scene Screen Drawing Graphics Paint Output
function renderScene() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const assets = getAssetColors();

    // 1. Bricks Matrix Layout Rendering
    bricks.forEach(brick => {
        if (!brick.alive) return;
        let theme = assets.brickThemes[brick.durability];
        ctx.save();
        ctx.shadowBlur = 6;
        ctx.shadowColor = theme.shadow;
        ctx.fillStyle = theme.color;
        ctx.fillRect(brick.x, brick.y, brick.w, brick.h);
        ctx.strokeStyle = "rgba(255,255,255,0.25)";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(brick.x, brick.y, brick.w, brick.h);
        ctx.restore();
    });

    // 2. Fall Modifiers Capsules
    fallingItems.forEach(item => {
        ctx.save();
        ctx.fillStyle = item.type.color;
        ctx.shadowBlur = 8;
        ctx.shadowColor = item.type.color;
        ctx.beginPath();
        ctx.arc(item.x, item.y, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(item.type.label, item.x, item.y);
        ctx.restore();
    });

    // 3. Laser Weapon Streams
    lasers.forEach(laser => {
        ctx.fillStyle = assets.laserColor;
        ctx.fillRect(laser.x, laser.y, 3, 12);
    });

    // 4. Interactive Paddle Block
    ctx.save();
    ctx.fillStyle = hasLaser ? assets.laserColor : assets.paddleColor;
    ctx.shadowBlur = 10;
    ctx.shadowColor = hasLaser ? assets.laserColor : assets.paddleColor;
    ctx.fillRect(paddle.x, paddle.y, paddle.width, paddle.height);
    if (hasLaser) {
        ctx.fillStyle = "#fff";
        ctx.fillRect(paddle.x, paddle.y - 4, 4, 4);
        ctx.fillRect(paddle.x + paddle.width - 4, paddle.y - 4, 4, 4);
    }
    ctx.restore();

    // 5. Ball Element
    ctx.save();
    ctx.fillStyle = assets.ballColor;
    ctx.shadowBlur = 8;
    ctx.shadowColor = assets.paddleColor;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function gameLoopFrame() {
    updateStep();
    renderScene();
    requestAnimationFrame(gameLoopFrame);
}

// Bootstrapping Engine
buildBrickMatrix();
renderScene();
requestAnimationFrame(gameLoopFrame);
