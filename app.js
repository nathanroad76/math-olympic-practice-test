// Application State
let state = {
    allQuestions: [],
    testQuestions: [],
    currentQuestionIndex: 0,
    userAnswers: {},
    markedQuestions: new Set(),
    startTime: null,
    endTime: null,
    timerInterval: null,
    timeRemaining: 60 * 60 // 60 minutes in seconds
};

// Initialize Application
async function init() {
    try {
        // Load questions from JSON
        const response = await fetch('questions.json');
        const data = await response.json();
        state.allQuestions = data.questions;

        console.log(`Loaded ${state.allQuestions.length} questions`);
        console.log(`3 points: ${state.allQuestions.filter(q => q.points === 3).length}`);
        console.log(`4 points: ${state.allQuestions.filter(q => q.points === 4).length}`);
        console.log(`5 points: ${state.allQuestions.filter(q => q.points === 5).length}`);

        setupEventListeners();
    } catch (error) {
        console.error('Error loading questions:', error);
        alert('Failed to load questions. Please refresh the page.');
    }
}

// Setup Event Listeners
function setupEventListeners() {
    document.getElementById('start-test-btn').addEventListener('click', startTest);
    document.getElementById('prev-btn').addEventListener('click', () => navigateQuestion(-1));
    document.getElementById('next-btn').addEventListener('click', () => navigateQuestion(1));
    document.getElementById('mark-btn').addEventListener('click', toggleMark);
    document.getElementById('submit-test-btn').addEventListener('click', confirmSubmit);
    document.getElementById('view-answers-btn').addEventListener('click', showReview);
    document.getElementById('retake-test-btn').addEventListener('click', retakeTest);
    document.getElementById('back-to-results-btn').addEventListener('click', backToResults);
}

// Generate Test: Select 8 questions from each point category
function generateTest() {
    const questions3pt = state.allQuestions.filter(q => q.points === 3);
    const questions4pt = state.allQuestions.filter(q => q.points === 4);
    const questions5pt = state.allQuestions.filter(q => q.points === 5);

    // Shuffle and select 8 from each category
    const selected3pt = shuffleArray(questions3pt).slice(0, 8);
    const selected4pt = shuffleArray(questions4pt).slice(0, 8);
    const selected5pt = shuffleArray(questions5pt).slice(0, 8);

    // Combine in order: 3pt (1-8), 4pt (9-16), 5pt (17-24) - DO NOT shuffle
    state.testQuestions = [...selected3pt, ...selected4pt, ...selected5pt];

    console.log('Test generated with 24 questions:', state.testQuestions);
    console.log('Question 1-8: 3 points');
    console.log('Question 9-16: 4 points');
    console.log('Question 17-24: 5 points');
}

// Shuffle Array (Fisher-Yates algorithm)
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// Start Test
function startTest() {
    generateTest();
    state.currentQuestionIndex = 0;
    state.userAnswers = {};
    state.markedQuestions = new Set();
    state.startTime = Date.now();
    state.timeRemaining = 60 * 60;

    showScreen('test-screen');
    renderQuestionGrid();
    displayQuestion();
    startTimer();
    scrollToQuestion();
}

// Start Timer
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

// Update Timer Display
function updateTimerDisplay() {
    const minutes = Math.floor(state.timeRemaining / 60);
    const seconds = state.timeRemaining % 60;
    const display = `${minutes}:${seconds.toString().padStart(2, '0')}`;

    const timerElement = document.getElementById('timer');
    const displayElement = document.getElementById('timer-display');
    displayElement.textContent = display;

    // Change color based on remaining time
    timerElement.classList.remove('warning', 'danger');
    if (state.timeRemaining <= 300) { // 5 minutes
        timerElement.classList.add('danger');
    } else if (state.timeRemaining <= 600) { // 10 minutes
        timerElement.classList.add('warning');
    }
}

// Render Question Grid
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

