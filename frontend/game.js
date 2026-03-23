/* ════════════════════════════════════════════════════════════════
   game.js — Crestdle
   Game logic. Sections:
     1.  Configuration
     2.  State
     3.  Initialisation — fetch teams from API
     4.  Round logic
     5.  Guess handling
     6.  UI rendering
     7.  Autocomplete
     8.  Utilities
     9.  Boot
   ════════════════════════════════════════════════════════════════ */


/* ════════════════════════════════════════════════════════════════
   0. UTILITIES — defined first because they're used everywhere
   ════════════════════════════════════════════════════════════════ */

const $ = id => document.getElementById(id);

const normalize = str =>
  str.toLowerCase()
     .normalize('NFD')
     .replace(/[\u0300-\u036f]/g, '');

const escHtml = str =>
  str.replace(/&/g,'&amp;')
     .replace(/</g,'&lt;')
     .replace(/>/g,'&gt;')
     .replace(/"/g,'&quot;');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function triggerShake(el) {
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
  setTimeout(() => el.classList.remove('shake'), 400);
}

function triggerPipPop(el) {
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
}


/* ════════════════════════════════════════════════════════════════
   1. CONFIGURATION
   ════════════════════════════════════════════════════════════════ */

const CONFIG = {
  /**
   * Backend base URL.
   * In development this points to your local Flask server.
   * Before deploying to Netlify, change this to your Render URL:
   *   e.g. 'https://crestle.onrender.com'
   */
  API_BASE: 'https://crestle-7r0f.onrender.com',

  MAX_ATTEMPTS: 6,

  /**
   * Blur levels in px, indexed by number of wrong attempts.
   * Index 0 = no wrong guesses yet (maximum blur).
   * Index 5 = last attempt (almost clear).
   * Set to 0 when the round ends.
   */
  BLUR_LEVELS: [24, 18, 12, 7, 2, 0],
};

/**
 * Hints revealed after each wrong guess.
 * Each entry is a function that receives the current team
 * and returns { icon, key, value }.
 * Order determines when each hint appears (wrong guess 1 → index 0, etc.)
 */
const HINT_DEFS = [
  t => ({ icon: '🌍', key: 'Country',  value: t.country }),
  t => ({ icon: '🏆', key: 'League',   value: t.league  }),
  t => ({
    icon:    '🎨',
    key:     'Colours',
    type:    'swatches',  // special rendering — see appendHint()
    colours: [t.colour1, t.colour2].filter(c => c && c !== ''),
  }),
  t => ({ icon: '🏟', key: 'Stadium',  value: t.stadium || '—' }),
  t => ({ icon: '📍', key: 'City',     value: t.city    || '—' }),
];

/**
 * Converts a hex colour code to an approximate human-readable name.
 * Uses HSL conversion to classify by hue, saturation and lightness.
 *
 * Not exhaustive — covers the main football kit colours well enough.
 *
 * @param {string} hex - e.g. '#EF0107'
 * @returns {string} colour name e.g. 'Red'
 */
function hexToColorName(hex) {
  if (!hex || hex === '') return '—';

  // Strip # and parse RGB components
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return hex;

  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;

  // Convert RGB to HSL
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l   = (max + min) / 2;
  const d   = max - min;
  const s   = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));

  // Achromatic colours
  if (s < 0.12) {
    if (l < 0.15) return 'Black';
    if (l > 0.85) return 'White';
    return 'Grey';
  }

  // Hue in degrees
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;

  // Map hue ranges to colour names
  if (h < 20  || h >= 345) return 'Red';
  if (h < 40)               return 'Orange';
  if (h < 65)               return 'Yellow';
  if (h < 150)              return 'Green';
  if (h < 195)              return 'Cyan';
  if (h < 255)              return 'Blue';
  if (h < 285)              return 'Indigo';
  if (h < 320)              return 'Purple';
  if (h < 345)              return 'Pink';
  return 'Red';
}


/* ════════════════════════════════════════════════════════════════
   2. STATE
   Single mutable object. All game state lives here.
   ════════════════════════════════════════════════════════════════ */

