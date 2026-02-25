// ── Supabase Client ──────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://vobwnrxglnxnsppelowe.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZvYnducnhnbG54bnNwcGVsb3dlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0OTg1MzQsImV4cCI6MjA4NzA3NDUzNH0._RGKCldlYIRPpJVff_mw5eQez9RT0tiArWmODgEUrEk';

// Initialize Supabase defensively — if CDN fails to load, the app runs in guest-only mode
// Note: variable named 'db' to avoid conflict with the global 'supabase' exposed by the CDN
let db = null;
try {
    if (window.supabase && window.supabase.createClient) {
        db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } else {
        console.warn('Supabase SDK not available. Running in guest-only mode.');
    }
} catch (e) {
    console.error('Supabase initialization failed:', e);
}

// ── Application State ────────────────────────────────────────────────────────
let state = {
    // Questions
    allQuestions: [],
    testQuestions: [],
    currentQuestionIndex: 0,
    userAnswers: {},
    markedQuestions: new Set(),
    startTime: null,
    endTime: null,
    timerInterval: null,
    timeRemaining: 60 * 60,
    isPaused: false,
    // Auth
    currentUser: null,
    isRecoveryMode: false,
    // Favorites
    favoritedQuestionIds: new Set(),
    // Smart question generation progress (loaded from DB on login)
    questionProgress: {
        3: { used: [], round: 1 },
        4: { used: [], round: 1 },
        5: { used: [], round: 1 }
    },
    // Cached exam history records (for history detail view)
    historyData: [],
    // Tracks the in-flight DB save after a test submit (so history can wait for it)
    pendingSave: null,
    // Stores the last calculated results for retry
    lastResults: null
};

// ── Initialize Application ───────────────────────────────────────────────────
async function init() {
    try {
        const response = await fetch('questions.json');
        const data = await response.json();
        state.allQuestions = data.questions;

        // Check for password recovery redirect (user clicked reset link in email).
        // Supabase appends #type=recovery&access_token=... to the redirect URL.
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        if (hashParams.get('type') === 'recovery') {
            state.isRecoveryMode = true;
            setupEventListeners();
            setupAuthListeners();
            showScreen('recovery-screen');
            return;
        }

        // Check for an existing Supabase session (user was previously logged in)
        if (db) {
            const { data: { session } } = await db.auth.getSession();
            if (session) {
                await handleUserLogin(session.user);
            }
        }

        setupEventListeners();
        setupAuthListeners();
        renderNav();
        showScreen('welcome-screen');

    } catch (error) {
        console.error('Error initializing app:', error);
        alert('Failed to load questions. Please refresh the page.');
    }
}

// ── Auth State Listener ──────────────────────────────────────────────────────
function setupAuthListeners() {
    if (!db) return;
    db.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && !state.isRecoveryMode) {
            await handleUserLogin(session.user);
            renderNav();
            closeAuthModal();
        } else if (event === 'SIGNED_OUT') {
            handleUserLogout();
            renderNav();
        }
    });
}

// ── User Login / Logout ──────────────────────────────────────────────────────
async function handleUserLogin(user) {
    state.currentUser = user;
    await Promise.all([loadFavorites(), loadQuestionProgress()]);
}

function handleUserLogout() {
    state.currentUser = null;
    state.favoritedQuestionIds = new Set();
    state.questionProgress = {
        3: { used: [], round: 1 },
        4: { used: [], round: 1 },
        5: { used: [], round: 1 }
    };
}

// ── Navigation Renderer ──────────────────────────────────────────────────────
function renderNav() {
    const navRight = document.getElementById('nav-right');
    if (!navRight) return;

    if (state.currentUser) {
        const displayName = state.currentUser.user_metadata?.display_name || state.currentUser.email;
        navRight.innerHTML = `
            <span class="nav-user-email">${displayName}</span>
            <button class="btn-nav" id="nav-history-btn">History</button>
            <button class="btn-nav" id="nav-favorites-btn">Favorites</button>
            <button class="btn-nav btn-nav-outline" id="nav-change-pw-btn">Change Password</button>
            <button class="btn-nav btn-nav-outline" id="nav-logout-btn">Log Out</button>
        `;
        document.getElementById('nav-history-btn').addEventListener('click', showHistoryScreen);
        document.getElementById('nav-favorites-btn').addEventListener('click', showFavoritesScreen);
        document.getElementById('nav-change-pw-btn').addEventListener('click', () => openAuthModal('change-pw'));
        document.getElementById('nav-logout-btn').addEventListener('click', logout);

        const guestNote = document.getElementById('guest-note');
        if (guestNote) guestNote.style.display = 'none';
    } else {
        navRight.innerHTML = `
            <button class="btn-nav" id="nav-login-btn">Log In</button>
            <button class="btn-nav btn-nav-primary" id="nav-register-btn">Sign Up</button>
        `;
        document.getElementById('nav-login-btn').addEventListener('click', () => openAuthModal('login'));
        document.getElementById('nav-register-btn').addEventListener('click', () => openAuthModal('register'));

        const guestNote = document.getElementById('guest-note');
        if (guestNote) guestNote.style.display = 'block';
    }
}

// ── Auth Modal ───────────────────────────────────────────────────────────────
function openAuthModal(panel) {
    document.getElementById('auth-modal').style.display = 'flex';
    ['login', 'register', 'forgot', 'change-pw'].forEach(p => {
        document.getElementById(`auth-panel-${p}`).style.display = 'none';
    });
    document.getElementById(`auth-panel-${panel}`).style.display = 'block';
    clearAuthMessages();
}

function closeAuthModal() {
    document.getElementById('auth-modal').style.display = 'none';
    clearAuthMessages();
}

function clearAuthMessages() {
    document.querySelectorAll('.auth-error, .auth-success').forEach(el => {
        el.style.display = 'none';
        el.textContent = '';
    });
}

function showAuthError(panelKey, message) {
    const el = document.getElementById(`auth-${panelKey}-error`);
    if (el) { el.textContent = message; el.style.display = 'block'; }
}

function showAuthSuccess(panelKey, message) {
    const el = document.getElementById(`auth-${panelKey}-success`);
    if (el) { el.textContent = message; el.style.display = 'block'; }
}

