// Game Config Dimensions
const CATEGORIES = ['waifu', 'neko', 'shinobu', 'megumin', 'dance', 'smug', 'pat', 'wave', 'smile', 'happy', 'wink', 'poke'];
const API_BASE = 'https://nekos.best/api/v2/';

let gridWidth = 4; // Default starting matrix dimension
let targetPairs = 8; // (4x4) / 2

let cards = [];
let flippedIds = [];
let locked = false;
let score = 0;
let matchedCount = 0;
let combo = 1;

// Clock variables initialized to 60 seconds (1 Min)
let timeLeft = 60;
let timerInterval = null;
const totalDuration = 60;

// Synth Audio Engine Core
const AudioEngine = {
  ctx: null,
  init() { if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)(); },
  play(type) {
    this.init();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);

    if (type === 'click') {
      osc.type = 'sine'; osc.frequency.setValueAtTime(400, t);
      osc.frequency.exponentialRampToValueAtTime(150, t + 0.08);
      gain.gain.setValueAtTime(0.15, t); gain.gain.linearRampToValueAtTime(0.01, t + 0.08);
      osc.start(t); osc.stop(t + 0.08);
    } else if (type === 'match') {
      osc.type = 'triangle'; osc.frequency.setValueAtTime(300, t);
      osc.frequency.setValueAtTime(450, t + 0.06);
      osc.frequency.setValueAtTime(600, t + 0.12);
      gain.gain.setValueAtTime(0.2, t); gain.gain.linearRampToValueAtTime(0.01, t + 0.3);
      osc.start(t); osc.stop(t + 0.3);
    } else if (type === 'wrong') {
      osc.type = 'sawtooth'; osc.frequency.setValueAtTime(120, t);
      osc.frequency.linearRampToValueAtTime(70, t + 0.25);
      gain.gain.setValueAtTime(0.2, t); gain.gain.linearRampToValueAtTime(0.01, t + 0.25);
      osc.start(t); osc.stop(t + 0.25);
    }
  }
};

function displayScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active-screen'));
  document.getElementById(name).classList.add('active-screen');
  
  // Only display grid dimensions configuration modifiers when viewing active game metrics
  const settingsMenu = document.getElementById('matrix-settings');
  if (name === 'game-screen' || name === 'loading-screen') {
    settingsMenu.style.display = 'flex';
  } else {
    settingsMenu.style.display = 'none';
  }
}

function adjustGridSize(size) {
  if (locked) return;
  gridWidth = size;
  targetPairs = (size * size) / 2;
  
  // Update active state for buttons
  document.getElementById('btn-4x4').classList.toggle('active', size === 4);
  document.getElementById('btn-6x6').classList.toggle('active', size === 6);
  document.getElementById('btn-8x8').classList.toggle('active', size === 8);
  
  initGame();
}

