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
let idlePhase = 0;

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

// ── Visualizer (棒人間) ────────────────────────────────────────────────────
function resizeCanvas() {
  canvas.width  = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
}
window.addEventListener('resize', resizeCanvas);

function getModeColor() {
  if (currentMode === 'shortBreak') return '90,154,106';
  if (currentMode === 'longBreak')  return '74,122,191';
  return '212,208,203';
}

let dancePhase   = 0;
let smoothEnergy = 0;
const floatingNotes = [];

function spawnNote(x, y) {
  floatingNotes.push({
    x, y,
    vx: (Math.random() - 0.5) * 1.8,
    vy: -(Math.random() * 1.5 + 0.6),
    alpha: 0.85,
    char: Math.random() > 0.5 ? '♪' : '♫',
    size: 10 + Math.random() * 5,
  });
}

function drawStickFigure(energy, phase, color) {
  const W = canvas.width, H = canvas.height;
  const s  = Math.min(W * 0.11, H * 0.35);
  const cx = W / 2;
  const cy = H * 0.44;

  const bounce   = Math.abs(Math.sin(phase * 2)) * energy * s * 0.20;
  const lean     = Math.sin(phase * 0.8) * energy * s * 0.08;
  const armSwing = Math.sin(phase * 1.5) * (0.3 + energy * 1.4);
  const legKick  = Math.sin(phase * 2.0) * (0.15 + energy * 0.80);

  const alpha = 0.45 + energy * 0.45;
  const lw    = Math.max(1.5, s * 0.09);

  canvasCtx.save();
  canvasCtx.strokeStyle = `rgba(${color},${alpha})`;
  canvasCtx.lineWidth   = lw;
  canvasCtx.lineCap     = 'round';
  canvasCtx.lineJoin    = 'round';
  canvasCtx.translate(cx + lean, cy);

  const headR    = s * 0.23;
  const neckY    = -s * 0.18 - bounce;
  const hipY     = s * 0.52;
  const headY    = neckY - headR * 1.2;
  const shoulderY = neckY + (hipY - neckY) * 0.10;
  const armLen   = s * 0.60;
  const legLen   = s * 0.70;

  // 頭
  canvasCtx.beginPath();
  canvasCtx.arc(0, headY, headR, 0, Math.PI * 2);
  canvasCtx.stroke();

  // 胴体
  canvasCtx.beginPath();
  canvasCtx.moveTo(0, neckY);
  canvasCtx.lineTo(0, hipY);
  canvasCtx.stroke();

  // 左腕
  const la = Math.PI - Math.PI * 0.28 + armSwing;
  canvasCtx.beginPath();
  canvasCtx.moveTo(0, shoulderY);
  canvasCtx.lineTo(Math.cos(la) * armLen, shoulderY + Math.sin(la) * armLen);
  canvasCtx.stroke();

  // 右腕（逆位相）
  const ra = Math.PI * 0.28 - armSwing;
  canvasCtx.beginPath();
  canvasCtx.moveTo(0, shoulderY);
  canvasCtx.lineTo(Math.cos(ra) * armLen, shoulderY + Math.sin(ra) * armLen);
  canvasCtx.stroke();

  // 左足
  const ll = Math.PI * 0.5 + Math.PI * 0.22 + legKick;
  canvasCtx.beginPath();
  canvasCtx.moveTo(0, hipY);
  canvasCtx.lineTo(Math.cos(ll) * legLen, hipY + Math.sin(ll) * legLen);
  canvasCtx.stroke();

  // 右足（逆位相）
  const rl = Math.PI * 0.5 - Math.PI * 0.22 - legKick;
  canvasCtx.beginPath();
  canvasCtx.moveTo(0, hipY);
  canvasCtx.lineTo(Math.cos(rl) * legLen, hipY + Math.sin(rl) * legLen);
  canvasCtx.stroke();

  canvasCtx.restore();
}

function drawNotes(color) {
  for (let i = floatingNotes.length - 1; i >= 0; i--) {
    const n = floatingNotes[i];
    n.x += n.vx; n.y += n.vy; n.alpha *= 0.965;
    if (n.alpha < 0.05) { floatingNotes.splice(i, 1); continue; }
    canvasCtx.save();
    canvasCtx.globalAlpha = n.alpha;
    canvasCtx.fillStyle   = `rgba(${color},1)`;
    canvasCtx.font        = `${n.size}px sans-serif`;
    canvasCtx.fillText(n.char, n.x, n.y);
    canvasCtx.restore();
  }
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
    dancePhase  += 0.06 + smoothEnergy * 0.20;

    if (smoothEnergy > 0.12 && Math.random() < smoothEnergy * 0.10) {
      spawnNote(canvas.width / 2 + (Math.random() - 0.5) * 55, canvas.height * 0.18);
    }
  } else {
    smoothEnergy *= 0.93;
    dancePhase   += 0.018;
  }

  drawStickFigure(smoothEnergy, dancePhase, color);
  drawNotes(color);
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
}

function stopTimer() {
  isRunning = false;
  clearInterval(intervalId);
  intervalId = null;
  stopMusic();
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