// ── Auth Actions ─────────────────────────────────────────────────────────────
async function login() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    if (!email || !password) {
        showAuthError('login', 'Please fill in all fields.');
        return;
    }

    const btn = document.getElementById('login-submit-btn');
    btn.disabled = true;
    btn.textContent = 'Logging in...';

    const { error } = await db.auth.signInWithPassword({ email, password });

    btn.disabled = false;
    btn.textContent = 'Log In';

    if (error) showAuthError('login', error.message);
    // Success handled by onAuthStateChange → SIGNED_IN
}

async function register() {
    const name = document.getElementById('register-name').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;
    const confirm = document.getElementById('register-confirm').value;

    if (!name) {
        showAuthError('register', 'Please enter a display name.');
        return;
    }
    if (!email || !password || !confirm) {
        showAuthError('register', 'Please fill in all fields.');
        return;
    }
    if (password.length < 6) {
        showAuthError('register', 'Password must be at least 6 characters.');
        return;
    }
    if (password !== confirm) {
        showAuthError('register', 'Passwords do not match.');
        return;
    }

    const btn = document.getElementById('register-submit-btn');
    btn.disabled = true;
    btn.textContent = 'Creating account...';

    const { error } = await db.auth.signUp({ email, password, options: { data: { display_name: name } } });

    btn.disabled = false;
    btn.textContent = 'Create Account';
    document.getElementById('register-name').value = '';

    if (error) showAuthError('register', error.message);
    // Success: onAuthStateChange fires SIGNED_IN immediately (email confirmation is OFF)
}

async function logout() {
    await db.auth.signOut();
    showScreen('welcome-screen');
}

async function sendPasswordReset() {
    const email = document.getElementById('forgot-email').value.trim();
    if (!email) {
        showAuthError('forgot', 'Please enter your email address.');
        return;
    }

    const btn = document.getElementById('forgot-submit-btn');
    btn.disabled = true;
    btn.textContent = 'Sending...';

    const { error } = await db.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname
    });

    btn.disabled = false;
    btn.textContent = 'Send Reset Link';

    if (error) {
        showAuthError('forgot', error.message);
    } else {
        showAuthSuccess('forgot', 'Reset link sent! Check your email (may take a few minutes).');
        document.getElementById('forgot-email').value = '';
    }
}

async function changePassword() {
    const newPw = document.getElementById('new-password').value;
    const confirm = document.getElementById('new-password-confirm').value;

    if (!newPw || !confirm) {
        showAuthError('change-pw', 'Please fill in all fields.');
        return;
    }
    if (newPw.length < 6) {
        showAuthError('change-pw', 'Password must be at least 6 characters.');
        return;
    }
    if (newPw !== confirm) {
        showAuthError('change-pw', 'Passwords do not match.');
        return;
    }

    const btn = document.getElementById('change-pw-submit-btn');
    btn.disabled = true;
    btn.textContent = 'Updating...';

    const { error } = await db.auth.updateUser({ password: newPw });

    btn.disabled = false;
    btn.textContent = 'Update Password';

    if (error) {
        showAuthError('change-pw', error.message);
    } else {
        showAuthSuccess('change-pw', 'Password updated successfully!');
        document.getElementById('new-password').value = '';
        document.getElementById('new-password-confirm').value = '';
    }
}

async function handleRecoverySubmit() {
    const newPw = document.getElementById('recovery-password').value;
    const confirm = document.getElementById('recovery-password-confirm').value;
    const errEl = document.getElementById('recovery-error');
    const sucEl = document.getElementById('recovery-success');

    errEl.style.display = 'none';

    if (newPw.length < 6) {
        errEl.textContent = 'Password must be at least 6 characters.';
        errEl.style.display = 'block';
        return;
    }
    if (newPw !== confirm) {
        errEl.textContent = 'Passwords do not match.';
        errEl.style.display = 'block';
        return;
    }

    const btn = document.getElementById('recovery-submit-btn');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    const { error } = await db.auth.updateUser({ password: newPw });

    btn.disabled = false;
    btn.textContent = 'Set New Password';

    if (error) {
        errEl.textContent = error.message;
        errEl.style.display = 'block';
    } else {
        sucEl.textContent = 'Password updated! Redirecting to app...';
        sucEl.style.display = 'block';
        setTimeout(() => {
            history.replaceState(null, '', window.location.pathname);
            state.isRecoveryMode = false;
            renderNav();
            showScreen('welcome-screen');
        }, 2000);
    }
}

// ── Setup Event Listeners ────────────────────────────────────────────────────
function setupEventListeners() {
    // Existing test flow
    document.getElementById('start-test-btn').addEventListener('click', async () => {
        try {
            await startTest();
        } catch (e) {
            console.error('startTest error:', e);
            alert('Error starting test: ' + e.message);
        }
    });
    document.getElementById('prev-btn').addEventListener('click', () => navigateQuestion(-1));
    document.getElementById('next-btn').addEventListener('click', () => navigateQuestion(1));
    document.getElementById('mark-btn').addEventListener('click', toggleMark);
    document.getElementById('submit-test-btn').addEventListener('click', confirmSubmit);
    document.getElementById('pause-btn').addEventListener('click', togglePause);
    document.getElementById('resume-btn').addEventListener('click', togglePause);
    document.getElementById('view-answers-btn').addEventListener('click', showReview);
    document.getElementById('retake-test-btn').addEventListener('click', retakeTest);
    document.getElementById('back-to-results-btn').addEventListener('click', backToResults);

    // New user-system buttons
    document.getElementById('favorite-btn').addEventListener('click', toggleFavorite);
    document.getElementById('quit-test-btn').addEventListener('click', quitTest);
    document.getElementById('view-history-btn').addEventListener('click', showHistoryScreen);
    document.getElementById('history-back-btn').addEventListener('click', () => showScreen('welcome-screen'));
    document.getElementById('history-detail-back-btn').addEventListener('click', showHistoryScreen);
    document.getElementById('favorites-back-btn').addEventListener('click', () => showScreen('welcome-screen'));
    document.getElementById('recovery-submit-btn').addEventListener('click', handleRecoverySubmit);

    // Auth modal
    document.getElementById('auth-modal-close').addEventListener('click', closeAuthModal);
    document.getElementById('auth-modal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('auth-modal')) closeAuthModal();
    });

    // Auth panel navigation links
    document.getElementById('goto-register-link').addEventListener('click', (e) => { e.preventDefault(); openAuthModal('register'); });
    document.getElementById('goto-login-link').addEventListener('click', (e) => { e.preventDefault(); openAuthModal('login'); });
    document.getElementById('goto-forgot-link').addEventListener('click', (e) => { e.preventDefault(); openAuthModal('forgot'); });
    document.getElementById('forgot-back-link').addEventListener('click', (e) => { e.preventDefault(); openAuthModal('login'); });

    // Auth form submit buttons
    document.getElementById('login-submit-btn').addEventListener('click', login);
    document.getElementById('register-submit-btn').addEventListener('click', register);
    document.getElementById('forgot-submit-btn').addEventListener('click', sendPasswordReset);
    document.getElementById('change-pw-submit-btn').addEventListener('click', changePassword);

    // Enter key support in auth forms
    document.getElementById('login-password').addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });
    document.getElementById('register-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') register(); });
    document.getElementById('register-confirm').addEventListener('keydown', (e) => { if (e.key === 'Enter') register(); });
    document.getElementById('forgot-email').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendPasswordReset(); });

    // Guest continue link (just closes modal / does nothing — welcome screen is already visible)
    const guestLink = document.getElementById('guest-continue-link');
    if (guestLink) guestLink.addEventListener('click', (e) => e.preventDefault());
}