async function fetchUniqueDeck(count) {
  const activeCategory = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
  document.getElementById('load-status').textContent = `CACHING LINK METADATA: ${activeCategory.toUpperCase()}...`;
  document.getElementById('hud-category').textContent = `TAG: ${activeCategory.toUpperCase()}`;

  const pool = await Promise.all(
    Array.from({ length: count }, async (_, i) => {
      await new Promise(r => setTimeout(r, i * 35));
      const res = await fetch(`${API_BASE}${activeCategory}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      return { url: json.results[0].url };
    })
  );
  return pool;
}

function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function runClock() {
  clearInterval(timerInterval);
  document.getElementById('timer-wrapper').classList.remove('timer-critical');
  
  timerInterval = setInterval(() => {
    timeLeft--;
    document.getElementById('hud-timer').textContent = `${timeLeft}s`;
    
    const percent = Math.min(100, (timeLeft / totalDuration) * 100);
    document.getElementById('timer-fill').style.width = `${percent}%`;

    if (timeLeft <= 10) {
      document.getElementById('timer-wrapper').classList.add('timer-critical');
    }

    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      endStage(false);
    }
  }, 1000);
}

async function initGame() {
  clearInterval(timerInterval);
  displayScreen('loading-screen');
  flippedIds = []; locked = false; score = 0; matchedCount = 0; combo = 1; timeLeft = totalDuration;
  document.getElementById('hud-timer').textContent = `${timeLeft}s`;
  document.getElementById('timer-fill').style.width = '100%';

  try {
    const images = await fetchUniqueDeck(targetPairs);
    cards = shuffle([
      ...images.map((img, i) => ({ id: i * 2,     pairId: i, url: img.url, flipped: false, matched: false })),
      ...images.map((img, i) => ({ id: i * 2 + 1, pairId: i, url: img.url, flipped: false, matched: false }))
    ]);
    
    buildInterface();
    displayScreen('game-screen');
    runClock();
  } catch (err) {
    displayScreen('error-screen');
  }
}

function buildInterface() {
  updateDisplayData();
  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  
  grid.className = `grid grid-${gridWidth}x${gridWidth}`;
  
  cards.forEach(card => {
    const wrap = document.createElement('div');
    wrap.className = 'card-wrap';
    wrap.dataset.id = card.id;
    wrap.innerHTML = `
      <div class="card-inner">
        <div class="card-face card-back"><span class="card-star">✦</span></div>
        <div class="card-face card-front"><img src="${card.url}" loading="lazy" /></div>
      </div>
    `;
    wrap.addEventListener('click', () => triggerFlip(card.id));
    grid.appendChild(wrap);
  });
}

function triggerFlip(id) {
  if (locked) return;
  const item = cards.find(c => c.id === id);
  if (!item || item.flipped || item.matched) return;

  AudioEngine.play('click');
  item.flipped = true;
  document.querySelector(`.card-wrap[data-id="${id}"]`).classList.add('flipped');
  flippedIds.push(id);

  if (flippedIds.length < 2) return;

  locked = true;
  const [cardA, cardB] = flippedIds.map(fid => cards.find(c => c.id === fid));
  flippedIds = [];

  if (cardA.url === cardB.url) {
    cardA.matched = true; cardB.matched = true;
    
    const addedPoints = 100 * combo;
    score += addedPoints;
    matchedCount++;
    
    timeLeft += 5;

    setTimeout(() => {
      AudioEngine.play('match');
      [cardA.id, cardB.id].forEach(mid => {
        const el = document.querySelector(`.card-wrap[data-id="${mid}"]`);
        if (el) el.classList.add('matched');
      });
      
      spawnFloatingText(cardB.id, `+${addedPoints} x${combo}`, false);
      setTimeout(() => spawnFloatingText(cardA.id, `+5s TIME`, true), 150);
      
      combo++;
      updateDisplayData();
      locked = false;

      if (matchedCount === targetPairs) {
        clearInterval(timerInterval);
        setTimeout(() => endStage(true), 500);
      }
    }, 300);

  } else {
    setTimeout(() => {
      AudioEngine.play('wrong');
      [cardA.id, cardB.id].forEach(mid => {
        document.querySelector(`.card-wrap[data-id="${mid}"]`).classList.add('wrong');
      });

      setTimeout(() => {
        [cardA, cardB].forEach(c => {
          c.flipped = false;
          const el = document.querySelector(`.card-wrap[data-id="${c.id}"]`);
          if (el) el.classList.remove('flipped', 'wrong');
        });
        combo = 1; 
        updateDisplayData();
        locked = false;
      }, 500);
    }, 400);
  }
}

function spawnFloatingText(cardId, message, isTimePulse) {
  const cardEl = document.querySelector(`.card-wrap[data-id="${cardId}"]`);
  if (!cardEl) return;
  const rect = cardEl.getBoundingClientRect();
  
  const text = document.createElement('div');
  text.className = `combo-pop ${isTimePulse ? 'time-addition' : ''}`;
  text.textContent = message;
  text.style.left = `${rect.left + window.scrollX + (rect.width / 4)}px`;
  text.style.top = `${rect.top + window.scrollY}px`;
  
  document.body.appendChild(text);
  setTimeout(() => text.remove(), 800);
}

function updateDisplayData() {
  document.getElementById('hud-score').textContent = score;
  document.getElementById('hud-combo').textContent = `STREAK: X${combo}`;
  document.getElementById('progress-fill').style.width = `${(matchedCount / targetPairs) * 100}%`;
  document.getElementById('hud-timer').textContent = `${timeLeft}s`;
}

function endStage(victory) {
  if (victory) {
    const remainingTimeBonus = timeLeft * 15;
    const totalScore = score + remainingTimeBonus;
    document.getElementById('win-score').textContent = totalScore;
    displayScreen('win-screen');
  } else {
    document.getElementById('lose-score').textContent = score;
    displayScreen('lose-screen');
  }
}

initGame();
