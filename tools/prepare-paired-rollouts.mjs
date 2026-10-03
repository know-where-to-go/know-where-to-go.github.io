import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, mkdir, rm, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const bearingBinWidth = Math.PI / 8;
export const policies = ["stock", "v3r", "q3d-gt"];
const speed = 4;
const normalizedText = (text) => text.trim().replace(/\s+/g, " ");

export function bearingIsWrong(record) {
  if (record.pred_angle_rad == null || record.oracle_bin_angle_rad == null) return null;
  assert.ok(Number.isFinite(record.pred_angle_rad) && Number.isFinite(record.oracle_bin_angle_rad),
    "Bearing values must be finite numbers");
  const toBin = (angle) => ((Math.round((angle % (2 * Math.PI)) / bearingBinWidth) % 16) + 16) % 16;
  const difference = Math.abs(toBin(record.pred_angle_rad) - toBin(record.oracle_bin_angle_rad));
  return Math.min(difference, 16 - difference) > 1;
}

export function parseCaptions(text, fps, frameCount) {
  assert.ok(Number.isFinite(fps) && fps > 0, "Invalid source frame rate");
  assert.ok(Number.isInteger(frameCount) && frameCount > 0, "Invalid source frame count");
  const blocks = text.trim().split(/\r?\n\s*\r?\n/);
  assert.equal(blocks.shift(), "WEBVTT", "Expected a WebVTT action track");
  const toFrame = (timestamp) => {
    const [hours, minutes, seconds] = timestamp.split(":").map(Number);
    return Math.round((hours * 3600 + minutes * 60 + seconds) * fps);
  };
  const cues = blocks.map((block) => {
    const lines = block.split(/\r?\n/);
    const timing = lines.findIndex((line) => line.includes(" --> "));
    assert.ok(timing >= 0, "Missing caption timing");
    const match = lines[timing].match(/^(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})(?: .*)?$/);
    assert.ok(match, "Invalid caption timing");
    const text = normalizedText(lines.slice(timing + 1).join(" ").replace(
      /&(amp|lt|gt);/g, (_, entity) => ({ amp: "&", lt: "<", gt: ">" })[entity],
    ));
    assert.ok(text.length > 0, "Empty subtask caption");
    assert.doesNotMatch(text, /https?:\/\/|\/home\/|blob\.core\.windows\.net|tour_context/i,
      "Action captions must not contain identifying paths or URLs");
    return { start: toFrame(match[1]), end: toFrame(match[2]), text };
  });
  assert.ok(cues.length > 0, "Missing subtask captions");
  let previousEnd = 0;
  for (const cue of cues) {
    assert.equal(cue.start, previousEnd, "Caption timeline must be contiguous");
    assert.ok(cue.end > cue.start && cue.end <= frameCount, "Caption outside the video");
    previousEnd = cue.end;
  }
  assert.equal(previousEnd, frameCount, "Caption track must cover the entire video");
  return cues;
}

export function matchEpisodes(resultSets, suffix) {
  assert.equal(resultSets.length, policies.length, "Expected all three policy summaries");
  const episodes = resultSets.map((rows) => {
    const matches = rows.filter((row) => row.path.endsWith(suffix));
    assert.equal(matches.length, 1, "Expected exactly one matching episode per policy");
    assert.equal(matches[0].outcome.status, "ok", "Cannot compare an errored episode");
    const identity = matches[0].outcome.debug_info.initial_state_identity;
    for (const key of ["suite_name", "task_name", "split", "trial_idx", "seed", "control_mode", "layout_id", "style_id"]) {
      assert.ok(identity?.[key] != null, `Missing initial-state identity field: ${key}`);
    }
    return matches[0];
  });
  for (const episode of episodes.slice(1)) {
    assert.deepEqual(episode.outcome.debug_info.initial_state_identity,
      episodes[0].outcome.debug_info.initial_state_identity, "Rollouts do not share the same initial state");
    assert.equal(episode.path, episodes[0].path, "Episode paths must match");
    assert.equal(episode.outcome.debug_info.instruction, episodes[0].outcome.debug_info.instruction,
      "Task instructions must match");
  }
  return episodes;
}