const state = {
  teams:      [],     // full team list from API
  current:    null,   // team being guessed this round
  wrongCount: 0,      // wrong guesses so far this round
  guesses:    [],     // names guessed this round
  gameOver:   false,
  won:        false,
  usedIds:    [],     // api_ids already used — avoids repeats
  acIndex:    -1,     // focused item in autocomplete dropdown

  stats: {
    wins:   0,
    streak: 0,
    total:  0,
  },
};


/* ════════════════════════════════════════════════════════════════
   2.5 STATS PERSISTENCE
   localStorage saves stats between sessions.
   All data stays in the user's browser — nothing is sent to the server.
   ════════════════════════════════════════════════════════════════ */

/**
 * Loads saved stats from localStorage into state.stats.
 * Called once at startup. If no saved data exists, stats stay at 0.
 * Uses try/catch because localStorage can be blocked in some
 * privacy-focused browsers or in private browsing mode.
 */
function loadStats() {
  try {
    const saved = localStorage.getItem(CONFIG.STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Only load valid numeric values — guards against corrupted data
      state.stats.wins   = Number(parsed.wins)   || 0;
      state.stats.streak = Number(parsed.streak) || 0;
      state.stats.total  = Number(parsed.total)  || 0;
    }
  } catch (err) {
    console.warn('[Crestdle] Could not load stats from localStorage:', err);
  }
}

/**
 * Saves current stats to localStorage.
 * Called every time stats change (after each round ends).
 */
function saveStats() {
  try {
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(state.stats));
  } catch (err) {
    console.warn('[Crestdle] Could not save stats to localStorage:', err);
  }
}


/* ════════════════════════════════════════════════════════════════
   3. INITIALISATION
   ════════════════════════════════════════════════════════════════ */

/**
 * Entry point. Fetches all teams from the backend, then starts
 * the first round. Shows a loading screen while fetching.
 *
 * The loading bar is purely cosmetic — it animates while the
 * fetch is in progress to give visual feedback.
 */
async function init() {
  setLoadingProgress(20, 'Loading teams...');

  try {
    const response = await fetch(`${CONFIG.API_BASE}/api/teams`);

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }

    state.teams = await response.json();

    setLoadingProgress(100, 'Ready!');

    // Brief pause so the user sees "Ready!" before the game appears
    await sleep(400);

    hideLoadingScreen();
    loadStats();    // restore saved stats before rendering
    startRound();
    renderStats();

  } catch (err) {
    console.error('[Crestdle] Failed to load teams:', err);
    setLoadingProgress(100, 'Connection error — is the server running?');
  }
}

function setLoadingProgress(pct, text) {
  $('loadingFill').style.width = `${pct}%`;
  $('loadingText').textContent = text;
}

function hideLoadingScreen() {
  const screen = $('loadingScreen');
  screen.style.opacity = '0';
  screen.style.transition = 'opacity 0.4s ease';
  setTimeout(() => screen.remove(), 400);
  $('app').classList.remove('hidden');
}


/* ════════════════════════════════════════════════════════════════
   4. ROUND LOGIC
   ════════════════════════════════════════════════════════════════ */

/**
 * Picks a random team not yet used this session,
 * resets all round state, and refreshes the UI.
 */
function startRound() {
  // Reset used list when all teams have been played
  if (state.usedIds.length >= state.teams.length) {
    state.usedIds = [];
  }

  const pool = state.teams.filter(t => !state.usedIds.includes(t.api_id));
  state.current = pool[Math.floor(Math.random() * pool.length)];
  state.usedIds.push(state.current.api_id);

  state.wrongCount = 0;
  state.guesses    = [];
  state.gameOver   = false;
  state.won        = false;
  state.acIndex    = -1;

  // Load crest image
  loadCrest(state.current);

  // Clear UI from previous round
  $('hintsList').innerHTML    = '';
  $('guessesList').innerHTML  = '';
  $('resultBanner').classList.remove('visible');
  $('inputArea').style.display = 'block';
  $('guessInput').value        = '';
  $('guessBtn').disabled       = false;
  $('autocompleteList').classList.remove('open');
  // Re-enable skip button for the new round
  const skipBtn = $('skipBtn');
  if (skipBtn) skipBtn.disabled = false;

  renderPips();
  renderAttemptLabel();

  // Auto-focus the input so the user can start typing immediately
  $('guessInput').focus();
}