// ── Generate Test ────────────────────────────────────────────────────────────
async function generateTest() {
    if (state.currentUser) {
        generateSmartTest();
    } else {
        generateRandomTest();
    }
}

function generateRandomTest() {
    const q3 = state.allQuestions.filter(q => q.points === 3);
    const q4 = state.allQuestions.filter(q => q.points === 4);
    const q5 = state.allQuestions.filter(q => q.points === 5);
    state.testQuestions = [
        ...shuffleArray(q3).slice(0, 8),
        ...shuffleArray(q4).slice(0, 8),
        ...shuffleArray(q5).slice(0, 8)
    ];
}

function generateSmartTest() {
    state.testQuestions = [
        ...selectQuestionsForTier(3, 8),
        ...selectQuestionsForTier(4, 8),
        ...selectQuestionsForTier(5, 8)
    ];
}

// Select `count` questions for a difficulty tier, avoiding already-used ones.
// When all questions in the tier have been used, resets and starts a new round.
function selectQuestionsForTier(points, count) {
    const all = state.allQuestions.filter(q => q.points === points);
    const progress = state.questionProgress[points];
    const usedIds = new Set(progress.used);
    let available = all.filter(q => !usedIds.has(q.id));

    if (available.length < count) {
        // All questions in this tier have been used — start a new round
        state.questionProgress[points] = { used: [], round: progress.round + 1 };
        available = [...all];
    }

    const selected = shuffleArray(available).slice(0, count);
    // Mark selected as used in memory; persisted to DB after test submit
    state.questionProgress[points].used = [
        ...state.questionProgress[points].used,
        ...selected.map(q => q.id)
    ];
    return selected;
}

// ── Shuffle Array (Fisher-Yates) ─────────────────────────────────────────────
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// ── Start Test ───────────────────────────────────────────────────────────────
async function startTest() {
    await generateTest();
    state.currentQuestionIndex = 0;
    state.userAnswers = {};
    state.markedQuestions = new Set();
    state.startTime = Date.now();
    state.timeRemaining = 60 * 60;
    state.isPaused = false;

    document.getElementById('pause-btn').textContent = '⏸ Pause';
    document.getElementById('pause-overlay').style.display = 'none';

    showScreen('test-screen');
    renderQuestionGrid();
    displayQuestion();
    startTimer();
    scrollToQuestion();
}

// ── Timer ────────────────────────────────────────────────────────────────────
function startTimer() {
    updateTimerDisplay();
    state.timerInterval = setInterval(() => {
        state.timeRemaining--;
        updateTimerDisplay();
        if (state.timeRemaining <= 0) {
            clearInterval(state.timerInterval);
            alert('Time is up! The test will be submitted automatically.');
            submitTest();
        }
    }, 1000);
}

function updateTimerDisplay() {
    const minutes = Math.floor(state.timeRemaining / 60);
    const seconds = state.timeRemaining % 60;
    document.getElementById('timer-display').textContent =
        `${minutes}:${seconds.toString().padStart(2, '0')}`;

    const timerEl = document.getElementById('timer');
    timerEl.classList.remove('warning', 'danger');
    if (state.timeRemaining <= 300) timerEl.classList.add('danger');
    else if (state.timeRemaining <= 600) timerEl.classList.add('warning');
}

// ── Toggle Pause ─────────────────────────────────────────────────────────────
function togglePause() {
    if (state.isPaused) {
        state.isPaused = false;
        document.getElementById('pause-btn').textContent = '⏸ Pause';
        document.getElementById('pause-overlay').style.display = 'none';
        state.timerInterval = setInterval(() => {
            state.timeRemaining--;
            updateTimerDisplay();
            if (state.timeRemaining <= 0) {
                clearInterval(state.timerInterval);
                alert('Time is up! The test will be submitted automatically.');
                submitTest();
            }
        }, 1000);
    } else {
        state.isPaused = true;
        clearInterval(state.timerInterval);
        state.timerInterval = null;
        document.getElementById('pause-btn').textContent = '▶ Resume';
        document.getElementById('pause-overlay').style.display = 'flex';
    }
}

// ── Question Grid ─────────────────────────────────────────────────────────────
function renderQuestionGrid() {
    const grid = document.getElementById('question-grid');
    grid.innerHTML = '';
    state.testQuestions.forEach((_, index) => {
        const btn = document.createElement('div');
        btn.className = 'question-num';
        btn.textContent = index + 1;
        btn.addEventListener('click', () => {
            state.currentQuestionIndex = index;
            displayQuestion();
        });
        grid.appendChild(btn);
    });
    updateQuestionGrid();
}

function updateQuestionGrid() {
    document.querySelectorAll('.question-num').forEach((btn, index) => {
        btn.classList.remove('active', 'answered', 'marked');
        if (index === state.currentQuestionIndex) btn.classList.add('active');
        if (state.userAnswers[index] !== undefined) btn.classList.add('answered');
        if (state.markedQuestions.has(index)) btn.classList.add('marked');
    });
}

