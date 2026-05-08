const MODES = {
  work:       { label: '作業',   seconds: 25 * 60 },
  shortBreak: { label: '小休憩', seconds:  5 * 60 },
  longBreak:  { label: '長休憩', seconds: 15 * 60 },
};

const POMODOROS_BEFORE_LONG_BREAK = 4;

let musicConfig = null;

fetch('./music-config.json')
  .then(r => r.json())
  .then(data => { musicConfig = data; })
  .catch(() => {});

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

let currentMode = 'work';
let secondsLeft = MODES.work.seconds;
let isRunning = false;
let intervalId = null;
let completedPomodoros = 0;
let musicEnabled = false;
let selectedGenre = 'jazz';
let currentAudio = null;

const timeEl        = document.getElementById('time');
const startPauseBtn = document.getElementById('startPauseBtn');
const resetBtn      = document.getElementById('resetBtn');
const countEl       = document.getElementById('count');
const dotsEl        = document.getElementById('dots');
const musicBtn      = document.getElementById('musicBtn');
const genreSelector = document.getElementById('genreSelector');
const canvas        = document.getElementById('visualizer');
const canvasCtx     = canvas.getContext('2d');

// ── Audio Context & Analyser ───────────────────────────────────────────────
let audioCtx = null;
let analyser = null;
let animFrameId = null;

function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.85;
    analyser.connect(audioCtx.destination);
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

// ── Canvas (full-screen background) ───────────────────────────────────────
function resizeCanvas() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);

function getModeColor() {
  if (currentMode === 'shortBreak') return '90,154,106';
  if (currentMode === 'longBreak')  return '74,122,191';
  return '212,208,203';
}

let dancePhase    = 0;
let smoothEnergy  = 0;
let currentVisual = 'aurora';

// ── 波紋 ─────────────────────────────────────────────────────────────────────
const ripples = [];

function drawRipples(energy, color) {
  if (Math.random() < 0.025 + energy * 0.08) {
    ripples.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height,
      r: 0, maxR: 60 + Math.random() * 130, speed: 0.4 + Math.random() * 0.7 });
  }
  for (let i = ripples.length - 1; i >= 0; i--) {
    const rp = ripples[i];
    rp.r += rp.speed + energy * 2;
    const prog = rp.r / rp.maxR;
    if (prog >= 1) { ripples.splice(i, 1); continue; }
    const a = (1 - prog) * (0.55 + energy * 0.3);
    for (let k = 0; k < 3; k++) {
      const kr = rp.r * (1 - k * 0.13);
      if (kr <= 0) continue;
      canvasCtx.beginPath();
      canvasCtx.arc(rp.x, rp.y, kr, 0, Math.PI * 2);
      canvasCtx.strokeStyle = `rgba(${color},${a * (1 - k * 0.28)})`;
      canvasCtx.lineWidth = 1.2 - k * 0.3;
      canvasCtx.stroke();
    }
  }
}

// ── 流煙 ─────────────────────────────────────────────────────────────────────
const smokeParticles = Array.from({ length: 70 }, () => ({
  x: Math.random(), y: Math.random(),
  r: 20 + Math.random() * 45,
  vy: -(0.0008 + Math.random() * 0.0014),
  ph: Math.random() * Math.PI * 2,
  a: 0.04 + Math.random() * 0.10,
}));

function drawSmoke(energy, color) {
  const W = canvas.width, H = canvas.height;
  smokeParticles.forEach(p => {
    p.ph += 0.007 + energy * 0.015;
    p.y  += p.vy - energy * 0.0008;
    if (p.y < -0.15) { p.y = 1.05; p.x = Math.random(); }
    const sx = p.x * W + Math.sin(p.ph) * 28;
    const sy = p.y * H;
    const r  = p.r * (1 + energy * 0.4);
    const a  = p.a + energy * 0.04;
    const g  = canvasCtx.createRadialGradient(sx, sy, 0, sx, sy, r);
    g.addColorStop(0, `rgba(${color},${a})`);
    g.addColorStop(1, `rgba(${color},0)`);
    canvasCtx.fillStyle = g;
    canvasCtx.beginPath();
    canvasCtx.arc(sx, sy, r, 0, Math.PI * 2);
    canvasCtx.fill();
  });
}

// ── 深海 ─────────────────────────────────────────────────────────────────────
const deepParticles = Array.from({ length: 100 }, () => ({
  x: Math.random(), y: Math.random(),
  r: 1 + Math.random() * 2,
  vy: -(0.0002 + Math.random() * 0.0005),
  vx: (Math.random() - 0.5) * 0.0003,
  ph: Math.random() * Math.PI * 2,
  a: 0.25 + Math.random() * 0.5,
}));