// Update Question Grid Status
function updateQuestionGrid() {
    const buttons = document.querySelectorAll('.question-num');
    buttons.forEach((btn, index) => {
        btn.classList.remove('active', 'answered', 'marked');

        if (index === state.currentQuestionIndex) {
            btn.classList.add('active');
        }
        if (state.userAnswers[index] !== undefined) {
            btn.classList.add('answered');
        }
        if (state.markedQuestions.has(index)) {
            btn.classList.add('marked');
        }
    });
}

// Display Question
function displayQuestion() {
    const question = state.testQuestions[state.currentQuestionIndex];

    // Update question header
    document.getElementById('question-number').textContent =
        `Question ${state.currentQuestionIndex + 1} of 24`;
    document.getElementById('question-points').textContent = `${question.points} points`;

    // Update question text
    document.getElementById('question-text').textContent = question.question;

    // Update question image
    const imageContainer = document.getElementById('question-image-container');
    const imageElement = document.getElementById('question-image');

    if (question.image) {
        imageElement.src = question.image;
        imageContainer.style.display = 'block';
    } else {
        imageContainer.style.display = 'none';
    }

    // Render choices
    renderChoices(question);

    // Update navigation buttons
    document.getElementById('prev-btn').disabled = state.currentQuestionIndex === 0;
    document.getElementById('next-btn').disabled =
        state.currentQuestionIndex === state.testQuestions.length - 1;

    // Update mark button
    const markBtn = document.getElementById('mark-btn');
    if (state.markedQuestions.has(state.currentQuestionIndex)) {
        markBtn.classList.add('marked');
        markBtn.textContent = '🔖 Marked';
    } else {
        markBtn.classList.remove('marked');
        markBtn.textContent = '🔖 Mark for Review';
    }

    updateQuestionGrid();
    scrollToQuestion();
}

