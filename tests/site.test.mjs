import assert from "node:assert/strict";
import { readFile, access, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import vm from "node:vm";
import { spawn } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const html = await readFile(resolve(root, "index.html"), "utf8");
const spatialExamples = {
  molmo: { tour: "spatial-molmo", query: "spatial-molmo", duration: 8 },
  robo: { tour: "spatial-robo-l90-t29", query: "spatial-robo-l90-t29-q2", duration: 6 },
};

function mp4Duration(file) {
  function findBox(buffer, target) {
    for (let offset = 0; offset + 8 <= buffer.length;) {
      const size = buffer.readUInt32BE(offset);
      assert.ok(size >= 8 && offset + size <= buffer.length, "Invalid MP4 box");
      if (buffer.toString("ascii", offset + 4, offset + 8) === target) {
        return buffer.subarray(offset + 8, offset + size);
      }
      offset += size;
    }
    assert.fail(`Missing MP4 ${target} box`);
  }
  const header = findBox(findBox(file, "moov"), "mvhd");
  const version = header[0];
  assert.ok(version === 0 || version === 1);
  const timescale = header.readUInt32BE(version === 1 ? 20 : 12);
  const ticks = version === 1 ? Number(header.readBigUInt64BE(24)) : header.readUInt32BE(16);
  return ticks / timescale;
}

test("all local page resources and navigation targets exist", async () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, "Duplicate HTML ids");
  for (const [, resource] of html.matchAll(/\b(?:src|href|poster)="([^"]+)"/g)) {
    if (resource.startsWith("#")) {
      assert.ok(ids.includes(resource.slice(1)), `Missing anchor: ${resource}`);
    } else {
      assert.ok(!resource.includes(":"), `Unexpected external resource: ${resource}`);
      await access(resolve(root, resource));
    }
  }
});

test("double-blind draft has no identifying metadata or explicit anonymity labels", () => {
  assert.doesNotMatch(html, /<meta[^>]+(?:author|creator)|application\/ld\+json|mailto:|https?:\/\/|\.pdf\b/i);
  assert.doesNotMatch(html, /anonymous|anonymity|double.blind/i);
  assert.match(html, /<title>Knowing Where to Go<\/title>/);
  assert.match(html, /Motivating experiment, not our learned planner/);
  assert.match(html, /It is not full-task success/);
});

test("page leads with the paper title and abstract rather than promotional callouts", () => {
  assert.match(html, /<h1 id="hero-title">Knowing Where to Go: Generalizing Mobile Manipulation to Unseen Environments from a Single Video<\/h1>/);
  assert.match(html, /<h2 id="abstract-title">Abstract<\/h2>/);
  assert.ok(html.indexOf('id="abstract"') < html.indexOf('id="insight"'));
  assert.doesNotMatch(html, /class="tour-panel"|class="tour-filmstrip"|src="assets\/tour-\d\.jpg"/);
  assert.match(html, /strong in-distribution spatial prediction can be a poor predictor of out-of-distribution transfer/);
  assert.match(html, /24\.8% vs\. 10\.9%/);
  assert.doesNotMatch(html, /class="(?:hero-actions|hero-takeaway|headline-stat|result-takeaways)"|<h[12][^>]*>[^<]*<em>/);
  assert.match(html, /<details class="full-results" open>/);
  assert.doesNotMatch(html, /forthcoming|pending|will be added|when available|class="(?:release-note|resource-note)"/i);
});

