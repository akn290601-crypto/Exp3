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

function getModeColor() {
  if (currentMode === 'shortBreak') return '90,154,106';
  if (currentMode === 'longBreak')  return '74,122,191';
  return '212,208,203';
}

function drawWaveLayer(points, color, fillAlpha, strokeAlpha, yShift) {
  const W = canvas.width, H = canvas.height;
  canvasCtx.beginPath();
  canvasCtx.moveTo(0, H);
  let px = 0, py = H;
  points.forEach((y, i) => {
    const x = (i / (points.length - 1)) * W;
    const cy = H - y * H * 0.9 + yShift;
    if (i === 0) { canvasCtx.lineTo(x, cy); }
    else { const mx = (px + x) / 2; canvasCtx.quadraticCurveTo(px, py, mx, (py + cy) / 2); }
    px = x; py = cy;
  });
  canvasCtx.lineTo(W, H);
  canvasCtx.closePath();
  const grad = canvasCtx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, `rgba(${color},${fillAlpha})`);
  grad.addColorStop(1, `rgba(${color},0.01)`);
  canvasCtx.fillStyle = grad;
  canvasCtx.fill();

  canvasCtx.beginPath();
  px = 0; py = H;
  points.forEach((y, i) => {
    const x = (i / (points.length - 1)) * W;
    const cy = H - y * H * 0.9 + yShift;
    if (i === 0) { canvasCtx.moveTo(x, cy); }
    else { const mx = (px + x) / 2; canvasCtx.quadraticCurveTo(px, py, mx, (py + cy) / 2); }
    px = x; py = cy;
  });
  canvasCtx.strokeStyle = `rgba(${color},${strokeAlpha})`;
  canvasCtx.lineWidth = 1.5;
  canvasCtx.stroke();
}

function sampleFreq(freqData, pts) {
  const binSize = Math.floor(freqData.length / pts);
  return Array.from({ length: pts }, (_, i) => {
    let s = 0;
    for (let j = 0; j < binSize; j++) s += freqData[i * binSize + j];
    return s / binSize / 255;
  });
}

function drawFrame() {
  animFrameId = requestAnimationFrame(drawFrame);
  canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
  const H = canvas.height;
  const color = getModeColor();
  const isPlaying = musicEnabled && isRunning && analyser && currentAudio && !currentAudio.paused;

  if (isPlaying) {
    const freqData = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(freqData);
    const pts = sampleFreq(freqData, 80);
    drawWaveLayer(pts, color, 0.10, 0.20, H * 0.08);
    drawWaveLayer(pts, color, 0.22, 0.50, H * 0.02);
  } else {
    idlePhase += 0.006;
    const W = canvas.width;
    [
      { base: 0.38, amp: 0.10, spd: 0.010, fill: 0.06, stroke: 0.12 },
      { base: 0.50, amp: 0.07, spd: 0.014, fill: 0.04, stroke: 0.08 },
    ].forEach(({ base, amp, spd, fill, stroke }, li) => {
      const pts = Array.from({ length: 80 }, (_, i) => {
        const x = (i / 79) * W;
        return base + Math.sin(x * spd + idlePhase + li * 1.5) * amp
          + Math.sin(x * spd * 1.8 - idlePhase * 0.7) * amp * 0.4;
      });
      drawWaveLayer(pts, color, fill, stroke, 0);
    });
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