// Render Choices
function renderChoices(question) {
    const container = document.getElementById('choices-container');
    container.innerHTML = '';

    const choices = ['A', 'B', 'C', 'D', 'E'];

    choices.forEach(choice => {
        // Skip if choice doesn't exist or is empty string (but allow "0")
        if (question.choices[choice] === undefined ||
            question.choices[choice] === null ||
            (typeof question.choices[choice] === 'string' && question.choices[choice].trim() === '')) {
            return; // Skip empty choices
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

// Select Answer
function selectAnswer(choice) {
    state.userAnswers[state.currentQuestionIndex] = choice;
    renderChoices(state.testQuestions[state.currentQuestionIndex]);
    updateQuestionGrid();
}

// Navigate Question
function navigateQuestion(direction) {
    const newIndex = state.currentQuestionIndex + direction;

    if (newIndex >= 0 && newIndex < state.testQuestions.length) {
        state.currentQuestionIndex = newIndex;
        displayQuestion();
    }
}

// Toggle Mark
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

// Confirm Submit
function confirmSubmit() {
    const answeredCount = Object.keys(state.userAnswers).length;
    const totalQuestions = state.testQuestions.length;

    let message = `You have answered ${answeredCount} out of ${totalQuestions} questions.\n\n`;

    if (answeredCount < totalQuestions) {
        message += `${totalQuestions - answeredCount} questions are unanswered.\n\n`;
    }

    message += 'Are you sure you want to submit the test?';

    if (confirm(message)) {
        submitTest();
    }
}

// Submit Test
function submitTest() {
    clearInterval(state.timerInterval);
    state.endTime = Date.now();

    // Scroll to top first
    window.scrollTo(0, 0);

    // Calculate results
    const results = calculateResults();

    // Display results
    displayResults(results);

    // Switch to results screen (this also scrolls to top)
    showScreen('results-screen');
}

// Calculate Results
function calculateResults() {
    let correctCount = 0;
    let wrongCount = 0;
    let totalScore = 0;
    const maxScore = 96; // 8*3 + 8*4 + 8*5

    state.testQuestions.forEach((question, index) => {
        const userAnswer = state.userAnswers[index];
        const correctAnswer = question.answer;

        if (userAnswer === correctAnswer) {
            correctCount++;
            totalScore += question.points;
        } else if (userAnswer !== undefined) {
            wrongCount++;
        }
    });

    const unanswered = state.testQuestions.length - correctCount - wrongCount;
    const accuracy = state.testQuestions.length > 0
        ? Math.round((correctCount / state.testQuestions.length) * 100)
        : 0;

    const timeTaken = Math.floor((state.endTime - state.startTime) / 1000);
    const minutesTaken = Math.floor(timeTaken / 60);
    const secondsTaken = timeTaken % 60;

    return {
        correctCount,
        wrongCount,
        unanswered,
        totalScore,
        maxScore,
        accuracy,
        timeTaken: `${minutesTaken}:${secondsTaken.toString().padStart(2, '0')}`
    };
}

// Display Results
function displayResults(results) {
    document.getElementById('final-score').textContent = results.totalScore;
    document.getElementById('correct-count').textContent = results.correctCount;
    document.getElementById('wrong-count').textContent =
        results.wrongCount + results.unanswered;
    document.getElementById('accuracy').textContent = `${results.accuracy}%`;
    document.getElementById('time-taken').textContent = results.timeTaken;
}

// Show Review
function showReview() {
    // Scroll to top first
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
            imageHTML = `
                <div class="review-image">
                    <img src="${question.image}" alt="Question image">
                </div>
            `;
        }

        const choices = ['A', 'B', 'C', 'D', 'E'];
        let choicesHTML = '';

        choices.forEach(choice => {
            // Skip if choice doesn't exist or is empty string (but allow "0")
            if (question.choices[choice] === undefined ||
                question.choices[choice] === null ||
                (typeof question.choices[choice] === 'string' && question.choices[choice].trim() === '')) {
                return;
            }

            let choiceClass = '';
            if (choice === correctAnswer) {
                choiceClass = 'correct-answer';
            } else if (choice === userAnswer && !isCorrect) {
                choiceClass = 'user-wrong';
            }

            choicesHTML += `
                <div class="review-choice ${choiceClass}">
                    <span class="review-choice-label">${choice})</span>
                    <span>${question.choices[choice]}</span>
                </div>
            `;
        });

        reviewItem.innerHTML = `
            <div class="review-header-info">
                <span class="review-question-num">Question ${index + 1} (${question.points} points)</span>
                <span class="review-result ${isCorrect ? 'correct' : 'wrong'}">
                    ${isCorrect ? '✓ Correct' : userAnswer ? '✗ Wrong' : '✗ Not Answered'}
                </span>
            </div>
            <div class="review-question-text">${question.question}</div>
            ${imageHTML}
            <div class="review-choices">
                ${choicesHTML}
            </div>
            ${!isCorrect ? `<p style="margin-top: 12px; color: var(--success-color); font-weight: 600;">Correct Answer: ${correctAnswer}</p>` : ''}
            ${userAnswer && !isCorrect ? `<p style="margin-top: 4px; color: var(--danger-color);">Your Answer: ${userAnswer}</p>` : ''}
            ${!userAnswer ? `<p style="margin-top: 4px; color: var(--gray-600);">You did not answer this question.</p>` : ''}
        `;

        reviewContent.appendChild(reviewItem);
    });

    // Switch to review screen (this also scrolls to top)
    showScreen('review-screen');
}

// Back to Results
function backToResults() {
    // Switch to results screen (this also scrolls to top)
    showScreen('results-screen');
}

// Retake Test
function retakeTest() {
    if (confirm('Are you sure you want to take a new test? Your current results will be lost.')) {
        // Switch to welcome screen (this also scrolls to top)
        showScreen('welcome-screen');
    }
}

// Scroll to Question Content
function scrollToQuestion() {
    setTimeout(() => {
        const questionContent = document.querySelector('.question-content');
        if (questionContent) {
            questionContent.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, 100);
}

// Scroll to Top of Page
function scrollToTop() {
    // Force immediate scroll to top
    window.scrollTo(0, 0);

    // Also use smooth scroll as backup
    setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 10);
}

// Show Screen
function showScreen(screenId) {
    // First scroll to top
    window.scrollTo(0, 0);

    // Hide all screens
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });

    // Show the target screen
    const targetScreen = document.getElementById(screenId);
    targetScreen.classList.add('active');

    // Force a reflow to ensure the change takes effect
    void targetScreen.offsetHeight;
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', init);
