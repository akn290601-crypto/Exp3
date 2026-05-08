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

// ── Visualizer ─────────────────────────────────────────────────────────────
function resizeCanvas() {
  canvas.width  = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
}

window.addEventListener('resize', resizeCanvas);

function drawFrame() {
  animFrameId = requestAnimationFrame(drawFrame);
  const W = canvas.width;
  const H = canvas.height;
  canvasCtx.clearRect(0, 0, W, H);

  const isPlaying = musicEnabled && isRunning && analyser && currentAudio && !currentAudio.paused;

  if (isPlaying) {
    const data = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(data);

    canvasCtx.beginPath();
    canvasCtx.strokeStyle = '#d4d0cb';
    canvasCtx.lineWidth = 1.5;
    canvasCtx.lineJoin = 'round';

    const step = W / data.length;
    for (let i = 0; i < data.length; i++) {
      const y = (data[i] * 0.5 + 0.5) * H;
      i === 0 ? canvasCtx.moveTo(0, y) : canvasCtx.lineTo(i * step, y);
    }
    canvasCtx.stroke();
  } else {
    // 静止時：ゆるやかなサインウェーブ
    idlePhase += 0.012;
    canvasCtx.beginPath();
    canvasCtx.strokeStyle = '#272727';
    canvasCtx.lineWidth = 1;
    for (let x = 0; x <= W; x += 2) {
      const y = H / 2 + Math.sin(x * 0.018 + idlePhase) * 3;
      x === 0 ? canvasCtx.moveTo(x, y) : canvasCtx.lineTo(x, y);
    }
    canvasCtx.stroke();
  }
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