// ── Display Question ──────────────────────────────────────────────────────────
function displayQuestion() {
    if (!state.testQuestions.length) {
        console.error('No test questions loaded.');
        return;
    }
    const question = state.testQuestions[state.currentQuestionIndex];

    document.getElementById('question-number').textContent =
        `Question ${state.currentQuestionIndex + 1} of 24`;
    document.getElementById('question-points').textContent = `${question.points} points`;
    document.getElementById('question-text').textContent = question.question;

    const imageContainer = document.getElementById('question-image-container');
    const imageElement = document.getElementById('question-image');
    if (question.image) {
        imageElement.src = question.image;
        imageContainer.style.display = 'block';
    } else {
        imageContainer.style.display = 'none';
    }

    renderChoices(question);

    document.getElementById('prev-btn').disabled = state.currentQuestionIndex === 0;
    document.getElementById('next-btn').disabled =
        state.currentQuestionIndex === state.testQuestions.length - 1;

    const markBtn = document.getElementById('mark-btn');
    if (state.markedQuestions.has(state.currentQuestionIndex)) {
        markBtn.classList.add('marked');
        markBtn.textContent = '🔖 Marked';
    } else {
        markBtn.classList.remove('marked');
        markBtn.textContent = '🔖 Mark for Review';
    }

    updateFavoriteButton();
    updateQuestionGrid();
    scrollToQuestion();
}

// ── Render Choices ────────────────────────────────────────────────────────────
function renderChoices(question) {
    const container = document.getElementById('choices-container');
    container.innerHTML = '';
    const choices = ['A', 'B', 'C', 'D', 'E'];
    choices.forEach(choice => {
        if (question.choices[choice] === undefined ||
            question.choices[choice] === null ||
            (typeof question.choices[choice] === 'string' && question.choices[choice].trim() === '')) {
            return;
        }
        const choiceDiv = document.createElement('div');
        choiceDiv.className = 'choice';
        if (state.userAnswers[state.currentQuestionIndex] === choice) {
            choiceDiv.classList.add('selected');
        }
        choiceDiv.innerHTML = `
            <div class="choice-radio"></div>
            <div class="choice-label">${choice}</div>
            <div class="choice-text">${question.choices[choice]}</div>
        `;
        choiceDiv.addEventListener('click', () => selectAnswer(choice));
        container.appendChild(choiceDiv);
    });
}

// ── Select Answer ─────────────────────────────────────────────────────────────
function selectAnswer(choice) {
    state.userAnswers[state.currentQuestionIndex] = choice;
    renderChoices(state.testQuestions[state.currentQuestionIndex]);
    updateQuestionGrid();
}

// ── Navigate Question ─────────────────────────────────────────────────────────
function navigateQuestion(direction) {
    const newIndex = state.currentQuestionIndex + direction;
    if (newIndex >= 0 && newIndex < state.testQuestions.length) {
        state.currentQuestionIndex = newIndex;
        displayQuestion();
    }
}

// ── Toggle Mark ───────────────────────────────────────────────────────────────
function toggleMark() {
    if (state.markedQuestions.has(state.currentQuestionIndex)) {
        state.markedQuestions.delete(state.currentQuestionIndex);
    } else {
        state.markedQuestions.add(state.currentQuestionIndex);
    }
    const markBtn = document.getElementById('mark-btn');
    if (state.markedQuestions.has(state.currentQuestionIndex)) {
        markBtn.classList.add('marked');
        markBtn.textContent = '🔖 Marked';
    } else {
        markBtn.classList.remove('marked');
        markBtn.textContent = '🔖 Mark for Review';
    }
    updateQuestionGrid();
}

// ── Quit Test ─────────────────────────────────────────────────────────────────
function quitTest() {
    if (!confirm('Are you sure you want to quit? Your progress will not be saved.')) return;
    clearInterval(state.timerInterval);
    state.isPaused = false;
    document.getElementById('pause-overlay').style.display = 'none';
    state.testQuestions = [];
    state.userAnswers = {};
    state.markedQuestions = new Set();
    state.currentQuestionIndex = 0;
    showScreen('welcome-screen');
}

// ── Confirm Submit ────────────────────────────────────────────────────────────
function confirmSubmit() {
    const answeredCount = Object.keys(state.userAnswers).length;
    const totalQuestions = state.testQuestions.length;
    let message = `You have answered ${answeredCount} out of ${totalQuestions} questions.\n\n`;
    if (answeredCount < totalQuestions) {
        message += `${totalQuestions - answeredCount} questions are unanswered.\n\n`;
    }
    message += 'Are you sure you want to submit the test?';
    if (confirm(message)) submitTest();
}

// ── Submit Test ───────────────────────────────────────────────────────────────
async function submitTest() {
    clearInterval(state.timerInterval);
    state.isPaused = false;
    document.getElementById('pause-overlay').style.display = 'none';
    state.endTime = Date.now();

    window.scrollTo(0, 0);

    const results = calculateResults();
    displayResults(results);

    const saveStatusEl = document.getElementById('save-status');
    if (state.currentUser) {
        // Show "Saving..." while the write is in flight
        saveStatusEl.className = 'save-status-msg saving';
        saveStatusEl.textContent = 'Saving result to history...';
        saveStatusEl.style.display = 'block';

        // Keep a reference to results so the retry button can use it
        state.lastResults = results;

        const saveProm = Promise.all([saveExamResult(results), saveQuestionProgress()]);
        state.pendingSave = saveProm;

        saveProm.then(([saved]) => {
            if (saved) {
                saveStatusEl.className = 'save-status-msg save-ok';
                saveStatusEl.textContent = '✓ Result saved to history';
            } else {
                saveStatusEl.className = 'save-status-msg save-fail';
                saveStatusEl.innerHTML = '⚠ Failed to save result. <a href="#" id="retry-save-link">Retry</a>';
                document.getElementById('retry-save-link').addEventListener('click', (e) => {
                    e.preventDefault();
                    retrySave();
                });
            }
        }).catch(() => {
            saveStatusEl.className = 'save-status-msg save-fail';
            saveStatusEl.innerHTML = '⚠ Failed to save result. <a href="#" id="retry-save-link">Retry</a>';
            document.getElementById('retry-save-link').addEventListener('click', (e) => {
                e.preventDefault();
                retrySave();
            });
        });

        document.getElementById('view-history-btn').style.display = '';
    } else {
        saveStatusEl.style.display = 'none';
        document.getElementById('view-history-btn').style.display = 'none';
    }

    showScreen('results-screen');
}

