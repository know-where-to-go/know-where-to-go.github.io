import assert from "node:assert/strict";
import test from "node:test";
import {
  bearingIsWrong, bearingBinWidth, encodingFilter, matchEpisodes, parseCaptions, tintIntervals,
} from "../tools/prepare-paired-rollouts.mjs";

const navigation = "navigate to the plate (3.0 m, 0.00 rad)";
const cues = [
  { start: 0, end: 16, text: "grasp the pan" },
  { start: 16, end: 64, text: navigation },
  { start: 64, end: 96, text: "place the pan on the dining table" },
];
const record = (step, angle, oracle = 0) => ({
  step_idx: step, subtask: navigation, pred_angle_rad: angle, oracle_bin_angle_rad: oracle,
});
const probe = (...records) => [{ type: "episode", n_records: records.length }, ...records];

test("bearing tint uses circular 16-bin distance rather than rounded radian differences", () => {
  assert.equal(bearingIsWrong(record(16, 0)), false);
  assert.equal(bearingIsWrong(record(16, bearingBinWidth)), false);
  assert.equal(bearingIsWrong(record(16, 0.79, 0.3927)), false);
  assert.equal(bearingIsWrong(record(16, 1.18, 0.7854)), false);
  assert.equal(bearingIsWrong(record(16, -3.14, 2.7489)), false);
  assert.equal(bearingIsWrong(record(16, 2 * Math.PI + 0.79, 0.3927)), false);
  assert.equal(bearingIsWrong(record(16, bearingBinWidth * 2)), true);
  assert.equal(bearingIsWrong(record(16, -bearingBinWidth * 2)), true);
  assert.equal(bearingIsWrong(record(16, 179 * Math.PI / 180, -179 * Math.PI / 180)), false);
  assert.equal(bearingIsWrong(record(16, 0, Math.PI)), true);
  assert.equal(bearingIsWrong(record(16, null)), null);
  assert.equal(bearingIsWrong(record(16, 0, null)), null);
  assert.throws(() => bearingIsWrong(record(16, NaN)), /finite/);
});

test("all rounded predicted-bin pairs preserve their intended one-bin relationships", () => {
  for (let predicted = -8; predicted < 8; predicted += 1) {
    for (let oracle = -8; oracle < 8; oracle += 1) {
      const difference = Math.abs(predicted - oracle);
      const expected = Math.min(difference, 16 - difference) > 1;
      const sample = record(16, Number((predicted * bearingBinWidth).toFixed(2)),
        Number((oracle * bearingBinWidth).toFixed(4)));
      assert.equal(bearingIsWrong(sample), expected, `Bins ${predicted} and ${oracle}`);
    }
  }
});
test("error tint updates at every model call and stops at manipulation transitions", () => {
  const result = tintIntervals(probe(record(16, 1), record(32, 0), record(48, 1)), cues);
  assert.deepEqual(result.intervals, [{ start: 16, end: 32 }, { start: 48, end: 64 }]);
  assert.deepEqual(result.counts, { correct: 1, wrong: 2, unscored: 0 });
  assert.deepEqual(tintIntervals(probe(record(16, 1), record(32, 1), record(48, 1)), cues).intervals,
    [{ start: 16, end: 64 }]);
});

test("unresolved hints remain unscored, not colored or counted as correct", () => {
  const result = tintIntervals(probe(record(16, 1), record(32, 0, null), record(48, 1)), cues);
  assert.deepEqual(result.intervals, [{ start: 16, end: 32 }, { start: 48, end: 64 }]);
  assert.deepEqual(result.counts, { correct: 0, wrong: 2, unscored: 1 });
});

test("caption rounding aligns to source frame indices and decodes escaped text", () => {
  const text = "WEBVTT\n\n1\n00:00:00.000 --> 00:00:03.733 line:5% align:center\ngrasp &lt;pan&gt;\n\n2\n00:00:03.733 --> 00:00:05.333\nnavigate to the plate\n";
  assert.deepEqual(parseCaptions(text, 30, 160), [
    { start: 0, end: 112, text: "grasp <pan>" },
    { start: 112, end: 160, text: "navigate to the plate" },
  ]);
  assert.throws(() => parseCaptions(text, 30, 161), /entire video/);
  assert.throws(() => parseCaptions(text.replace("grasp &lt;pan&gt;", "https://example.test/private"), 30, 160),
    /identifying/);
});

test("missing or misaligned probe records fail rather than tinting guessed intervals", () => {
  assert.throws(() => tintIntervals(probe(record(32, 1)), cues), /begin at a recorded/);
  assert.throws(() => tintIntervals(probe({ ...record(16, 1), subtask: "navigate to another target" }), cues),
    /disagree/);
  assert.throws(() => tintIntervals([{ type: "episode", n_records: 2 }, record(16, 1)], cues), /Incomplete/);
  assert.throws(() => tintIntervals(probe(record(16, 1), record(16, 1)), cues), /strictly increasing/);
});

test("FFmpeg scores half-open original-frame intervals before 4x acceleration", () => {
  const filter = encodingFilter([{ start: 16, end: 32 }, { start: 48, end: 64 }]);
  assert.match(filter, /between\(n,16,31\)\+between\(n,48,63\)/);
  assert.ok(filter.indexOf("drawbox") < filter.indexOf("setpts="));
  assert.match(filter, /red@0\.12/);
  assert.match(filter, /setpts=\(PTS-STARTPTS\)\/4,fps=30/);
  assert.match(filter, /text='4x'/);
  assert.doesNotMatch(encodingFilter([]), /drawbox/);
});

test("paired episodes must have the same complete recorded initial-state identity", () => {
  const identity = {
    suite_name: "suite", task_name: "task", split: "hard", trial_idx: 1,
    seed: 123, control_mode: "eef", layout_id: 86, style_id: 19,
  };
  const episode = () => ({
    path: "suite/task/0001", outcome: { status: "ok",
      debug_info: { initial_state_identity: { ...identity }, instruction: "Pick up the pan." } },
  });
  const sets = [[episode()], [episode()], [episode()]];
  assert.equal(matchEpisodes(sets, "/task/0001").length, 3);
  sets[2][0].outcome.debug_info.initial_state_identity.seed += 1;
  assert.throws(() => matchEpisodes(sets, "/task/0001"), /same initial state/);
  assert.throws(() => matchEpisodes([[episode()], [episode()]], "/task/0001"), /all three/);
});