function drawDeepSea(energy, phase) {
  const W = canvas.width, H = canvas.height;
  const hue = getModeHue();
  // 光の柱
  for (let i = 0; i < 5; i++) {
    const rx = (0.1 + i * 0.2) * W;
    const rw = 22 + Math.sin(phase * 0.3 + i * 1.1) * 10;
    const ra = 0.04 + Math.sin(phase * 0.4 + i * 1.3) * 0.02 + energy * 0.04;
    const g  = canvasCtx.createLinearGradient(rx, 0, rx, H * 0.75);
    g.addColorStop(0, `hsla(${hue + i * 12},70%,72%,${ra})`);
    g.addColorStop(1, `hsla(${hue + i * 12},70%,55%,0)`);
    canvasCtx.fillStyle = g;
    canvasCtx.beginPath();
    canvasCtx.moveTo(rx - rw, 0);
    canvasCtx.lineTo(rx + rw, 0);
    canvasCtx.lineTo(rx + rw * 0.25, H * 0.75);
    canvasCtx.lineTo(rx - rw * 0.25, H * 0.75);
    canvasCtx.fill();
  }
  // 発光粒子
  deepParticles.forEach(p => {
    p.ph += 0.012;
    p.x  += p.vx + Math.sin(p.ph) * 0.00018;
    p.y  += p.vy;
    if (p.y < -0.02) { p.y = 1.02; p.x = Math.random(); }
    if (p.x < 0) p.x = 1; if (p.x > 1) p.x = 0;
    const pulse = (Math.sin(p.ph * 2) + 1) * 0.5;
    const a = p.a * (0.4 + pulse * 0.6) * (1 + energy * 0.5);
    const r = p.r * (1 + pulse * 0.5 + energy * 0.3);
    const h2 = (hue + pulse * 40) % 360;
    canvasCtx.beginPath();
    canvasCtx.arc(p.x * W, p.y * H, r, 0, Math.PI * 2);
    canvasCtx.fillStyle = `hsla(${h2},85%,78%,${a})`;
    canvasCtx.fill();
    canvasCtx.beginPath();
    canvasCtx.arc(p.x * W, p.y * H, r * 4.5, 0, Math.PI * 2);
    canvasCtx.fillStyle = `hsla(${h2},85%,78%,${a * 0.07})`;
    canvasCtx.fill();
  });
}

// ── 星空 ────────────────────────────────────────────────────────────────────
const stars = Array.from({ length: 150 }, () => ({
  x: Math.random(), y: Math.random(),
  r: Math.random() * 1.3 + 0.3,
  baseAlpha: Math.random() * 0.55 + 0.25,
  tp: Math.random() * Math.PI * 2,
  ts: Math.random() * 0.035 + 0.008,
}));
const shooters = [];

function drawStarfield(energy, color) {
  const W = canvas.width, H = canvas.height;
  stars.forEach(s => {
    s.tp += s.ts + energy * 0.04;
    const tw = (Math.sin(s.tp) + 1) / 2;
    const alpha = s.baseAlpha * (0.35 + tw * 0.65);
    const r = s.r * (1 + energy * tw * 1.0);
    canvasCtx.beginPath();
    canvasCtx.arc(s.x * W, s.y * H, r, 0, Math.PI * 2);
    canvasCtx.fillStyle = `rgba(${color},${alpha})`;
    canvasCtx.fill();
    if (tw > 0.85 && r > 1) {
      canvasCtx.beginPath();
      canvasCtx.arc(s.x * W, s.y * H, r * 4, 0, Math.PI * 2);
      canvasCtx.fillStyle = `rgba(${color},${alpha * 0.08})`;
      canvasCtx.fill();
    }
  });
  if (energy > 0.18 && Math.random() < energy * 0.06) {
    shooters.push({ x: Math.random() * W, y: Math.random() * H * 0.6,
      vx: (Math.random() * 4 + 3) * (Math.random() > 0.5 ? 1 : -1),
      vy: Math.random() * 2 + 1, alpha: 1, len: Math.random() * 35 + 15, color });
  }
  for (let i = shooters.length - 1; i >= 0; i--) {
    const s = shooters[i];
    canvasCtx.beginPath();
    canvasCtx.moveTo(s.x, s.y);
    canvasCtx.lineTo(s.x - s.vx * s.len / 8, s.y - s.vy * s.len / 8);
    canvasCtx.strokeStyle = `rgba(${s.color},${s.alpha})`;
    canvasCtx.lineWidth = 1.2;
    canvasCtx.stroke();
    s.x += s.vx; s.y += s.vy; s.alpha -= 0.055;
    if (s.alpha < 0.05) shooters.splice(i, 1);
  }
}

