// Google Analytics default capture for this template.
// Future LLM edits: do not remove this gtag setup unless replacing it with equivalent page analytics capture.
const googleAnalyticsId = "G-ZKTPLMMFDQ";
const storageKey = "metronome-timing-state";

type Subdivision = 1 | 2 | 3 | 4;
type ClickKind = "accent" | "beat" | "subdivision";

export interface MetronomeState {
  bpm: number;
  beatsPerMeasure: number;
  subdivision: Subdivision;
  accentPitch: number;
  clickPitch: number;
  latencyMs: number;
  syncMode: boolean;
  volume: number;
}

interface AppElements {
  accentPitch: HTMLInputElement;
  beatDots: HTMLElement;
  beatsPerMeasure: HTMLSelectElement;
  bpmDisplay: HTMLElement;
  bpmInput: HTMLInputElement;
  bpmSlider: HTMLInputElement;
  clickPitch: HTMLInputElement;
  copyLink: HTMLButtonElement;
  decreaseTempo: HTMLButtonElement;
  increaseTempo: HTMLButtonElement;
  intervalReadout: HTMLElement;
  latencyMs: HTMLInputElement;
  playButton: HTMLButtonElement;
  saveState: HTMLElement;
  subdivision: HTMLSelectElement;
  syncMode: HTMLInputElement;
  tempoName: HTMLElement;
  volume: HTMLInputElement;
}

declare global {
  interface Window {
    dataLayer?: IArguments[];
    gtag?: (...args: unknown[]) => void;
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  }
}

export function createDefaultState(): MetronomeState {
  return {
    bpm: 96,
    beatsPerMeasure: 4,
    subdivision: 1,
    accentPitch: 1320,
    clickPitch: 880,
    latencyMs: 0,
    syncMode: true,
    volume: 0.68,
  };
}