test("method recreates the paper's planner-executor figure with HTML", () => {
  assert.match(html, /<figure class="method-figure">/);
  assert.match(html, /class="architecture-panel architecture-planner"/);
  assert.match(html, /class="architecture-panel architecture-executor"/);
  assert.match(html, /<div class="architecture-model">Spatial VLM<\/div>/);
  assert.match(html, /<div class="architecture-model">VLA<\/div>/);
  assert.match(html, /class="architecture-handoff"/);
  assert.match(html, /class="proprio-vector"[^>]+aria-label="Current proprioceptive state vector"/);
  assert.match(html, /class="action-chunk"[^>]+aria-label="Predicted action chunk"/);
  assert.match(html, /class="method-figure-scroll"[^>]*tabindex="0"/);
  assert.doesNotMatch(html, /method-architecture\.png|class="pipeline/);
});

test("each architecture connector has its own visible arrowhead", () => {
  for (const panel of ["planner", "executor"]) {
    const paths = [...html.matchAll(new RegExp(`<path d="([^"]+)" marker-end="url\\(#${panel}-arrow\\)"`, "g"))];
    assert.equal(paths.length, 8, `${panel} should have eight individually marked connectors`);
    for (const [, path] of paths) {
      assert.equal((path.match(/M/gi) ?? []).length, 1, "Disconnected subpaths need separate marker-end attributes");
    }
    assert.match(html, new RegExp(`<marker id="${panel}-arrow"[^>]+markerUnits="userSpaceOnUse"`));
  }
});

test("results include the paper's accuracy-placement plot with metric and geometry labels", () => {
  const figure = html.match(/<figure id="accuracy-placement"[\s\S]*?<\/figure>/)?.[0];
  assert.ok(figure);
  assert.match(figure, /src="assets\/hint-accuracy-placement\.png"/);
  assert.match(figure, /aria-describedby="accuracy-placement-caption"/);
  assert.match(figure, /18 planner-setting pairs \(Pearson <i>r<\/i> = 0\.89\)/);
  assert.match(figure, /16 bins total/);
  assert.match(figure, /chance accuracy \(18\.8%\)/);
  assert.match(figure, /open stars use privileged ground-truth tour geometry/);
  assert.match(figure, /href="assets\/hint-accuracy-placement\.png"/);
  assert.match(figure, /id="accuracy-interactive" hidden/);
  assert.match(figure, /id="accuracy-scatter" role="group"/);
  assert.match(figure, /data-scatter-setting="hard"/);
  assert.match(figure, /id="scatter-planner"/);
  assert.doesNotMatch(figure, /scatter-include-gt|type="checkbox"/);
  assert.match(figure, /id="scatter-details" class="scatter-details" aria-live="polite"/);
  assert.match(html, /type="module" src="assets\/accuracy-plot\.js"/);
});

test("closing section contains paper-grounded takeaways instead of limitations", () => {
  assert.match(html, /href="#takeaways">Takeaways<\/a>/);
  const section = html.match(/<section id="takeaways"[\s\S]*?<\/section>/)?.[0];
  assert.ok(section);
  assert.match(section, /<h2 id="takeaways-title">Takeaways<\/h2>/);
  assert.equal((section.match(/<li>/g) ?? []).length, 4);
  assert.match(section, /simulated multi-room environments/);
  assert.match(section, /In-distribution spatial accuracy does not reliably predict transfer/);
  assert.match(section, /Pearson <i>r<\/i> = 0\.89/);
  assert.match(section, /privileged comparison/);
  assert.doesNotMatch(html, /id="scope"|Assumptions and limitations|What the setup assumes|What remains open/);
});

test("probing section contains three local, non-autoplay rollouts with selection context", () => {
  const section = html.match(/<div id="probe-videos"[\s\S]*?<\/section>/)?.[0];
  assert.ok(section);
  assert.equal((section.match(/<video /g) ?? []).length, 3);
  for (const method of ["xr1", "flat", "oracle"]) {
    assert.match(section, new RegExp(`src="assets/videos/probe-${method}-trial1-4x\\.mp4"`));
    assert.match(section, new RegExp(`poster="assets/videos/probe-${method}-trial1-4x-poster\\.png"`));
  }
  assert.doesNotMatch(section, /autoplay|\bloop\b/);
  assert.match(section, /same saved scene/);
  assert.match(section, /ServeSteak, trial 1, Unseen-Hard/);
  assert.match(section, /selected to show XR-1's movement/);
  assert.match(section, /explores the kitchen and decoy room/);
  assert.match(section, /reaches the dining room but does not complete the task/);
  assert.match(section, /not a random sample/);
  assert.match(section, /shown at 4&times; speed/);
  assert.doesNotMatch(section, /\d+ of \d+ placements completed|original 30 fps|without an added speed-up/);
  assert.doesNotMatch(section, /download|<a\b|paper's teaser|oracle-guided success/i);
  assert.match(section, /not the learned spatial planner/);
});

test("sample tours are playable videos in the method section, not hero stills or rollouts", () => {
  const method = html.slice(html.indexOf('id="method"'), html.indexOf('id="representations"'));
  assert.match(method, /<div id="tour-videos" class="video-section" data-video-section="tour">/);
  assert.ok(method.indexOf('id="tour-videos"') > method.indexOf('class="method-note"'));
  assert.equal((method.match(/<video /g) ?? []).length, 3);
  for (const setting of ["seen", "easy", "hard"]) {
    assert.match(method, new RegExp(`src="assets/videos/tour-${setting}\\.mp4"`));
    assert.match(method, new RegExp(`poster="assets/videos/tour-${setting}-poster\\.png"`));
    assert.match(method, new RegExp(`aria-describedby="tour-${setting}-caption"`));
  }
  assert.match(method, /they are not robot task rollouts/);
  assert.match(method, /original playback speed/);
  assert.match(method, /rollout videos above remain at 4&times; speed/);
  assert.match(method, /id="tour-video-error" class="media-error" role="alert" hidden/);
  assert.doesNotMatch(method, /autoplay|\bloop\b|download|<a\b/i);
});

test("rollout files are encoded at four times the source speed", async () => {
  const sourceDurations = { xr1: 70, flat: 70, oracle: 70 };
  for (const [method, sourceDuration] of Object.entries(sourceDurations)) {
    const file = await readFile(resolve(root, `assets/videos/probe-${method}-trial1-4x.mp4`));
    assert.ok(Math.abs(mp4Duration(file) - sourceDuration / 4) <= 1 / 30 + 0.001, `${method}: incorrect 4x duration`);
  }
});

test("tour videos preserve their original six-second duration", async () => {
  for (const setting of ["seen", "easy", "hard"]) {
    const file = await readFile(resolve(root, `assets/videos/tour-${setting}.mp4`));
    assert.equal(mp4Duration(file), 6, `${setting}: tour playback must not be accelerated`);
  }
});

test("paired rollout markup uses independent native controls without fullscreen buttons", async () => {
  const section = html.slice(html.indexOf('<div id="paired-rollouts"'), html.indexOf('<figure id="accuracy-placement"'));
  assert.ok(section);
  assert.ok(html.indexOf('id="paired-rollouts"') < html.indexOf('id="accuracy-placement"'));
  assert.match(section, /Paired planner rollouts/);
  assert.equal((section.match(/<video controls controlslist="nofullscreen nodownload" playsinline preload="metadata"/g) ?? []).length, 3);
  for (const method of ["stock", "v3r", "q3d-gt"]) {
    assert.match(section, new RegExp(`src="assets/videos/paired-${method}-trial11-4x\\.mp4"`));
    assert.match(section, new RegExp(`poster="assets/videos/paired-${method}-trial11-4x-poster\\.png"`));
  }
  assert.match(section, /Stock Qwen3-VL/);
  assert.match(section, /VLM-3R/);
  assert.match(section, /Q3D &middot; GT geometry \(privileged\)/);
  assert.match(section, /Follows an incorrect forward-bearing hint into the decoy room and never reaches the dining room/);
  assert.match(section, /Reaches the dining room and completes the task/);
  const explanation = section.match(/<div class="rollout-explanation">([\s\S]*?)<\/div>/)?.[1];
  assert.ok(explanation);
  assert.ok(section.indexOf('class="rollout-explanation"') < section.indexOf('class="video-grid"'));
  assert.match(explanation, /ServeSteak task/);
  assert.match(explanation, /shared low-level executor/);
  assert.match(explanation, /incorrect hints, leading the robot to enter the decoy room/);
  assert.match(explanation, /privileged ground-truth tour geometry/);
  assert.match(explanation, /spatial prediction error can become a navigation failure/);
  assert.match(explanation, /more accurate spatial guidance allows the same executor to complete the task/);
  assert.match(section, /more than one 22\.5 degree bin from ground truth/);
  const caption = section.match(/<p id="paired-rollouts-caption"[^>]*>([^<]+)<\/p>/)?.[1];
  assert.ok(caption);
  assert.match(caption, /Unseen-Hard rollouts/);
  assert.match(caption, /original predicted subtasks, shown at 4&times; speed/);
  assert.doesNotMatch(caption, /already accelerated|normal player speed|Shorter rollouts hold|trial|layout/i);
  assert.match(section, /class="media-error" role="alert" hidden/);
  assert.doesNotMatch(section, /data-paired-|Shared timeline|Play all|Restart all|<button\b/);
  const script = await readFile(resolve(root, "script.js"), "utf8");
  assert.doesNotMatch(script, /initializePairedRollouts|requestFullscreen|requestAnimationFrame|\.play\(|\.pause\(/);
  assert.doesNotMatch(section, /autoplay|\bloop\b|\bdownload\b|<a\b|https?:\/\//i);
});

test("selected paired rollouts have their exact accelerated durations, including the early GT completion", async () => {
  for (const method of ["stock", "v3r", "q3d-gt"]) {
    const file = await readFile(resolve(root, `assets/videos/paired-${method}-trial11-4x.mp4`));
    const duration = mp4Duration(file);
    const expected = method === "q3d-gt" ? 463 / 30 : 17.5;
    assert.ok(Math.abs(duration - expected) < 0.001, `${method}: invalid 4x duration ${duration}`);
    await access(resolve(root, `assets/videos/paired-${method}-trial11-4x-poster.png`));
  }
});

test("controlled spatial study includes matched training and evaluation examples", async () => {
  const section = html.slice(html.indexOf('id="representations"'), html.indexOf('id="results"'));
  assert.match(section, /id="spatial-samples" class="video-section" data-video-section="dataset"/);
  assert.match(section, /MolmoSpaces &middot; training data/);
  assert.match(section, /RoboCasa &middot; evaluation data/);
  assert.equal((section.match(/<video /g) ?? []).length, 2);
  for (const example of Object.values(spatialExamples)) {
    assert.match(section, new RegExp(`src="assets/videos/${example.tour}-tour\\.mp4"`));
    assert.match(section, new RegExp(`poster="assets/videos/${example.tour}-tour-poster\\.png"`));
    for (const camera of ["left", "right"]) {
      assert.match(section, new RegExp(`src="assets/${example.query}-query-${camera}\\.png"`));
      const image = await readFile(resolve(root, `assets/${example.query}-query-${camera}.png`));
      assert.equal(image.readUInt32BE(16), 256);
      assert.equal(image.readUInt32BE(20), 256);
    }
  }
  assert.match(section, /179\.3&deg;/);
  assert.doesNotMatch(section, /class="sample-context"|ProcTHOR house 1001|AlignSilverware, trial 29/);
  assert.match(section, /45\.0&deg;/);
  assert.match(section, /nearest 16-bin label: <strong>180&deg;<\/strong>/);
  assert.match(section, /nearest 16-bin label: <strong>45&deg;<\/strong> \(ahead and to the left\)/);
  assert.doesNotMatch(section, /layout 88|trial 17|&minus;179\.1&deg;/);
  assert.match(section, /simulator ground truth, not model predictions/);
  const note = section.match(/<p class="spatial-note">([^<]+)<\/p>/)?.[1];
  assert.ok(note);
  assert.match(note, /earlier environment tour with the robot's current views/);
  assert.match(note, /infer the direction to an object that is now out of sight/);
  assert.match(note, /a vase in the MolmoSpaces training example and a plate in the RoboCasa evaluation example/);
  assert.doesNotMatch(note, /selected data examples|performance comparison|original speed|sampled tour frames|VSI-590K/);
  assert.match(section, /id="spatial-video-error" class="media-error" role="alert" hidden/);
  assert.doesNotMatch(section, /autoplay|\bloop\b|download|<a\b/i);
});

test("dataset-example tours retain their original playback durations", async () => {
  for (const [domain, example] of Object.entries(spatialExamples)) {
    const file = await readFile(resolve(root, `assets/videos/${example.tour}-tour.mp4`));
    assert.equal(mp4Duration(file), example.duration, `${domain}: original tour duration must be preserved`);
  }
});

test("video errors surface in their own section without download links", async () => {
  const source = await readFile(resolve(root, "script.js"), "utf8");
  const sections = ["rollout", "tour", "dataset"].map((kind) => {
    const error = { hidden: true };
    const media = Array.from({ length: 2 }, () => ({
      addEventListener(event, callback) { assert.equal(event, "error"); this.fail = callback; },
    }));
    return {
      dataset: { videoSection: kind },
      error,
      media,
      querySelector(selector) { assert.equal(selector, ".media-error"); return error; },
      querySelectorAll(selector) { assert.equal(selector, "video, source"); return media; },
    };
  });
  vm.runInNewContext(source, {
    document: {
      querySelectorAll(selector) { return selector === "[data-video-section]" ? sections : []; },
      querySelector(selector) { return selector === "#placement-chart" ? { querySelectorAll() { return []; } } : {}; },
    },
  });
  for (const section of sections) {
    for (const other of sections) other.error.hidden = true;
    for (const media of section.media) {
      section.error.hidden = true;
      media.fail();
      assert.equal(section.error.hidden, false);
      assert.match(section.error.textContent, new RegExp(`A ${section.dataset.videoSection} video could not be loaded`));
      assert.doesNotMatch(section.error.textContent, /download/i);
      for (const other of sections.filter((other) => other !== section)) {
        assert.equal(other.error.hidden, true);
      }
    }
  }
});

test("image assets have no identifying ancillary metadata", async () => {
  for (const filename of await readdir(resolve(root, "assets"), { recursive: true })) {
    if (!/\.(png|jpg)$/.test(filename)) continue;
    const image = await readFile(resolve(root, "assets", filename));
    if (filename.endsWith(".png")) {
      let offset = 8;
      while (offset < image.length) {
        const length = image.readUInt32BE(offset);
        const type = image.toString("ascii", offset + 4, offset + 8);
        assert.ok(["IHDR", "PLTE", "tRNS", "IDAT", "IEND"].includes(type), `${filename}: unexpected ${type}`);
        offset += length + 12;
      }
      assert.equal(offset, image.length);
    } else if (filename.endsWith(".jpg")) {
      let offset = 2;
      while (offset < image.length) {
        assert.equal(image[offset], 0xff);
        const marker = image[offset + 1];
        if (marker === 0xda) break;
        assert.ok(!(marker >= 0xe0 && marker <= 0xef) && marker !== 0xfe, `${filename}: metadata marker`);
        offset += image.readUInt16BE(offset + 2) + 2;
      }
    }
  }
});

test("setting selector updates exact values, chart scale, accessibility, and summary", async () => {
  assert.match(html, /Qwen3D policy<small>Estimated geometry/);
  assert.match(html, /Qwen3D policy<small>Ground-truth geometry \(privileged\)/);
  assert.doesNotMatch(html, /Our policy<small>|Privileged reference<small>/);
  const source = await readFile(resolve(root, "script.js"), "utf8");
  const buttons = ["seen", "easy", "hard"].map((setting) => ({
    dataset: { setting },
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(event, callback) { assert.equal(event, "click"); this.click = callback; },
  }));
  const rows = Array.from({ length: 3 }, () => ({
    bar: { style: { setProperty(name, value) { this[name] = value; } } },
    value: {},
    querySelector(selector) { return selector === ".bar" ? this.bar : this.value; },
  }));
  const chart = {
    attributes: {},
    querySelectorAll() { return rows; },
    setAttribute(name, value) { this.attributes[name] = value; },
  };
  const summary = {};
  vm.runInNewContext(source, {
    document: {
      querySelectorAll(selector) { return selector === "[data-setting]" ? buttons : []; },
      querySelector(selector) { return selector === "#placement-chart" ? chart : summary; },
    },
  });
  const expected = [[41.6, 37.0, 36.3], [20.4, 27.6, 34.4], [10.9, 24.8, 32.5]];
  buttons.forEach((button, index) => {
    button.click();
    rows.forEach((row, rowIndex) => {
      assert.equal(row.value.textContent, `${expected[index][rowIndex].toFixed(1)}%`);
      assert.equal(row.bar.style["--bar-size"], `${expected[index][rowIndex] * 2}%`);
    });
    buttons.forEach((option) => assert.equal(option.attributes["aria-pressed"], String(option === button)));
    assert.match(chart.attributes["aria-label"], /privileged ground-truth geometry/);
    assert.match(chart.attributes["aria-label"], /Qwen3D policy with estimated geometry/);
    assert.match(summary.textContent, /Qwen3D with estimated geometry achieves/);
    assert.match(summary.textContent, index === 0 ? /4.6 percentage-point decrease/ : index === 1 ? /7.2 percentage-point gain/ : /13.9 percentage-point gain/);
  });
});

test("preview serves MP4 media and correct byte ranges for playback and seeking", { timeout: 15000 }, async (t) => {
  const child = spawn(process.execPath, ["preview.mjs"], {
    cwd: root,
    env: { ...process.env, PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => child.kill("SIGTERM"));
  const base = await new Promise((resolveReady, reject) => {
    let output = "";
    let errors = "";
    child.stderr.on("data", (chunk) => { errors += chunk; });
    child.once("error", reject);
    child.once("exit", (code) => reject(new Error(`Preview exited with ${code}: ${errors}`)));
    child.stdout.on("data", (chunk) => {
      output += chunk;
      const url = output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
      if (url) resolveReady(url);
    });
  });
  const video = await readFile(resolve(root, "assets/videos/probe-flat-trial1-4x.mp4"));
  const url = `${base}/assets/videos/probe-flat-trial1-4x.mp4`;
  const head = await fetch(url, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("content-type"), "video/mp4");
  assert.equal(Number(head.headers.get("content-length")), video.length);
  assert.equal(head.headers.get("accept-ranges"), "bytes");
  for (const [range, start, end] of [
    ["bytes=0-31", 0, 31],
    ["bytes=32-", 32, video.length - 1],
    ["bytes=-16", video.length - 16, video.length - 1],
  ]) {
    const response = await fetch(url, { headers: { Range: range } });
    assert.equal(response.status, 206);
    assert.equal(response.headers.get("content-range"), `bytes ${start}-${end}/${video.length}`);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), video.subarray(start, end + 1));
  }
  for (const range of ["bytes=-0", `bytes=${video.length}-`, "bytes=10-2", "bytes=0-1,3-4"]) {
    const response = await fetch(url, { headers: { Range: range } });
    assert.equal(response.status, 416);
    assert.equal(response.headers.get("content-range"), `bytes */${video.length}`);
    await response.text();
  }
  assert.equal((await fetch(`${base}/.git/config`)).status, 404);
});