export function tintIntervals(probe, cues) {
  const [header, ...records] = probe;
  assert.equal(header?.type, "episode", "Missing polar-probe episode header");
  assert.equal(header.n_records, records.length, "Incomplete polar-probe trace");
  const intervals = [];
  const counts = { correct: 0, wrong: 0, unscored: 0 };
  let previousStep = -1;
  const byCue = cues.map(() => []);
  for (const record of records) {
    assert.ok(Number.isInteger(record.step_idx) && record.step_idx > previousStep,
      "Probe steps must be strictly increasing integers");
    previousStep = record.step_idx;
    const index = cues.findIndex((cue) => cue.start <= record.step_idx && record.step_idx < cue.end);
    assert.ok(index >= 0, "Probe step outside caption timeline");
    assert.equal(normalizedText(record.subtask), cues[index].text,
      `Probe and displayed subtask disagree at frame ${record.step_idx}`);
    assert.match(cues[index].text, /^navigate\b/i, "Probe attached to a non-navigation subtask");
    byCue[index].push(record);
  }
  for (const [index, cue] of cues.entries()) {
    const samples = byCue[index];
    if (!/^navigate\b/i.test(cue.text)) continue;
    assert.ok(samples.length > 0, `Missing navigation probe for caption at frame ${cue.start}`);
    assert.equal(samples[0].step_idx, cue.start, "Navigation cue must begin at a recorded prediction");
    for (const [sampleIndex, record] of samples.entries()) {
      const wrong = bearingIsWrong(record);
      counts[wrong === null ? "unscored" : wrong ? "wrong" : "correct"] += 1;
      if (wrong !== true) continue;
      const start = record.step_idx;
      const end = samples[sampleIndex + 1]?.step_idx ?? cue.end;
      const previous = intervals.at(-1);
      if (previous?.end === start) previous.end = end;
      else intervals.push({ start, end });
    }
  }
  return { intervals, counts };
}

export function encodingFilter(intervals) {
  const filters = [];
  if (intervals.length > 0) {
    const enable = intervals.map(({ start, end }) => {
      assert.ok(Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end > start);
      return `between(n,${start},${end - 1})`;
    }).join("+");
    // Score original frame indices before changing the playback clock.
    filters.push(`drawbox=color=red@0.12:t=fill:enable='${enable}'`);
  }
  filters.push(`setpts=(PTS-STARTPTS)/${speed}`, "fps=30",
    "drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='4x':fontsize=16:fontcolor=white:box=1:boxcolor=black@0.75:boxborderw=4:x=w-tw-8:y=h-th-8");
  return filters.join(",");
}