/**
 * Loads the crest image for the current team.
 * The image starts blurred (via CSS filter) and gradually
 * sharpens with each wrong guess.
 *
 * The crest URL points to our own backend (/crests/filename),
 * which serves the pre-downloaded PNG files — no external API
 * calls, no CORS issues, no authentication needed.
 */
function loadCrest(team) {
  const imgEl = $('crestImg');
  const phEl  = $('crestPlaceholder');

  imgEl.classList.remove('loaded');
  phEl.style.display = 'flex';

  // Apply initial blur before the image is revealed
  imgEl.style.filter = `blur(${CONFIG.BLUR_LEVELS[0]}px)`;

  if (!team.crest_file) {
    return; // no crest available, placeholder stays visible
  }

  imgEl.onload = () => {
    imgEl.classList.add('loaded');
    phEl.style.display = 'none';
  };

  imgEl.onerror = () => {
    // File missing or server error — keep placeholder
    console.warn(`[Crestdle] Could not load crest: ${team.crest_file}`);
  };

  imgEl.src = `${CONFIG.API_BASE}/crests/${team.crest_file}`;
}

/** Called by the "Next Crest" button. */
function nextRound() {
  startRound();
}

/**
 * Skip the current attempt — counts as a wrong guess.
 * Reveals the next hint, reduces blur, and advances the attempt counter.
 * If no attempts remain, ends the round as a loss.
 *
 * A skipped attempt is recorded as an empty string in state.guesses
 * so the history stays consistent.
 */
function skipGuess() {
  if (state.gameOver) return;

  state.guesses.push('');  // empty string marks a skip
  state.wrongCount++;

  // Add a visual row showing the skip
  const el = document.createElement('div');
  el.className = 'guess-row skip';
  el.innerHTML = '<span class="guess-x">—</span><span>Skipped</span>';
  $('guessesList').appendChild(el);

  // Reduce blur
  const blurIdx = Math.min(state.wrongCount, CONFIG.BLUR_LEVELS.length - 1);
  $('crestImg').style.filter = `blur(${CONFIG.BLUR_LEVELS[blurIdx]}px)`;

  // Reveal next hint
  appendHint(state.wrongCount - 1);
  renderPips(false);

  if (state.wrongCount >= CONFIG.MAX_ATTEMPTS) {
    state.gameOver     = true;
    state.stats.streak = 0;
    state.stats.total++;
    $('crestImg').style.filter = 'blur(0px)';
    showResult(false);
  } else {
    $('guessInput').focus();
  }

  renderAttemptLabel();
  renderStats();
}


/* ════════════════════════════════════════════════════════════════
   5. GUESS HANDLING
   ════════════════════════════════════════════════════════════════ */

/**
 * Processes a guess submitted via the input field.
 * Validates the name, checks against the current team,
 * and updates state + UI accordingly.
 */