// ── Calculate Results ─────────────────────────────────────────────────────────
function calculateResults() {
    let correctCount = 0, wrongCount = 0, totalScore = 0;
    const maxScore = 96;

    state.testQuestions.forEach((question, index) => {
        const userAnswer = state.userAnswers[index];
        if (userAnswer === question.answer) {
            correctCount++;
            totalScore += question.points;
        } else if (userAnswer !== undefined) {
            wrongCount++;
        }
    });

    const unanswered = state.testQuestions.length - correctCount - wrongCount;
    const accuracy = Math.round((correctCount / state.testQuestions.length) * 100);
    const timeTakenSeconds = Math.floor((state.endTime - state.startTime) / 1000);
    const minutes = Math.floor(timeTakenSeconds / 60);
    const seconds = timeTakenSeconds % 60;

    return {
        correctCount, wrongCount, unanswered, totalScore, maxScore, accuracy,
        timeTakenSeconds,
        timeTaken: `${minutes}:${seconds.toString().padStart(2, '0')}`
    };
}

// ── Display Results ───────────────────────────────────────────────────────────
function displayResults(results) {
    document.getElementById('final-score').textContent = results.totalScore;
    document.getElementById('correct-count').textContent = results.correctCount;
    document.getElementById('wrong-count').textContent = results.wrongCount + results.unanswered;
    document.getElementById('accuracy').textContent = `${results.accuracy}%`;
    document.getElementById('time-taken').textContent = results.timeTaken;
    renderResultTables();
}

// ── Result Breakdown Tables ───────────────────────────────────────────────────
function renderResultTables() {
    const groups = [
        { label: 'Questions 1–8 (3 pts each)', start: 0, end: 8 },
        { label: 'Questions 9–16 (4 pts each)', start: 8, end: 16 },
        { label: 'Questions 17–24 (5 pts each)', start: 16, end: 24 }
    ];
    const container = document.getElementById('result-breakdown');
    container.innerHTML = '';
    groups.forEach(group => {
        const wrapper = document.createElement('div');
        wrapper.className = 'result-table-wrapper';
        const title = document.createElement('div');
        title.className = 'result-table-title';
        title.textContent = group.label;
        const table = document.createElement('table');
        table.className = 'result-table';
        const thead = document.createElement('thead');
        const trNum = document.createElement('tr');
        const tbody = document.createElement('tbody');
        const trResult = document.createElement('tr');
        for (let i = group.start; i < group.end; i++) {
            const th = document.createElement('th');
            th.textContent = i + 1;
            trNum.appendChild(th);
            const td = document.createElement('td');
            const isCorrect = state.userAnswers[i] === state.testQuestions[i].answer;
            td.textContent = isCorrect ? '✓' : '✗';
            td.className = isCorrect ? 'result-correct' : 'result-wrong';
            trResult.appendChild(td);
        }
        thead.appendChild(trNum);
        tbody.appendChild(trResult);
        table.appendChild(thead);
        table.appendChild(tbody);
        wrapper.appendChild(title);
        wrapper.appendChild(table);
        container.appendChild(wrapper);
    });
}

// ── Save Exam Result to Supabase ──────────────────────────────────────────────
async function saveExamResult(results) {
    const correctAnswers = {};
    state.testQuestions.forEach((q, i) => { correctAnswers[i] = q.answer; });

    const insertPromise = db.from('exam_results').insert({
        user_id: state.currentUser.id,
        score: results.totalScore,
        max_score: results.maxScore,
        correct_count: results.correctCount,
        wrong_count: results.wrongCount,
        unanswered_count: results.unanswered,
        accuracy: results.accuracy,
        time_taken_seconds: results.timeTakenSeconds,
        question_ids: state.testQuestions.map(q => q.id),
        user_answers: state.userAnswers,
        correct_answers: correctAnswers
    });

    // 10-second timeout to prevent hanging on slow/broken network
    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Save timed out after 10s')), 10000));

    try {
        const { error } = await Promise.race([insertPromise, timeoutPromise]);
        if (error) {
            console.error('Failed to save exam result:', error);
            return false;
        }
        return true;
    } catch (e) {
        console.error('Failed to save exam result:', e);
        return false;
    }
}

// ── Retry Save (called from results screen Retry link) ────────────────────────
async function retrySave() {
    if (!state.lastResults || !state.currentUser) return;
    const saveStatusEl = document.getElementById('save-status');
    saveStatusEl.className = 'save-status-msg saving';
    saveStatusEl.textContent = 'Retrying save...';

    const saved = await saveExamResult(state.lastResults);
    if (saved) {
        state.pendingSave = null;
        saveStatusEl.className = 'save-status-msg save-ok';
        saveStatusEl.textContent = '✓ Result saved to history';
    } else {
        saveStatusEl.className = 'save-status-msg save-fail';
        saveStatusEl.innerHTML = '⚠ Still failed. Check your connection and <a href="#" id="retry-save-link">try again</a>.';
        document.getElementById('retry-save-link').addEventListener('click', (e) => {
            e.preventDefault();
            retrySave();
        });
    }
}

// ── Question Progress (Smart Generation) ─────────────────────────────────────
async function loadQuestionProgress() {
    const { data, error } = await db
        .from('question_progress')
        .select('*')
        .eq('user_id', state.currentUser.id);

    if (error) { console.error('Failed to load question progress:', error); return; }

    if (data) {
        data.forEach(row => {
            state.questionProgress[row.points] = {
                used: row.used_question_ids || [],
                round: row.round_number
            };
        });
    }
}

async function saveQuestionProgress() {
    const upserts = [3, 4, 5].map(points => ({
        user_id: state.currentUser.id,
        points,
        used_question_ids: state.questionProgress[points].used,
        round_number: state.questionProgress[points].round,
        last_updated: new Date().toISOString()
    }));

    const { error } = await db
        .from('question_progress')
        .upsert(upserts, { onConflict: 'user_id,points' });

    if (error) console.error('Failed to save question progress:', error);
}

// ── Favorites ─────────────────────────────────────────────────────────────────
async function loadFavorites() {
    const { data, error } = await db
        .from('favorites')
        .select('question_id')
        .eq('user_id', state.currentUser.id);

    if (error) { console.error('Failed to load favorites:', error); return; }
    state.favoritedQuestionIds = new Set(data.map(row => row.question_id));
}

