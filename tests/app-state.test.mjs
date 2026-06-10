import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  clampNumber,
  createDefaultState,
  getClickKind,
  normalizeState,
  parseSearchParams,
  parseStoredState,
  secondsPerBeat,
  secondsPerStep,
  stateToSearchParams,
  stepsPerMeasure,
  tempoName,
} from "../public/app.js";

test("default metronome state matches release controls", () => {
  assert.deepEqual(createDefaultState(), {
    bpm: 96,
    beatsPerMeasure: 4,
    subdivision: 1,
    accentPitch: 1320,
    clickPitch: 880,
    latencyMs: 0,
    syncMode: true,
    volume: 0.68,
  });
});

test("stored state is parsed and clamped to supported ranges", () => {
  const stored = JSON.stringify({
    bpm: 260,
    beatsPerMeasure: 1,
    subdivision: 3,
    accentPitch: 2000,
    clickPitch: 120,
    latencyMs: 240,
    syncMode: false,
    volume: 2,
  });

  assert.deepEqual(parseStoredState(stored, createDefaultState()), {
    bpm: 208,
    beatsPerMeasure: 2,
    subdivision: 3,
    accentPitch: 1760,
    clickPitch: 440,
    latencyMs: 120,
    syncMode: false,
    volume: 1,
  });
});

test("invalid stored state falls back to defaults", () => {
  const defaultState = createDefaultState();

  assert.equal(parseStoredState("{", defaultState), defaultState);
});

test("timing helpers calculate beat, step, and measure cadence", () => {
  const state = normalizeState({ bpm: 120, beatsPerMeasure: 3, subdivision: 2 });

  assert.equal(secondsPerBeat(120), 0.5);
  assert.equal(secondsPerStep(state), 0.25);
  assert.equal(stepsPerMeasure(state), 6);
});

test("share links round-trip timing coordination state", () => {
  const state = normalizeState({
    bpm: 144,
    beatsPerMeasure: 7,
    subdivision: 4,
    accentPitch: 1500,
    clickPitch: 700,
    latencyMs: -42,
    syncMode: true,
    volume: 0.5,
  });

  const params = stateToSearchParams(state);

  assert.equal(params.get("bpm"), "144");
  assert.equal(params.get("meter"), "7");
  assert.equal(params.get("latency"), "-42");
  assert.deepEqual(parseSearchParams(`?${params.toString()}`, createDefaultState()), state);
});

test("click pattern accents measure starts and marks subdivisions", () => {
  const state = normalizeState({ beatsPerMeasure: 4, subdivision: 2 });

  assert.equal(getClickKind(0, state), "accent");
  assert.equal(getClickKind(1, state), "subdivision");
  assert.equal(getClickKind(2, state), "beat");
  assert.equal(getClickKind(8, state), "accent");
});

test("number normalization and tempo labels are stable", () => {
  assert.equal(clampNumber("bad", 1, 4, 3), 3);
  assert.equal(clampNumber(10, 1, 4, 3), 4);
  assert.equal(tempoName(55), "Largo");
  assert.equal(tempoName(96), "Andante");
  assert.equal(tempoName(180), "Presto");
});

test("served files do not reference disallowed providers or tooling", async () => {
  const servedFiles = [
    "public/app.js",
    "public/humans.txt",
    "public/index.html",
    "public/llm.txt",
  ];

  for (const file of servedFiles) {
    const content = await readFile(file, "utf8");
    assert.doesNotMatch(content, /\bgit\b|cloudflare/i, file);
  }
});