function submitGuess() {
  if (state.gameOver) return;

  const input = $('guessInput');
  const raw   = input.value.trim();
  if (!raw) return;

  // Find the team in our local list (normalised comparison)
  const match = state.teams.find(t => normalize(t.name) === normalize(raw));

  if (!match) {
    // Unknown team name — shake the input
    triggerShake(input);
    return;
  }

  input.value = '';
  $('autocompleteList').classList.remove('open');
  state.guesses.push(match.name);

  if (normalize(match.name) === normalize(state.current.name)) {
    // ── CORRECT ──────────────────────────────────────────────
    state.won      = true;
    state.gameOver = true;
    state.stats.wins++;
    state.stats.streak++;
    state.stats.total++;
    saveStats();

    $('crestImg').style.filter = 'blur(0px)';
    renderPips(true);
    showResult(true);

  } else {
    // ── WRONG ────────────────────────────────────────────────
    appendGuessRow(match.name);
    state.wrongCount++;

    const blurIdx = Math.min(state.wrongCount, CONFIG.BLUR_LEVELS.length - 1);
    $('crestImg').style.filter = `blur(${CONFIG.BLUR_LEVELS[blurIdx]}px)`;

    appendHint(state.wrongCount - 1);
    renderPips(false);

    if (state.wrongCount >= CONFIG.MAX_ATTEMPTS) {
      state.gameOver     = true;
      state.stats.streak = 0;
      state.stats.total++;
      saveStats();
      $('crestImg').style.filter = 'blur(0px)';
      showResult(false);
    } else {
      // Re-focus input after a wrong guess so the user can keep typing
      $('guessInput').focus();
    }
  }

  renderAttemptLabel();
  renderStats();
}


/* ════════════════════════════════════════════════════════════════
   6. UI RENDERING
   ════════════════════════════════════════════════════════════════ */

/** Adds a wrong guess row to the guesses list. */
function appendGuessRow(name) {
  const el = document.createElement('div');
  el.className = 'guess-row';
  el.innerHTML = `<span class="guess-x">✕</span><span>${escHtml(name)}</span>`;
  $('guessesList').appendChild(el);
}

/**
 * Reveals the next hint after a wrong guess.
 * @param {number} idx - 0-based index into HINT_DEFS
 */
function appendHint(idx) {
  if (idx >= HINT_DEFS.length) return;

  const h  = HINT_DEFS[idx](state.current);
  const el = document.createElement('div');
  el.className = 'hint-row';

  // Colour swatches — render coloured circles instead of text
  const valueHtml = h.type === 'swatches'
    ? h.colours.map(hex => `
        <span class="colour-swatch" style="background:${escHtml(hex)}" title="${escHtml(hex)}"></span>
      `).join('')
    : `<span class="hint-val">${escHtml(h.value)}</span>`;

  el.innerHTML = `
    <span class="hint-icon">${h.icon}</span>
    <span class="hint-key">${h.key}</span>
    <div class="hint-sep"></div>
    <span class="hint-swatches">${valueHtml}</span>
  `;
  $('hintsList').appendChild(el);
}

/**
 * Updates pip colours to reflect current attempt state.
 * @param {boolean} [lastCorrect] - true if the latest guess was correct
 */
function renderPips(lastCorrect = false) {
  for (let i = 0; i < CONFIG.MAX_ATTEMPTS; i++) {
    const pip = $(`pip-${i}`);
    pip.className = 'pip';
    if (i < state.wrongCount) pip.classList.add('wrong');
  }

  if (lastCorrect && state.won) {
    const pip = $(`pip-${state.wrongCount}`);
    if (pip) { pip.classList.add('correct'); triggerPipPop(pip); }
  } else if (!state.won && state.wrongCount > 0) {
    const pip = $(`pip-${state.wrongCount - 1}`);
    if (pip) triggerPipPop(pip);
  }
}

/** Updates the "X attempts remaining" label. */
function renderAttemptLabel() {
  if (state.gameOver) { $('attemptLabel').textContent = ''; return; }
  const left = CONFIG.MAX_ATTEMPTS - state.wrongCount;
  $('attemptLabel').textContent = left === 1
    ? '1 attempt remaining'
    : `${left} attempts remaining`;
}

/**
 * Shows the result banner at the end of a round.
 * @param {boolean} won
 */
function showResult(won) {
  $('inputArea').style.display = 'none';
  $('guessBtn').disabled = true;
  // Null check in case the element isn't in the DOM yet
  const skipBtn = $('skipBtn');
  if (skipBtn) skipBtn.disabled = true;

  const attemptsTaken = state.wrongCount + (won ? 1 : 0);
  const metaText = won
    ? (state.wrongCount === 0 ? 'First attempt!' : `Attempt ${attemptsTaken}`)
    : 'The crest belonged to...';

  $('resultVerdict').textContent = won ? 'CORRECT!' : 'GAME OVER';
  $('resultVerdict').className   = `result-verdict ${won ? 'win' : 'lose'}`;
  $('resultMeta').textContent    = metaText;
  $('resultTeam').textContent    = state.current.name;

  $('resultBanner').classList.add('visible');
}

