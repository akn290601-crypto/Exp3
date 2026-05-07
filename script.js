const MODES = {
  work:       { label: '作業',   seconds: 25 * 60 },
  shortBreak: { label: '小休憩', seconds:  5 * 60 },
  longBreak:  { label: '長休憩', seconds: 15 * 60 },
};

const POMODOROS_BEFORE_LONG_BREAK = 4;

const MUSIC_FILES = {
  jazz:    { work: 'jazz-work.mp3',    break: 'jazz-break.mp3' },
  healing: { work: 'healing-work.mp3', break: 'healing-break.mp3' },
};

let currentMode = 'work';
let secondsLeft = MODES.work.seconds;
let isRunning = false;
let intervalId = null;
let completedPomodoros = 0;
let musicEnabled = false;
let selectedGenre = 'jazz';
let currentAudio = null;

const timeEl         = document.getElementById('time');
const startPauseBtn  = document.getElementById('startPauseBtn');
const resetBtn       = document.getElementById('resetBtn');
const countEl        = document.getElementById('count');
const dotsEl         = document.getElementById('dots');
const musicBtn       = document.getElementById('musicBtn');
const genreSelector  = document.getElementById('genreSelector');

// ── Music ──────────────────────────────────────────────────────────────────
function getMusicFile(genre, mode) {
  return MUSIC_FILES[genre][mode === 'work' ? 'work' : 'break'];
}

function startMusic(mode) {
  stopMusic();
  if (!musicEnabled) return;
  const file = getMusicFile(selectedGenre, mode);
  currentAudio = new Audio(file);
  currentAudio.loop = true;
  currentAudio.volume = 0.5;
  currentAudio.play().catch(() => {});
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
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.3, 0.6].forEach(offset => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
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

document.querySelectorAll('.btn-genre').forEach(btn => {
  btn.addEventListener('click', () => selectGenre(btn.dataset.genre));
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
  document.querySelectorAll('.btn-genre').forEach(b => {
    b.classList.toggle('active', b.dataset.genre === genre);
  });
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

// PWA Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js');
}