function updateFavoriteButton() {
    const btn = document.getElementById('favorite-btn');
    if (!btn || !state.testQuestions.length) return;
    const question = state.testQuestions[state.currentQuestionIndex];
    if (state.currentUser && state.favoritedQuestionIds.has(question.id)) {
        btn.classList.add('favorited');
        btn.textContent = '★ Favorited';
    } else {
        btn.classList.remove('favorited');
        btn.textContent = '☆ Favorite';
    }
}

async function toggleFavorite() {
    const question = state.testQuestions[state.currentQuestionIndex];
    if (!state.currentUser) {
        alert('Please log in to save favorites.');
        return;
    }
    if (state.favoritedQuestionIds.has(question.id)) {
        const { error } = await db
            .from('favorites')
            .delete()
            .eq('user_id', state.currentUser.id)
            .eq('question_id', question.id);
        if (!error) state.favoritedQuestionIds.delete(question.id);
    } else {
        const { error } = await db
            .from('favorites')
            .insert({ user_id: state.currentUser.id, question_id: question.id });
        if (!error) state.favoritedQuestionIds.add(question.id);
    }
    updateFavoriteButton();
}

async function removeFavorite(questionId) {
    const { error } = await db
        .from('favorites')
        .delete()
        .eq('user_id', state.currentUser.id)
        .eq('question_id', questionId);
    if (!error) state.favoritedQuestionIds.delete(questionId);
}

async function showFavoritesScreen() {
    showScreen('favorites-screen');
    const listEl = document.getElementById('favorites-list');
    listEl.innerHTML = '<p class="loading-text">Loading favorites...</p>';

    const { data, error } = await db
        .from('favorites')
        .select('question_id, favorited_at')
        .eq('user_id', state.currentUser.id)
        .order('favorited_at', { ascending: false });

    if (error || !data || data.length === 0) {
        listEl.innerHTML = '<p class="empty-state">No favorites yet. Click ☆ on any question during a test or review to save it here.</p>';
        return;
    }

    const favQuestions = data
        .map(row => state.allQuestions.find(q => q.id === row.question_id))
        .filter(Boolean);

    listEl.innerHTML = '';
    favQuestions.forEach(question => {
        const item = document.createElement('div');
        item.className = 'fav-item';
        const imageHTML = question.image
            ? `<div class="fav-image"><img src="${question.image}" alt="Question image"></div>`
            : '';
        item.innerHTML = `
            <div class="fav-question-header">
                <span class="points-badge">${question.points} pts</span>
                <button class="btn btn-sm btn-outline fav-remove-btn" data-id="${question.id}">Remove</button>
            </div>
            <p class="fav-question-text">${question.question}</p>
            ${imageHTML}
            <div class="fav-choices" id="fav-choices-${question.id}" style="display:none;">
                ${renderFavChoices(question)}
            </div>
            <button class="btn btn-sm btn-secondary fav-show-answer-btn" data-id="${question.id}">Show Answer</button>
        `;
        listEl.appendChild(item);
    });

    listEl.querySelectorAll('.fav-show-answer-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const choicesDiv = document.getElementById(`fav-choices-${btn.dataset.id}`);
            const isVisible = choicesDiv.style.display !== 'none';
            choicesDiv.style.display = isVisible ? 'none' : 'block';
            btn.textContent = isVisible ? 'Show Answer' : 'Hide Answer';
        });
    });

    listEl.querySelectorAll('.fav-remove-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            await removeFavorite(btn.dataset.id);
            showFavoritesScreen();
        });
    });
}

function renderFavChoices(question) {
    const choices = ['A', 'B', 'C', 'D', 'E'];
    return choices
        .filter(c => question.choices[c] !== undefined && question.choices[c] !== null &&
            !(typeof question.choices[c] === 'string' && question.choices[c].trim() === ''))
        .map(c => {
            const isCorrect = c === question.answer;
            return `
                <div class="fav-choice ${isCorrect ? 'fav-choice-correct' : ''}">
                    <span class="fav-choice-label">${c})</span>
                    <span>${question.choices[c]}</span>
                    ${isCorrect ? '<span class="fav-correct-mark">✓ Correct Answer</span>' : ''}
                </div>
            `;
        }).join('');
}