// ── オーロラ ─────────────────────────────────────────────────────────────────
function getModeHue() {
  if (currentMode === 'shortBreak') return 145;
  if (currentMode === 'longBreak')  return 215;
  return 270;
}

function drawAurora(energy, phase) {
  const W = canvas.width, H = canvas.height;
  const baseHue = getModeHue();
  [[0.25, 0.28, 1.0], [0.45, 0.22, 0.65], [0.62, 0.16, 0.40]].forEach(([baseY, amp, phaseScale], b) => {
    const bp = phase * phaseScale + b * 2.1;
    const waveAmp = H * (amp + energy * 0.15);

    const getY = (x) => {
      const t = x / W;
      return H * baseY
        + Math.sin(t * Math.PI * 3.5 + bp) * waveAmp
        + Math.sin(t * Math.PI * 6.2 - bp * 0.7) * waveAmp * 0.35;
    };

    // fill from wave downward to bottom of canvas
    canvasCtx.beginPath();
    canvasCtx.moveTo(0, H);
    canvasCtx.lineTo(0, getY(0));
    let px = 0, py = getY(0);
    for (let x = 4; x <= W; x += 4) {
      const y = getY(x);
      canvasCtx.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2);
      px = x; py = y;
    }
    canvasCtx.lineTo(W, H);
    canvasCtx.closePath();

    const hue = (baseHue + b * 28 + phase * 6) % 360;
    const sat = 65 + energy * 25;
    const fa  = 0.38 + energy * 0.25 - b * 0.06;
    const waveBotY = H * baseY + waveAmp;
    const grad = canvasCtx.createLinearGradient(0, waveBotY, 0, H);
    grad.addColorStop(0,   `hsla(${hue},${sat}%,68%,${fa})`);
    grad.addColorStop(0.5, `hsla(${hue},${sat}%,60%,${fa * 0.4})`);
    grad.addColorStop(1,   `hsla(${hue},${sat}%,55%,0.0)`);
    canvasCtx.fillStyle = grad;
    canvasCtx.fill();

    // glowing wave edge line
    canvasCtx.beginPath();
    px = 0; py = getY(0);
    canvasCtx.moveTo(0, py);
    for (let x = 4; x <= W; x += 4) {
      const y = getY(x);
      canvasCtx.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2);
      px = x; py = y;
    }
    canvasCtx.strokeStyle = `hsla(${hue},${sat}%,85%,${fa * 1.5})`;
    canvasCtx.lineWidth = 1.5;
    canvasCtx.stroke();
  });
}

function drawFrame() {
  animFrameId = requestAnimationFrame(drawFrame);
  canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

  const color     = getModeColor();
  const isPlaying = musicEnabled && isRunning && analyser && currentAudio && !currentAudio.paused;

  if (isPlaying) {
    const freq = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(freq);
    const bins  = freq.length;
    const bass  = freq.slice(0, bins >> 3).reduce((s, v) => s + v, 0) / ((bins >> 3) * 255);
    const total = freq.reduce((s, v) => s + v, 0) / (bins * 255);
    smoothEnergy = smoothEnergy * 0.75 + (bass * 0.65 + total * 0.35) * 0.25;
    dancePhase  += 0.018 + smoothEnergy * 0.06;
  } else {
    smoothEnergy *= 0.93;
    dancePhase   += 0.006;
  }

  if      (currentVisual === 'stars')  drawStarfield(smoothEnergy, color);
  else if (currentVisual === 'ripple') drawRipples(smoothEnergy, color);
  else if (currentVisual === 'smoke')  drawSmoke(smoothEnergy, color);
  else if (currentVisual === 'deep')   drawDeepSea(smoothEnergy, dancePhase);
  else                                 drawAurora(smoothEnergy, dancePhase);
}

// ── Music ──────────────────────────────────────────────────────────────────
function startMusic(mode) {
  stopMusic();
  if (!musicEnabled || !musicConfig) return;
  const type = mode === 'work' ? 'work' : 'break';
  const files = musicConfig[selectedGenre]?.[type];
  if (!files || files.length === 0) return;

  const ctx = getAudioCtx();

  function playNext() {
    currentAudio = new Audio(pickRandom(files));
    currentAudio.crossOrigin = 'anonymous';
    currentAudio.volume = 0.5;
    try {
      const source = ctx.createMediaElementSource(currentAudio);
      source.connect(analyser);
    } catch (e) {}
    currentAudio.addEventListener('ended', playNext);
    currentAudio.play().catch(() => {});
  }
  playNext();
}