/** Syncs the stats panel with current state. */
function renderStats() {
  $('statWins').textContent   = state.stats.wins;
  $('statStreak').textContent = state.stats.streak;
  $('statTotal').textContent  = state.stats.total;
}


/* ════════════════════════════════════════════════════════════════
   7. AUTOCOMPLETE
   ════════════════════════════════════════════════════════════════ */

const guessInput = $('guessInput');
const acList     = $('autocompleteList');

/** Filters the team list and renders the dropdown. */
guessInput.addEventListener('input', () => {
  const val = normalize(guessInput.value);
  if (!val) { acList.classList.remove('open'); return; }

  const matches = state.teams
    .filter(t => normalize(t.name).includes(val))
    .slice(0, 8);

  if (!matches.length) { acList.classList.remove('open'); return; }

  acList.innerHTML = matches.map(t => `
    <div class="autocomplete-item" data-name="${escHtml(t.name)}" onclick="selectSuggestion(this)">
      <span>${escHtml(t.name)}</span>
      <span class="ac-league">${escHtml(t.league)}</span>
    </div>
  `).join('');

  acList.classList.add('open');
  state.acIndex = -1;
});

/** Keyboard navigation for the autocomplete dropdown. */
guessInput.addEventListener('keydown', e => {
  const items = acList.querySelectorAll('.autocomplete-item');

  switch (e.key) {
    case 'ArrowDown':
      state.acIndex = Math.min(state.acIndex + 1, items.length - 1);
      highlightAC(items);
      e.preventDefault();
      break;

    case 'ArrowUp':
      state.acIndex = Math.max(state.acIndex - 1, -1);
      highlightAC(items);
      e.preventDefault();
      break;

    case 'Enter':
      // If input is empty, do nothing — prevents submitting a stale value
      if (!guessInput.value.trim()) break;
      if (state.acIndex >= 0 && items[state.acIndex]) {
        // Select the focused item
        guessInput.value = items[state.acIndex].dataset.name;
        acList.classList.remove('open');
      } else if (items.length === 1) {
        // Auto-select when there's only one suggestion
        guessInput.value = items[0].dataset.name;
        acList.classList.remove('open');
      }
      submitGuess();
      break;

    case 'Escape':
      acList.classList.remove('open');
      break;
  }
});

function selectSuggestion(el) {
  guessInput.value = el.dataset.name;
  acList.classList.remove('open');
  guessInput.focus();
}

function highlightAC(items) {
  items.forEach((el, i) => el.classList.toggle('focused', i === state.acIndex));
}

// Close dropdown when clicking outside
document.addEventListener('click', e => {
  if (!e.target.closest('.input-wrap')) {
    acList.classList.remove('open');
  }
});


/* ════════════════════════════════════════════════════════════════
   8. UTILITIES — see section 0 at top of file
   ════════════════════════════════════════════════════════════════ */


/* ════════════════════════════════════════════════════════════════
   9. BOOT
   ════════════════════════════════════════════════════════════════ */

// ── Service Worker registration (PWA) ───────────────────────────
// The service worker enables "Add to Home Screen" on mobile and
// caches static assets for faster subsequent loads.
// It runs in the background and is separate from the page's JS.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(() => console.log('[Crestdle] Service worker registered'))
      .catch(err => console.warn('[Crestdle] Service worker failed:', err));
  });
}

// Space or Enter on the result banner advances to the next round
document.addEventListener('keydown', e => {
  if (!state.gameOver) return;
  if (e.key === ' ' || e.key === 'Enter') {
    // Only if the input is not focused (avoid conflict with typing)
    if (document.activeElement !== $('guessInput')) {
      e.preventDefault();
      nextRound();
    }
  }
});

init();