// ── Exam History ──────────────────────────────────────────────────────────────
async function showHistoryScreen() {
    showScreen('history-screen');
    const listEl = document.getElementById('history-list');
    listEl.innerHTML = '<p class="loading-text">Loading history...</p>';

    // Wait for any in-flight DB write, with a 12s timeout to prevent infinite loading
    if (state.pendingSave) {
        try {
            await Promise.race([
                state.pendingSave,
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 12000))
            ]);
        } catch (e) {
            console.error('Pending save timed out or failed:', e);
        }
        state.pendingSave = null;
    }

    const { data, error } = await db
        .from('exam_results')
        .select('*')
        .eq('user_id', state.currentUser.id)
        .order('taken_at', { ascending: false });

    if (error) {
        listEl.innerHTML = '<p class="empty-state" style="color:var(--danger-color);">Failed to load history. Please check your connection and try again.</p>';
        console.error('Failed to load history:', error);
        return;
    }
    if (!data || data.length === 0) {
        listEl.innerHTML = '<p class="empty-state">No exams taken yet. Complete a test to see your history here.</p>';
        return;
    }

    state.historyData = data;
    listEl.innerHTML = '';
    data.forEach((result, idx) => {
        const date = new Date(result.taken_at);
        const dateStr = date.toLocaleDateString('en-US', {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
        const mins = Math.floor(result.time_taken_seconds / 60);
        const secs = result.time_taken_seconds % 60;
        const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;
        const pct = Math.round((result.score / result.max_score) * 100);
        const gradeClass = pct >= 80 ? 'grade-high' : pct >= 60 ? 'grade-mid' : 'grade-low';

        const item = document.createElement('div');
        item.className = 'history-item';
        item.innerHTML = `
            <div class="history-item-header">
                <span class="history-exam-num">Exam #${data.length - idx}</span>
                <span class="history-date">${dateStr}</span>
            </div>
            <div class="history-stats">
                <div class="history-stat">
                    <span class="history-stat-label">Score</span>
                    <span class="history-stat-value ${gradeClass}">${result.score}/${result.max_score}</span>
                </div>
                <div class="history-stat">
                    <span class="history-stat-label">Correct</span>
                    <span class="history-stat-value">${result.correct_count}</span>
                </div>
                <div class="history-stat">
                    <span class="history-stat-label">Wrong</span>
                    <span class="history-stat-value">${result.wrong_count}</span>
                </div>
                <div class="history-stat">
                    <span class="history-stat-label">Unanswered</span>
                    <span class="history-stat-value">${result.unanswered_count}</span>
                </div>
                <div class="history-stat">
                    <span class="history-stat-label">Accuracy</span>
                    <span class="history-stat-value">${result.accuracy}%</span>
                </div>
                <div class="history-stat">
                    <span class="history-stat-label">Time</span>
                    <span class="history-stat-value">${timeStr}</span>
                </div>
            </div>
            <div class="history-item-actions">
                <button class="btn btn-sm btn-secondary view-details-btn" data-idx="${idx}">View Details</button>
                <button class="btn btn-sm btn-danger delete-record-btn" data-id="${result.id}">Delete</button>
            </div>
        `;
        listEl.appendChild(item);
    });

    listEl.querySelectorAll('.view-details-btn').forEach(btn =>
        btn.addEventListener('click', () => showHistoryDetail(state.historyData[+btn.dataset.idx])));
    listEl.querySelectorAll('.delete-record-btn').forEach(btn =>
        btn.addEventListener('click', () => deleteHistoryRecord(btn.dataset.id)));
}

// ── History Detail View ───────────────────────────────────────────────────────
function showHistoryDetail(record) {
    window.scrollTo(0, 0);
    const questions = record.question_ids.map(id => state.allQuestions.find(q => q.id === id));
    const userAnswers = record.user_answers;

    // Score summary
    const date = new Date(record.taken_at);
    const dateStr = date.toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
    const mins = Math.floor(record.time_taken_seconds / 60);
    const secs = record.time_taken_seconds % 60;
    const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;
    const pct = Math.round((record.score / record.max_score) * 100);
    const gradeClass = pct >= 80 ? 'grade-high' : pct >= 60 ? 'grade-mid' : 'grade-low';

    document.getElementById('history-detail-summary').innerHTML = `
        <div class="results-card" style="margin-bottom:24px;">
            <p style="color:var(--gray-500);margin-bottom:12px;">${dateStr}</p>
            <div class="score-summary">
                <div class="score-main">
                    <div class="score-label">Score</div>
                    <div class="score-value ${gradeClass}">${record.score}</div>
                    <div class="score-total">out of ${record.max_score}</div>
                </div>
                <div class="score-stats">
                    <div class="stat-item"><div class="stat-label">Correct</div><div class="stat-value">${record.correct_count}</div></div>
                    <div class="stat-item"><div class="stat-label">Wrong</div><div class="stat-value">${record.wrong_count}</div></div>
                    <div class="stat-item"><div class="stat-label">Unanswered</div><div class="stat-value">${record.unanswered_count}</div></div>
                    <div class="stat-item"><div class="stat-label">Accuracy</div><div class="stat-value">${record.accuracy}%</div></div>
                    <div class="stat-item"><div class="stat-label">Time</div><div class="stat-value">${timeStr}</div></div>
                </div>
            </div>
        </div>
    `;

    // Tier breakdown table
    const groups = [
        { label: 'Questions 1–8 (3 pts each)', start: 0, end: 8 },
        { label: 'Questions 9–16 (4 pts each)', start: 8, end: 16 },
        { label: 'Questions 17–24 (5 pts each)', start: 16, end: 24 }
    ];
    const breakdownEl = document.getElementById('history-detail-breakdown');
    breakdownEl.innerHTML = '';
    groups.forEach(group => {
        const wrapper = document.createElement('div');
        wrapper.className = 'result-table-wrapper';
        const title = document.createElement('div');
        title.className = 'result-table-title';
        title.textContent = group.label;
        const table = document.createElement('table');
        table.className = 'result-table';
        const thead = document.createElement('thead');
        const trNum = document.createElement('tr');
        const tbody = document.createElement('tbody');
        const trResult = document.createElement('tr');
        for (let i = group.start; i < group.end; i++) {
            const th = document.createElement('th');
            th.textContent = i + 1;
            trNum.appendChild(th);
            const td = document.createElement('td');
            const q = questions[i];
            const correct = q && userAnswers[i] === q.answer;
            td.textContent = correct ? '✓' : '✗';
            td.className = correct ? 'result-correct' : 'result-wrong';
            trResult.appendChild(td);
        }
        thead.appendChild(trNum);
        tbody.appendChild(trResult);
        table.appendChild(thead);
        table.appendChild(tbody);
        wrapper.appendChild(title);
        wrapper.appendChild(table);
        breakdownEl.appendChild(wrapper);
    });

    // Question-by-question review
    const reviewEl = document.getElementById('history-detail-questions');
    reviewEl.innerHTML = '';
    questions.forEach((question, index) => {
        if (!question) return;
        const userAnswer = userAnswers[index];
        const correctAnswer = question.answer;
        const isCorrect = userAnswer === correctAnswer;

        const reviewItem = document.createElement('div');
        reviewItem.className = `review-item ${isCorrect ? 'correct' : 'wrong'}`;

        let imageHTML = '';
        if (question.image) {
            imageHTML = `<div class="review-image"><img src="${question.image}" alt="Question image"></div>`;
        }

        const choices = ['A', 'B', 'C', 'D', 'E'];
        let choicesHTML = '';
        choices.forEach(choice => {
            if (question.choices[choice] === undefined || question.choices[choice] === null ||
                (typeof question.choices[choice] === 'string' && question.choices[choice].trim() === '')) return;
            let choiceClass = '';
            if (choice === correctAnswer) choiceClass = 'correct-answer';
            else if (choice === userAnswer && !isCorrect) choiceClass = 'user-wrong';
            choicesHTML += `
                <div class="review-choice ${choiceClass}">
                    <span class="review-choice-label">${choice})</span>
                    <span>${question.choices[choice]}</span>
                </div>
            `;
        });

        const isFav = state.currentUser && state.favoritedQuestionIds.has(question.id);
        const favBtnHTML = state.currentUser
            ? `<button class="btn btn-sm btn-outline review-fav-btn ${isFav ? 'favorited' : ''}" data-qid="${question.id}">${isFav ? '★ Favorited' : '☆ Favorite'}</button>`
            : '';

        reviewItem.innerHTML = `
            <div class="review-header-info">
                <span class="review-question-num">Question ${index + 1} (${question.points} points)</span>
                <div class="review-header-actions">
                    ${favBtnHTML}
                    <span class="review-result ${isCorrect ? 'correct' : 'wrong'}">
                        ${isCorrect ? '✓ Correct' : userAnswer ? '✗ Wrong' : '✗ Not Answered'}
                    </span>
                </div>
            </div>
            <div class="review-question-text">${question.question}</div>
            ${imageHTML}
            <div class="review-choices">${choicesHTML}</div>
            ${!isCorrect ? `<p style="margin-top:12px;color:var(--success-color);font-weight:600;">Correct Answer: ${correctAnswer}</p>` : ''}
            ${userAnswer && !isCorrect ? `<p style="margin-top:4px;color:var(--danger-color);">Your Answer: ${userAnswer}</p>` : ''}
            ${!userAnswer ? `<p style="margin-top:4px;color:var(--gray-600);">You did not answer this question.</p>` : ''}
        `;
        reviewEl.appendChild(reviewItem);
    });

    // Bind favorite buttons in history detail view
    reviewEl.querySelectorAll('.review-fav-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const qid = btn.dataset.qid;
            if (state.favoritedQuestionIds.has(qid)) {
                await removeFavorite(qid);
                btn.classList.remove('favorited');
                btn.textContent = '☆ Favorite';
            } else {
                const { error } = await db.from('favorites')
                    .insert({ user_id: state.currentUser.id, question_id: qid });
                if (!error) {
                    state.favoritedQuestionIds.add(qid);
                    btn.classList.add('favorited');
                    btn.textContent = '★ Favorited';
                }
            }
        });
    });

    showScreen('history-detail-screen');
}