function stopMusic() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
}

// ── Beep ───────────────────────────────────────────────────────────────────
function playBeep() {
  try {
    const ctx = getAudioCtx();
    [0, 0.3, 0.6].forEach(offset => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(analyser);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.3, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.25);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.25);
    });
  } catch (e) {}
}

// ── Timer ──────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => switchMode(tab.dataset.mode));
});

startPauseBtn.addEventListener('click', toggleStartPause);
resetBtn.addEventListener('click', resetTimer);
musicBtn.addEventListener('click', toggleMusic);

document.getElementById('genreSelect').addEventListener('change', e => {
  selectGenre(e.target.value);
});

document.querySelectorAll('.btn-visual').forEach(btn => {
  btn.addEventListener('click', () => {
    currentVisual = btn.dataset.visual;
    document.querySelectorAll('.btn-visual').forEach(b => b.classList.toggle('active', b === btn));
  });
});

function switchMode(mode) {
  if (isRunning) stopTimer();
  currentMode = mode;
  secondsLeft = MODES[mode].seconds;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
  document.body.className = mode === 'work' ? '' : mode;
  renderTime();
  startPauseBtn.textContent = 'スタート';
}

function toggleStartPause() {
  if (isRunning) {
    stopTimer();
    startPauseBtn.textContent = 'スタート';
  } else {
    startTimer();
    startPauseBtn.textContent = 'ポーズ';
  }
}

function startTimer() {
  isRunning = true;
  intervalId = setInterval(timerTick, 1000);
  startMusic(currentMode);
  requestWakeLock();
}

function stopTimer() {
  isRunning = false;
  clearInterval(intervalId);
  intervalId = null;
  stopMusic();
  releaseWakeLock();
}

function resetTimer() {
  stopTimer();
  secondsLeft = MODES[currentMode].seconds;
  startPauseBtn.textContent = 'スタート';
  renderTime();
}

function timerTick() {
  secondsLeft--;
  renderTime();
  if (secondsLeft <= 0) {
    stopTimer();
    handleTimerEnd();
  }
}

function handleTimerEnd() {
  playBeep();

  if (currentMode === 'work') {
    completedPomodoros++;
    countEl.textContent = completedPomodoros;
    renderDots();

    const nextMode = completedPomodoros % POMODOROS_BEFORE_LONG_BREAK === 0
      ? 'longBreak'
      : 'shortBreak';

    setTimeout(() => {
      switchMode(nextMode);
      startTimer();
      startPauseBtn.textContent = 'ポーズ';
    }, 1000);
  } else {
    setTimeout(() => {
      switchMode('work');
    }, 1000);
  }
}

// ── Music toggle & genre ───────────────────────────────────────────────────
function toggleMusic() {
  musicEnabled = !musicEnabled;
  musicBtn.textContent = musicEnabled ? '♪ 音楽をオフ' : '♪ 音楽をオン';
  musicBtn.classList.toggle('active', musicEnabled);
  genreSelector.classList.toggle('visible', musicEnabled);

  if (musicEnabled && isRunning) {
    startMusic(currentMode);
  } else {
    stopMusic();
  }
}

function selectGenre(genre) {
  selectedGenre = genre;
  if (musicEnabled && isRunning) {
    startMusic(currentMode);
  }
}

// ── Render ─────────────────────────────────────────────────────────────────
function renderTime() {
  const m = Math.floor(secondsLeft / 60).toString().padStart(2, '0');
  const s = (secondsLeft % 60).toString().padStart(2, '0');
  timeEl.textContent = `${m}:${s}`;
  document.title = `${m}:${s} — ポモドーロタイマー`;
}

function renderDots() {
  dotsEl.innerHTML = '';
  const filled = completedPomodoros % POMODOROS_BEFORE_LONG_BREAK || POMODOROS_BEFORE_LONG_BREAK;
  for (let i = 0; i < POMODOROS_BEFORE_LONG_BREAK; i++) {
    const dot = document.createElement('div');
    dot.className = 'dot' + (i < filled && completedPomodoros > 0 ? '' : ' empty');
    dotsEl.appendChild(dot);
  }
}

// Initialize
renderTime();
renderDots();
resizeCanvas();
drawFrame();

// PWA Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js');
}

// ── Wake Lock (省電力モード防止) ───────────────────────────────────────────
let wakeLock = null;

async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
  } catch (e) {}
}

async function releaseWakeLock() {
  if (!wakeLock) return;
  try { await wakeLock.release(); } catch (e) {}
  wakeLock = null;
}

document.addEventListener('visibilitychange', () => {
  if (isRunning && document.visibilityState === 'visible') requestWakeLock();
});