function isSubdivision(value: number): value is Subdivision {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

export function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

type MetronomeStateInput = Partial<Record<keyof MetronomeState, unknown>>;

export function normalizeState(value: MetronomeStateInput = {}): MetronomeState {
  const defaults = createDefaultState();
  const subdivision = Math.round(clampNumber(value.subdivision, 1, 4, defaults.subdivision));

  return {
    bpm: Math.round(clampNumber(value.bpm, 40, 208, defaults.bpm)),
    beatsPerMeasure: Math.round(clampNumber(value.beatsPerMeasure, 2, 12, defaults.beatsPerMeasure)),
    subdivision: isSubdivision(subdivision) ? subdivision : defaults.subdivision,
    accentPitch: Math.round(clampNumber(value.accentPitch, 660, 1760, defaults.accentPitch)),
    clickPitch: Math.round(clampNumber(value.clickPitch, 440, 1320, defaults.clickPitch)),
    latencyMs: Math.round(clampNumber(value.latencyMs, -120, 120, defaults.latencyMs)),
    syncMode: typeof value.syncMode === "boolean" ? value.syncMode : defaults.syncMode,
    volume: clampNumber(value.volume, 0, 1, defaults.volume),
  };
}

export function parseStoredState(storedState: string | null, defaultState: MetronomeState): MetronomeState {
  if (!storedState) return defaultState;

  try {
    const parsed = JSON.parse(storedState) as Partial<MetronomeState>;
    return normalizeState({ ...defaultState, ...parsed });
  } catch {
    return defaultState;
  }
}

export function stateToSearchParams(state: MetronomeState): URLSearchParams {
  const normalized = normalizeState(state);
  const params = new URLSearchParams();
  params.set("bpm", String(normalized.bpm));
  params.set("meter", String(normalized.beatsPerMeasure));
  params.set("sub", String(normalized.subdivision));
  params.set("accent", String(normalized.accentPitch));
  params.set("click", String(normalized.clickPitch));
  params.set("latency", String(normalized.latencyMs));
  params.set("sync", normalized.syncMode ? "1" : "0");
  params.set("volume", String(Math.round(normalized.volume * 100)));
  return params;
}

export function parseSearchParams(search: string, defaultState: MetronomeState): MetronomeState {
  const params = new URLSearchParams(search);
  if (params.toString() === "") return defaultState;

  return normalizeState({
    ...defaultState,
    bpm: params.get("bpm") ?? undefined,
    beatsPerMeasure: params.get("meter") ?? undefined,
    subdivision: params.get("sub") ?? undefined,
    accentPitch: params.get("accent") ?? undefined,
    clickPitch: params.get("click") ?? undefined,
    latencyMs: params.get("latency") ?? undefined,
    syncMode: params.get("sync") === null ? defaultState.syncMode : params.get("sync") !== "0",
    volume: params.get("volume") === null ? defaultState.volume : Number(params.get("volume")) / 100,
  });
}

export function secondsPerBeat(bpm: number): number {
  return 60 / clampNumber(bpm, 40, 208, 96);
}

export function secondsPerStep(state: MetronomeState): number {
  return secondsPerBeat(state.bpm) / state.subdivision;
}

export function stepsPerMeasure(state: MetronomeState): number {
  return state.beatsPerMeasure * state.subdivision;
}

export function getClickKind(stepIndex: number, state: MetronomeState): ClickKind {
  const step = ((stepIndex % stepsPerMeasure(state)) + stepsPerMeasure(state)) % stepsPerMeasure(state);
  if (step === 0) return "accent";
  if (step % state.subdivision === 0) return "beat";
  return "subdivision";
}

export function shouldRenderBeatDots(currentDotCount: number, state: MetronomeState): boolean {
  return currentDotCount !== state.beatsPerMeasure;
}

export function tempoName(bpm: number): string {
  if (bpm < 60) return "Largo";
  if (bpm < 76) return "Adagio";
  if (bpm < 108) return "Andante";
  if (bpm < 120) return "Moderato";
  if (bpm < 168) return "Allegro";
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

function getElement<T extends Element>(selector: string, type: { new (): T }): T {
  const element = document.querySelector(selector);
  if (!(element instanceof type)) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element;
}

function copyText(text: string): boolean {
  const input = document.createElement("textarea");
  input.value = text;
  input.style.position = "fixed";
  input.style.left = "-9999px";
  document.body.append(input);
  input.select();
  const copied = document.execCommand("copy");
  input.remove();

  if (!copied && navigator.clipboard) {
    void navigator.clipboard.writeText(text);
  }

  return copied;
}

function getElements(): AppElements {
  return {
    accentPitch: getElement("#accent-pitch", HTMLInputElement),
    beatDots: getElement("#beat-dots", HTMLElement),
    beatsPerMeasure: getElement("#beats-per-measure", HTMLSelectElement),
    bpmDisplay: getElement("#bpm-display", HTMLElement),
    bpmInput: getElement("#bpm-input", HTMLInputElement),
    bpmSlider: getElement("#bpm-slider", HTMLInputElement),
    clickPitch: getElement("#click-pitch", HTMLInputElement),
    copyLink: getElement("#copy-link", HTMLButtonElement),
    decreaseTempo: getElement("#decrease-tempo", HTMLButtonElement),
    increaseTempo: getElement("#increase-tempo", HTMLButtonElement),
    intervalReadout: getElement("#interval-readout", HTMLElement),
    latencyMs: getElement("#latency-ms", HTMLInputElement),
    playButton: getElement("#play-button", HTMLButtonElement),
    saveState: getElement("#save-state", HTMLElement),
    subdivision: getElement("#subdivision", HTMLSelectElement),
    syncMode: getElement("#sync-mode", HTMLInputElement),
    tempoName: getElement("#tempo-name", HTMLElement),
    volume: getElement("#volume", HTMLInputElement),
  };
}

function initializeApp() {
  initializeGoogleAnalytics();

  const elements = getElements();
  let state = parseSearchParams(window.location.search, parseStoredState(localStorage.getItem(storageKey), createDefaultState()));
  let audioContext: AudioContext | undefined;
  let currentStep = 0;
  let isRunning = false;
  let nextClickTime = 0;
  let schedulerId: number | undefined;
  let saveTimer: number | undefined;

  function saveState() {
    localStorage.setItem(storageKey, JSON.stringify(state));
    window.history.replaceState(null, "", `${window.location.pathname}?${stateToSearchParams(state).toString()}`);
    elements.saveState.textContent = "Saved";
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      elements.saveState.textContent = "Local";
    }, 1400);
  }

  function updateState(patch: Partial<MetronomeState>) {
    state = normalizeState({ ...state, ...patch });
    saveState();
    if (isRunning && state.syncMode) {
      alignSyncedSchedule(ensureAudioContext());
    }
    render();
  }

  function ensureAudioContext(): AudioContext {
    const AudioConstructor = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioConstructor) {
      throw new Error("Web Audio API unavailable");
    }

    audioContext = audioContext ?? new AudioConstructor();
    return audioContext;
  }

  function scheduleClick(time: number, kind: ClickKind, step: number) {
    const context = ensureAudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const isAccent = kind === "accent";
    const isSubdivision = kind === "subdivision";

    oscillator.type = isSubdivision ? "sine" : "square";
    oscillator.frequency.setValueAtTime(
      isAccent ? state.accentPitch : isSubdivision ? state.clickPitch * 0.55 : state.clickPitch,
      time,
    );
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

  function alignSyncedSchedule(context: AudioContext) {
    const stepMs = secondsPerStep(state) * 1000;
    const nowWallMs = performance.timeOrigin + performance.now() + state.latencyMs;
    const remainderMs = nowWallMs % stepMs;
    const waitMs = remainderMs === 0 ? 0 : stepMs - remainderMs;
    const targetWallMs = nowWallMs + waitMs;

    nextClickTime = context.currentTime + waitMs / 1000 + 0.035;
    currentStep = Math.floor(targetWallMs / stepMs) % stepsPerMeasure(state);
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
    if (state.syncMode) {
      alignSyncedSchedule(context);
    } else {
      currentStep = 0;
      nextClickTime = context.currentTime + 0.05;
    }
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

  function markStep(step: number, kind: ClickKind) {
    if (!isRunning) return;
    const dotIndex = Math.floor(step / state.subdivision);
    elements.beatDots.querySelectorAll(".beat-dot").forEach((dot, index) => {
      dot.classList.toggle("active", index === dotIndex);
      dot.classList.toggle("accent", index === dotIndex && kind === "accent");
    });
  }

  function renderBeatDots() {
    if (!shouldRenderBeatDots(elements.beatDots.childElementCount, state)) {
      return;
    }

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
    elements.latencyMs.value = String(state.latencyMs);
    elements.syncMode.checked = state.syncMode;
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
  elements.subdivision.addEventListener("change", () => updateState({ subdivision: Number(elements.subdivision.value) as Subdivision }));
  elements.accentPitch.addEventListener("input", () => updateState({ accentPitch: Number(elements.accentPitch.value) }));
  elements.clickPitch.addEventListener("input", () => updateState({ clickPitch: Number(elements.clickPitch.value) }));
  elements.latencyMs.addEventListener("input", () => updateState({ latencyMs: Number(elements.latencyMs.value) }));
  elements.syncMode.addEventListener("change", () => updateState({ syncMode: elements.syncMode.checked }));
  elements.volume.addEventListener("input", () => updateState({ volume: Number(elements.volume.value) / 100 }));
  elements.copyLink.addEventListener("click", () => {
    const url = `${window.location.origin}${window.location.pathname}?${stateToSearchParams(state).toString()}`;
    elements.copyLink.textContent = copyText(url) ? "Copied" : "Copy failed";
    window.setTimeout(() => {
      elements.copyLink.textContent = "Copy link";
    }, 1400);
  });

  render();
}

if (typeof document !== "undefined") {
  initializeApp();
}
