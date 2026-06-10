// Google Analytics default capture for this template.
// Future LLM edits: do not remove this gtag setup unless replacing it with equivalent page analytics capture.
const googleAnalyticsId = "G-ZKTPLMMFDQ";
const storageKey = "metronome-timing-state";
export function createDefaultState() {
    return {
        bpm: 96,
        beatsPerMeasure: 4,
        subdivision: 1,
        accentPitch: 1320,
        clickPitch: 880,
        volume: 0.68,
    };
}
function isSubdivision(value) {
    return value === 1 || value === 2 || value === 3 || value === 4;
}
export function clampNumber(value, min, max, fallback) {
    const numeric = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numeric))
        return fallback;
    return Math.min(max, Math.max(min, numeric));
}
export function normalizeState(value = {}) {
    const defaults = createDefaultState();
    const subdivision = Math.round(clampNumber(value.subdivision, 1, 4, defaults.subdivision));
    return {
        bpm: Math.round(clampNumber(value.bpm, 40, 208, defaults.bpm)),
        beatsPerMeasure: Math.round(clampNumber(value.beatsPerMeasure, 2, 12, defaults.beatsPerMeasure)),
        subdivision: isSubdivision(subdivision) ? subdivision : defaults.subdivision,
        accentPitch: Math.round(clampNumber(value.accentPitch, 660, 1760, defaults.accentPitch)),
        clickPitch: Math.round(clampNumber(value.clickPitch, 440, 1320, defaults.clickPitch)),
        volume: clampNumber(value.volume, 0, 1, defaults.volume),
    };
}
export function parseStoredState(storedState, defaultState) {
    if (!storedState)
        return defaultState;
    try {
        const parsed = JSON.parse(storedState);
        return normalizeState({ ...defaultState, ...parsed });
    }
    catch {
        return defaultState;
    }
}
export function secondsPerBeat(bpm) {
    return 60 / clampNumber(bpm, 40, 208, 96);
}
export function secondsPerStep(state) {
    return secondsPerBeat(state.bpm) / state.subdivision;
}
export function stepsPerMeasure(state) {
    return state.beatsPerMeasure * state.subdivision;
}
export function getClickKind(stepIndex, state) {
    const step = ((stepIndex % stepsPerMeasure(state)) + stepsPerMeasure(state)) % stepsPerMeasure(state);
    if (step === 0)
        return "accent";
    if (step % state.subdivision === 0)
        return "beat";
    return "subdivision";
}
export function tempoName(bpm) {
    if (bpm < 60)
        return "Largo";
    if (bpm < 76)
        return "Adagio";
    if (bpm < 108)
        return "Andante";
    if (bpm < 120)
        return "Moderato";
    if (bpm < 168)
        return "Allegro";
    return "Presto";
}
function initializeGoogleAnalytics() {
    const googleTagScript = document.createElement("script");
    googleTagScript.async = true;
    googleTagScript.src = `https://www.googletagmanager.com/gtag/js?id=${googleAnalyticsId}`;
    document.head.append(googleTagScript);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() {
        window.dataLayer?.push(arguments);
    };
    window.gtag("js", new Date());
    window.gtag("config", googleAnalyticsId);
}
function getElement(selector, type) {
    const element = document.querySelector(selector);
    if (!(element instanceof type)) {
        throw new Error(`Missing required element: ${selector}`);
    }
    return element;
}
function getElements() {
    return {
        accentPitch: getElement("#accent-pitch", HTMLInputElement),
        beatDots: getElement("#beat-dots", HTMLElement),
        beatsPerMeasure: getElement("#beats-per-measure", HTMLSelectElement),
        bpmDisplay: getElement("#bpm-display", HTMLElement),
        bpmInput: getElement("#bpm-input", HTMLInputElement),
        bpmSlider: getElement("#bpm-slider", HTMLInputElement),
        clickPitch: getElement("#click-pitch", HTMLInputElement),
        decreaseTempo: getElement("#decrease-tempo", HTMLButtonElement),
        increaseTempo: getElement("#increase-tempo", HTMLButtonElement),
        intervalReadout: getElement("#interval-readout", HTMLElement),
        playButton: getElement("#play-button", HTMLButtonElement),
        saveState: getElement("#save-state", HTMLElement),
        subdivision: getElement("#subdivision", HTMLSelectElement),
        tempoName: getElement("#tempo-name", HTMLElement),
        volume: getElement("#volume", HTMLInputElement),
    };
}
function initializeApp() {
    initializeGoogleAnalytics();
    const elements = getElements();
    let state = parseStoredState(localStorage.getItem(storageKey), createDefaultState());
    let audioContext;
    let currentStep = 0;
    let isRunning = false;
    let nextClickTime = 0;
    let schedulerId;
    let saveTimer;
    function saveState() {
        localStorage.setItem(storageKey, JSON.stringify(state));
        elements.saveState.textContent = "Saved";
        window.clearTimeout(saveTimer);
        saveTimer = window.setTimeout(() => {
            elements.saveState.textContent = "Local";
        }, 1400);
    }
    function updateState(patch) {
        state = normalizeState({ ...state, ...patch });
        saveState();
        render();
    }
    function ensureAudioContext() {
        const AudioConstructor = window.AudioContext ?? window.webkitAudioContext;
        if (!AudioConstructor) {
            throw new Error("Web Audio API unavailable");
        }
        audioContext = audioContext ?? new AudioConstructor();
        return audioContext;
    }
    function scheduleClick(time, kind, step) {
        const context = ensureAudioContext();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const isAccent = kind === "accent";
        const isSubdivision = kind === "subdivision";
        oscillator.type = isSubdivision ? "sine" : "square";
        oscillator.frequency.setValueAtTime(isAccent ? state.accentPitch : isSubdivision ? state.clickPitch * 0.55 : state.clickPitch, time);
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.001, state.volume), time + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + (isSubdivision ? 0.035 : 0.055));
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(time);
        oscillator.stop(time + 0.07);
        const delay = Math.max(0, (time - context.currentTime) * 1000);
        window.setTimeout(() => markStep(step, kind), delay);
    }
    function scheduler() {
        const context = ensureAudioContext();
        const lookaheadSeconds = 0.1;
        while (nextClickTime < context.currentTime + lookaheadSeconds) {
            const step = currentStep;
            scheduleClick(nextClickTime, getClickKind(step, state), step);
            nextClickTime += secondsPerStep(state);
            currentStep = (currentStep + 1) % stepsPerMeasure(state);
        }
    }
    function start() {
        const context = ensureAudioContext();
        context.resume();
        isRunning = true;
        currentStep = 0;
        nextClickTime = context.currentTime + 0.05;
        schedulerId = window.setInterval(scheduler, 25);
        scheduler();
        render();
    }
    function stop() {
        isRunning = false;
        window.clearInterval(schedulerId);
        schedulerId = undefined;
        currentStep = 0;
        elements.beatDots.querySelectorAll(".beat-dot").forEach((dot) => dot.classList.remove("active", "accent"));
        render();
    }
    function markStep(step, kind) {
        if (!isRunning)
            return;
        const dotIndex = Math.floor(step / state.subdivision);
        elements.beatDots.querySelectorAll(".beat-dot").forEach((dot, index) => {
            dot.classList.toggle("active", index === dotIndex);
            dot.classList.toggle("accent", index === dotIndex && kind === "accent");
        });
    }
    function renderBeatDots() {
        elements.beatDots.replaceChildren();
        for (let index = 0; index < state.beatsPerMeasure; index += 1) {
            const dot = document.createElement("span");
            dot.className = "beat-dot";
            dot.ariaLabel = `Beat ${index + 1}`;
            elements.beatDots.append(dot);
        }
    }
    function render() {
        document.title = "Metronome Timing";
        elements.bpmDisplay.textContent = String(state.bpm);
        elements.bpmInput.value = String(state.bpm);
        elements.bpmSlider.value = String(state.bpm);
        elements.beatsPerMeasure.value = String(state.beatsPerMeasure);
        elements.subdivision.value = String(state.subdivision);
        elements.accentPitch.value = String(state.accentPitch);
        elements.clickPitch.value = String(state.clickPitch);
        elements.volume.value = String(Math.round(state.volume * 100));
        elements.tempoName.textContent = tempoName(state.bpm);
        elements.intervalReadout.textContent = `${Math.round(secondsPerStep(state) * 1000)} ms`;
        elements.playButton.textContent = isRunning ? "Stop" : "Start";
        elements.playButton.setAttribute("aria-pressed", String(isRunning));
        renderBeatDots();
    }
    elements.playButton.addEventListener("click", () => {
        if (isRunning) {
            stop();
            return;
        }
        start();
    });
    elements.bpmSlider.addEventListener("input", () => updateState({ bpm: Number(elements.bpmSlider.value) }));
    elements.bpmInput.addEventListener("input", () => updateState({ bpm: Number(elements.bpmInput.value) }));
    elements.decreaseTempo.addEventListener("click", () => updateState({ bpm: state.bpm - 1 }));
    elements.increaseTempo.addEventListener("click", () => updateState({ bpm: state.bpm + 1 }));
    elements.beatsPerMeasure.addEventListener("change", () => updateState({ beatsPerMeasure: Number(elements.beatsPerMeasure.value) }));
    elements.subdivision.addEventListener("change", () => updateState({ subdivision: Number(elements.subdivision.value) }));
    elements.accentPitch.addEventListener("input", () => updateState({ accentPitch: Number(elements.accentPitch.value) }));
    elements.clickPitch.addEventListener("input", () => updateState({ clickPitch: Number(elements.clickPitch.value) }));
    elements.volume.addEventListener("input", () => updateState({ volume: Number(elements.volume.value) / 100 }));
    render();
}
if (typeof document !== "undefined") {
    initializeApp();
}
