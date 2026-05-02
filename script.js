const MODES = {
  work:       { label: '作業',   seconds: 25 * 60 },
  shortBreak: { label: '小休憩', seconds:  5 * 60 },
  longBreak:  { label: '長休憩', seconds: 15 * 60 },
};

const POMODOROS_BEFORE_LONG_BREAK = 4;

let currentMode = 'work';
let secondsLeft = MODES.work.seconds;
let isRunning = false;
let intervalId = null;
let completedPomodoros = 0;
let musicEnabled = false;

const timeEl        = document.getElementById('time');
const startPauseBtn = document.getElementById('startPauseBtn');
const resetBtn      = document.getElementById('resetBtn');
const countEl       = document.getElementById('count');
const dotsEl        = document.getElementById('dots');
const musicBtn      = document.getElementById('musicBtn');

// ── Shared AudioContext ────────────────────────────────────────────────────
let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

// ── Music Module ───────────────────────────────────────────────────────────
const Music = (() => {
  let masterGain = null;
  let drones = [];
  let schedulerTimer = null;
  let nextNoteTime = 0;
  let noteIndex = 0;
  let playing = false;
  let activeMode = 'work';

  // Am pentatonic (A2–A3)
  const WORK_NOTES   = [110, 130.81, 146.83, 164.81, 196, 220];
  const WORK_PATTERN = [0, 2, 4, 3, 1, 4, 2, 5, 0, 3];

  // C major pentatonic (C4–C5)
  const BREAK_NOTES   = [261.63, 293.66, 329.63, 392, 440, 523.25];
  const BREAK_PATTERN = [0, 1, 2, 3, 4, 3, 2, 1];

  function buildDrones(mode) {
    const c = getAudioCtx();
    const cfgs = mode === 'work'
      ? [{f: 55, v: 0.06}, {f: 55.4, v: 0.04}, {f: 110, v: 0.03}]
      : [{f: 261.63, v: 0.04}, {f: 392, v: 0.03}, {f: 523.25, v: 0.02}];

    cfgs.forEach(({f, v}) => {
      const osc  = c.createOscillator();
      const gain = c.createGain();
      const filt = c.createBiquadFilter();
      osc.type = 'sine';
      osc.frequency.value = f;
      filt.type = 'lowpass';
      filt.frequency.value = mode === 'work' ? 220 : 600;
      gain.gain.value = v;
      osc.connect(filt);
      filt.connect(gain);
      gain.connect(masterGain);
      osc.start();
      drones.push(osc);
    });
  }

  function scheduleNote(time) {
    const c = getAudioCtx();
    const isWork = activeMode === 'work';
    const notes   = isWork ? WORK_NOTES   : BREAK_NOTES;
    const pattern = isWork ? WORK_PATTERN : BREAK_PATTERN;
    const freq = notes[pattern[noteIndex % pattern.length]];
    const dur  = isWork ? 1.4 : 0.65;
    noteIndex++;

    const osc  = c.createOscillator();
    const gain = c.createGain();
    osc.type = isWork ? 'triangle' : 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(isWork ? 0.12 : 0.18, time + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(time);
    osc.stop(time + dur);
  }

  function tick() {
    if (!playing) return;
    const c = getAudioCtx();
    const interval = activeMode === 'work' ? 1.1 : 0.65;
    while (nextNoteTime < c.currentTime + 0.3) {
      scheduleNote(nextNoteTime);
      nextNoteTime += interval;
    }
    schedulerTimer = setTimeout(tick, 50);
  }

  function start(mode) {
    stop();
    playing = true;
    activeMode = mode;
    noteIndex = 0;

    const c = getAudioCtx();
    masterGain = c.createGain();
    masterGain.gain.setValueAtTime(0.001, c.currentTime);
    masterGain.gain.linearRampToValueAtTime(0.7, c.currentTime + 1.5);
    masterGain.connect(c.destination);

    buildDrones(mode);
    nextNoteTime = c.currentTime + 0.3;
    tick();
  }

  function stop() {
    playing = false;
    if (schedulerTimer) { clearTimeout(schedulerTimer); schedulerTimer = null; }
    drones.forEach(o => { try { o.stop(); } catch (e) {} });
    drones = [];
    if (masterGain && audioCtx) {
      try {
        const t = audioCtx.currentTime;
        masterGain.gain.setValueAtTime(masterGain.gain.value, t);
        masterGain.gain.linearRampToValueAtTime(0.001, t + 0.4);
      } catch (e) {}
      masterGain = null;
    }
  }

  return { start, stop };
})();

// ── Beep (タイマー終了音) ──────────────────────────────────────────────────
function playBeep() {
  try {
    const c = getAudioCtx();
    [0, 0.3, 0.6].forEach(offset => {
      const osc  = c.createOscillator();
      const gain = c.createGain();
      osc.connect(gain);
      gain.connect(c.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.3, c.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + offset + 0.25);
      osc.start(c.currentTime + offset);
      osc.stop(c.currentTime + offset + 0.25);
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
  if (musicEnabled) Music.start(currentMode);
}

function stopTimer() {
  isRunning = false;
  clearInterval(intervalId);
  intervalId = null;
  Music.stop();
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

// ── Music toggle ───────────────────────────────────────────────────────────
function toggleMusic() {
  musicEnabled = !musicEnabled;
  musicBtn.textContent = musicEnabled ? '♪ 音楽をオフ' : '♪ 音楽をオン';
  musicBtn.classList.toggle('active', musicEnabled);

  if (musicEnabled && isRunning) {
    Music.start(currentMode);
  } else {
    Music.stop();
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
