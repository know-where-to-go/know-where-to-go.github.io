import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { points } from "../assets/accuracy-plot-data.js";
import { correlation, filterPoints, plotLayout, rolloutTarget } from "../assets/accuracy-plot.js";

test("point details omit navigation record and episode statistics", async () => {
  const source = await readFile(new URL("../assets/accuracy-plot.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /Eligible navigation records|Evaluation episodes/);
  assert.match(source, /Navigation-hint bearing accuracy/);
  assert.match(source, /Placement rate/);
});

test("plot data contains the exact 18 aggregate points and reproduces the paper correlation", () => {
  assert.equal(points.length, 18);
  assert.equal(new Set(points.map(point => point.id)).size, 18);
  assert.equal(correlation(points).toFixed(2), "0.89");
  for (const point of points) {
    assert.equal(point.episodes, 200);
    assert.ok(Number.isInteger(point.hintQueries) && point.hintQueries > 0);
    assert.ok(Number.isInteger(point.correctHints) && point.correctHints <= point.hintQueries);
    assert.equal(point.hintAccuracy, 100 * point.correctHints / point.hintQueries);
    assert.equal(point.privileged, point.planner === "q3d-gt");
  }
  const estimatedHard = points.find(point => point.id === "q3d-est-hard");
  assert.equal(estimatedHard.placementRate.toFixed(1), "24.8");
  assert.equal(estimatedHard.hintAccuracy.toFixed(2), "45.45");
  assert.equal(estimatedHard.hintQueries, 21358);
});

test("setting and planner filters compose while retaining the GT variant", () => {
  assert.equal(filterPoints(points).length, 18);
  for (const setting of ["seen", "easy", "hard"]) {
    assert.equal(filterPoints(points, { setting }).length, 6);
    assert.equal(filterPoints(points, { setting }).filter(point => point.privileged).length, 1);
  }
  assert.equal(filterPoints(points, { planner: "v3r" }).length, 3);
  assert.equal(filterPoints(points, { planner: "v3r", setting: "hard" })[0].id, "v3r-hard");
  assert.equal(filterPoints(points, { planner: "q3d-gt" }).length, 3);
});

test("filtered correlations are reported only when mathematically defined", () => {
  assert.equal(correlation([]), null);
  assert.equal(correlation(points.slice(0, 2)), null);
  assert.equal(correlation(Array.from({ length: 3 }, () => ({ hintAccuracy: 20, placementRate: 30 }))), null);
  assert.equal(correlation([
    { hintAccuracy: 20, placementRate: 10 },
    { hintAccuracy: 40, placementRate: 20 },
    { hintAccuracy: 60, placementRate: 30 },
  ]), 1);
});

test("only the matching published Unseen-Hard planner examples receive rollout links", () => {
  const links = points.map(rolloutTarget).filter(Boolean);
  assert.deepEqual(links, ["rollout-stock", "rollout-v3r", "rollout-q3d-gt"]);
  assert.equal(rolloutTarget(points.find(point => point.id === "q3d-est-hard")), null);
  assert.equal(rolloutTarget(points.find(point => point.id === "v3r-seen")), null);
});

test("responsive plot coordinates preserve fixed scientific axes and chance line", () => {
  for (const width of [280, 320, 600, 760, 1200]) {
    const layout = plotLayout(width);
    assert.equal(layout.x(10), layout.left);
    assert.equal(layout.y(40), layout.top);
    assert.equal(layout.y(10), layout.top + layout.plotHeight);
    assert.ok(layout.x(18.75) > layout.left);
    assert.ok(layout.x(82) < layout.width);
    for (const point of points) {
      assert.ok(layout.x(point.hintAccuracy) >= layout.left && layout.x(point.hintAccuracy) <= layout.x(82));
      assert.ok(layout.y(point.placementRate) >= layout.top && layout.y(point.placementRate) <= layout.y(10));
    }
  }
});