// ── Delete History Record ─────────────────────────────────────────────────────
async function deleteHistoryRecord(recordId) {
    if (!confirm('Delete this exam record? This cannot be undone.')) return;
    const { error } = await db.from('exam_results').delete()
        .eq('id', recordId)
        .eq('user_id', state.currentUser.id);
    if (error) { alert('Failed to delete: ' + error.message); return; }
    showHistoryScreen();
}

// ── Show Review ───────────────────────────────────────────────────────────────
function showReview() {
    window.scrollTo(0, 0);
    const reviewContent = document.getElementById('review-content');
    reviewContent.innerHTML = '';

    state.testQuestions.forEach((question, index) => {
        const userAnswer = state.userAnswers[index];
        const correctAnswer = question.answer;
        const isCorrect = userAnswer === correctAnswer;

        const reviewItem = document.createElement('div');
        reviewItem.className = `review-item ${isCorrect ? 'correct' : 'wrong'}`;

        let imageHTML = '';
        if (question.image) {
            imageHTML = `<div class="review-image"><img src="${question.image}" alt="Question image"></div>`;
        }

        const choices = ['A', 'B', 'C', 'D', 'E'];
        let choicesHTML = '';
        choices.forEach(choice => {
            if (question.choices[choice] === undefined || question.choices[choice] === null ||
                (typeof question.choices[choice] === 'string' && question.choices[choice].trim() === '')) return;
            let choiceClass = '';
            if (choice === correctAnswer) choiceClass = 'correct-answer';
            else if (choice === userAnswer && !isCorrect) choiceClass = 'user-wrong';
            choicesHTML += `
                <div class="review-choice ${choiceClass}">
                    <span class="review-choice-label">${choice})</span>
                    <span>${question.choices[choice]}</span>
                </div>
            `;
        });

        const isFav = state.currentUser && state.favoritedQuestionIds.has(question.id);

        reviewItem.innerHTML = `
            <div class="review-header-info">
                <span class="review-question-num">Question ${index + 1} (${question.points} points)</span>
                <div class="review-header-actions">
                    <button class="btn btn-sm btn-outline review-fav-btn ${isFav ? 'favorited' : ''}"
                        data-qid="${question.id}">${isFav ? '★ Favorited' : '☆ Favorite'}</button>
                    <span class="review-result ${isCorrect ? 'correct' : 'wrong'}">
                        ${isCorrect ? '✓ Correct' : userAnswer ? '✗ Wrong' : '✗ Not Answered'}
                    </span>
                </div>
            </div>
            <div class="review-question-text">${question.question}</div>
            ${imageHTML}
            <div class="review-choices">${choicesHTML}</div>
            ${!isCorrect ? `<p style="margin-top:12px;color:var(--success-color);font-weight:600;">Correct Answer: ${correctAnswer}</p>` : ''}
            ${userAnswer && !isCorrect ? `<p style="margin-top:4px;color:var(--danger-color);">Your Answer: ${userAnswer}</p>` : ''}
            ${!userAnswer ? `<p style="margin-top:4px;color:var(--gray-600);">You did not answer this question.</p>` : ''}
        `;
        reviewContent.appendChild(reviewItem);
    });

    // Bind favorite buttons in review
    reviewContent.querySelectorAll('.review-fav-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const qid = btn.dataset.qid;
            if (!state.currentUser) { alert('Please log in to save favorites.'); return; }
            if (state.favoritedQuestionIds.has(qid)) {
                await removeFavorite(qid);
                btn.classList.remove('favorited');
                btn.textContent = '☆ Favorite';
            } else {
                const { error } = await db.from('favorites')
                    .insert({ user_id: state.currentUser.id, question_id: qid });
                if (!error) {
                    state.favoritedQuestionIds.add(qid);
                    btn.classList.add('favorited');
                    btn.textContent = '★ Favorited';
                }
            }
        });
    });

    showScreen('review-screen');
}

// ── Back to Results / Retake ──────────────────────────────────────────────────
function backToResults() {
    showScreen('results-screen');
}

function retakeTest() {
    if (confirm('Are you sure you want to take a new test? Your current results will be lost.')) {
        showScreen('welcome-screen');
    }
}

// ── Scroll Helpers ────────────────────────────────────────────────────────────
function scrollToQuestion() {
    setTimeout(() => {
        const questionContent = document.querySelector('.question-content');
        if (questionContent) {
            questionContent.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, 100);
}

// ── Show Screen ───────────────────────────────────────────────────────────────
function showScreen(screenId) {
    window.scrollTo(0, 0);
    document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
    const targetScreen = document.getElementById(screenId);
    targetScreen.classList.add('active');
    void targetScreen.offsetHeight;
}

// ── Initialize on page load ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