export function stripPngMetadata(buffer) {
  assert.equal(buffer.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", "Invalid PNG");
  const chunks = [buffer.subarray(0, 8)];
  const allowed = new Set(["IHDR", "PLTE", "tRNS", "IDAT", "IEND"]);
  for (let offset = 8; offset < buffer.length;) {
    assert.ok(offset + 12 <= buffer.length, "Truncated PNG chunk");
    const end = offset + 12 + buffer.readUInt32BE(offset);
    assert.ok(end <= buffer.length, "PNG chunk exceeds file");
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    if (allowed.has(type)) chunks.push(buffer.subarray(offset, end));
    offset = end;
  }
  assert.equal(chunks.at(-1).toString("ascii", 4, 8), "IEND", "Missing PNG end marker");
  return Buffer.concat(chunks);
}

function inspectVideo(path) {
  const data = JSON.parse(execFileSync("ffprobe", [
    "-v", "error", "-show_streams", "-show_format", "-of", "json", path,
  ], { encoding: "utf8" }));
  assert.equal(data.streams.length, 1, "Source and output must have one silent video stream");
  const stream = data.streams[0];
  assert.equal(stream.codec_type, "video");
  const [numerator, denominator] = stream.avg_frame_rate.split("/").map(Number);
  const fps = numerator / denominator;
  const frameCount = Number(stream.nb_frames);
  assert.ok(Number.isFinite(fps) && fps > 0 && Number.isInteger(frameCount) && frameCount > 0);
  return { fps, frameCount, duration: Number(stream.duration), width: stream.width, height: stream.height };
}

const jsonLines = (text) => text.trim().split(/\r?\n/).map(JSON.parse);

export async function prepare(sourceDirectory, outputDirectory, episodeSuffix = "/ServeSteak/0011") {
  const summaries = await Promise.all(policies.map(async (key) =>
    jsonLines(await readFile(join(sourceDirectory, `paired-${key}-results.jsonl`), "utf8"))));
  const episodes = matchEpisodes(summaries, episodeSuffix);
  const trial = episodeSuffix.split("/").at(-1);
  assert.match(trial, /^\d{4}$/, "Episode suffix must end with a four-digit trial index");
  await mkdir(outputDirectory, { recursive: true });
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "paired-rollout-"));
  const filterFile = join(temporaryDirectory, "encode.filter");
  const report = [];
  try {
    for (const [index, key] of policies.entries()) {
      const input = join(sourceDirectory, `paired-${key}-source`);
      const video = join(input, "head_camera_left_video.mp4");
      const source = inspectVideo(video);
      assert.ok(Math.abs(source.duration - source.frameCount / source.fps) < 1 / source.fps,
        "Source video must have a constant, frame-aligned clock");
      const cues = parseCaptions(await readFile(join(input, "head_camera_left_actions.vtt"), "utf8"),
        source.fps, source.frameCount);
      const probe = jsonLines(await readFile(join(input, "polar_probe.jsonl"), "utf8"));
      assert.equal(probe[0].task_path, episodes[index].path, "Probe belongs to another episode");
      const { intervals, counts } = tintIntervals(probe, cues);
      const stem = `paired-${key}-trial${Number(trial)}-4x`;
      const output = join(outputDirectory, `${stem}.mp4`);
      await writeFile(filterFile, encodingFilter(intervals));
      execFileSync("ffmpeg", [
        "-hide_banner", "-loglevel", "error", "-y", "-i", video, "-filter_script:v", filterFile,
        "-an", "-map_metadata", "-1", "-map_chapters", "-1", "-c:v", "libx264", "-crf", "20",
        "-preset", "medium", "-pix_fmt", "yuv420p", "-threads", "2", "-movflags", "+faststart", output,
      ], { stdio: "inherit" });
      const encoded = inspectVideo(output);
      assert.ok(Math.abs(encoded.duration - source.duration / speed) < 1 / encoded.fps,
        "Encoded playback must be exactly four times faster");
      assert.equal(encoded.fps, 30);
      assert.equal(encoded.width, source.width);
      assert.equal(encoded.height, source.height);
      const poster = join(outputDirectory, `${stem}-poster.png`);
      execFileSync("ffmpeg", [
        "-hide_banner", "-loglevel", "error", "-y", "-i", output, "-frames:v", "1",
        "-update", "1", "-map_metadata", "-1", poster,
      ], { stdio: "inherit" });
      await writeFile(poster, stripPngMetadata(await readFile(poster)));
      report.push({ policy: key, source, encoded, counts, tintIntervals: intervals,
        tintedSourceFrames: intervals.reduce((total, interval) => total + interval.end - interval.start, 0) });
    }
  } finally {
    await rm(filterFile, { force: true });
    await rmdir(temporaryDirectory);
  }
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.ok(process.argv[2], "Usage: node tools/prepare-paired-rollouts.mjs PRIVATE_SOURCE_DIRECTORY [OUTPUT_DIRECTORY] [EPISODE_SUFFIX]");
  const output = process.argv[3] ?? resolve(dirname(fileURLToPath(import.meta.url)), "../assets/videos");
  const report = await prepare(resolve(process.argv[2]), resolve(output), process.argv[4]);
  console.log(JSON.stringify(report, null, 2));
}
