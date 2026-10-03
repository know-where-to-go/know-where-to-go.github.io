# Knowing Where to Go

A dependency-free research website for the paper
*Knowing Where to Go: Generalizing Mobile Manipulation to Unseen Environments from a Single Video*.

The page leads with the full paper title and abstract (omitting the abstract's
self-referential project URL), followed by plain summaries of the motivating
experiment, hierarchical policy, spatial representation study, evaluation,
and takeaways. Results are presented as a chart, an expanded comparison
table, and prose rather than promotional numerical callouts.

The method illustration recreates the paper's planner-executor architecture
using HTML and CSS, with SVG connectors and the paper's observation thumbnails.
Its labels and panels are editable page elements, not a flattened figure.
On narrow screens, its container scrolls horizontally to preserve readable labels.

The method section also includes three original prerecorded environment tours:
ServeSteak trial 1 in Seen and Unseen-Easy, and trial 16 in Unseen-Hard.
These replace the top-of-page still-image filmstrip. They illustrate the
planner's pre-task visual context, not policy execution. Each contains 48
views at 8 fps and plays for six seconds at its original speed, without
autoplay or download links. Videos and posters have source metadata removed.
Both the tours and rollouts display an explicit message if video loading fails.

The controlled spatial-representation study includes matched tour/query
examples from MolmoSpaces training data and RoboCasa evaluation data:
- MolmoSpaces: GST v11 shard 0, ProcTHOR house 1001, room pair 2/3, query 0,
  semantic vase target. The shared-tour hash assigns this example to the
  training partition (bucket 0.562943, above the 0.02 hold-out threshold).
- RoboCasa: `gst_dining_vqa_71_90_v1`, Unseen-Hard spatial-VQA benchmark,
  AlignSilverware, layout 90, trial 29, tour 0, query 2, semantic plate target.

Each card shows the original full tour, both matching shoulder-camera views
resized to 256 x 256, a shortened question, and its simulator ground-truth
bearing and nearest 16-bin label. The source bearings are 179.3 degrees and
45.00750098045721 degrees respectively; display rounding is to one decimal.
These are dataset examples, not model predictions or task rollouts. Tours
retain their original speed (8 and 6 seconds); models sample 16 tour frames.
The displayed bearing is one component of the training distance/bearing label.
MolmoSpaces is part of the training mixture with VSI-590K; RoboCasa tests
transfer. Media metadata is stripped and raw QA manifests stay outside the
public repository.

The results section includes the paper's navigation-hint accuracy versus
placement-rate plot. Its caption defines the bearing metric, reports the
correlation across 18 planner-setting pairs, and distinguishes estimated
from privileged ground-truth geometry. The raster plot has embedded
metadata stripped and links to its full-size image.

The plot is interactive when JavaScript is available, with filters for
evaluation setting and planner, and hover/focus/tap
inspection of each point's accuracy and placement rate. Keyboard users can focus points with Tab
and select them with Enter or Space. The correlation for the currently
shown points is reported separately from the caption's full-data result.
Filters retain the same axes and chance reference. The original raster
remains the no-JavaScript fallback.

The placement-rate bars name both geometry variants as the Qwen3D policy,
with estimated and privileged ground-truth geometry distinguished in their
subtitles, accessible labels, and setting-dependent summary.

The 18 plotted points are reconstructed from all 3,600 episodes in the
paper's planner sweep, using the original raw-angle within-one-bin metric
and query-weighted accuracy, not the discrete-bin comparison used for
video tinting. Only anonymous aggregate values are published in
`assets/accuracy-plot-data.js`; no raw traces, identifying paths or storage
addresses are included. The matched rollout videos appear before the plot.
Stock, VLM-3R and Q3D-GT Unseen-Hard points link back to their displayed
selected episode; other settings and planners do not receive unrelated
video links.

The probing section includes three head-camera MP4 recordings of ServeSteak,
trial 1, in Unseen-Hard: XR-1, flat pi0.5, and pi0.5 with oracle navigation
guidance. Evaluation records verify matching saved initial states. This is
a selected example, not a random sample: it has the longest XR-1 base travel
among the recorded Unseen-Hard ServeSteak trials (26.4 m, compared with 10.4 m
in the previous example). XR-1 and the flat policy enter the decoy room; the
oracle-guided policy reaches the dining room but does not complete the task.
The oracle is a
privileged probing baseline, not the learned planner. Videos are encoded at
4x the recorded speed, with a burned-in `4x` label that remains visible in
fullscreen. They have no audio, use native independent controls without separate download links,
and do not autoplay. Source metadata is removed; no storage URLs, credentials, or raw
evaluation records are published. The preview server supports byte ranges
for browser playback and seeking.

### Paired planner rollouts

The mobile-manipulation section compares Stock Qwen3-VL, VLM-3R, and Q3D
with privileged ground-truth geometry on ServeSteak trial 11, Unseen-Hard.
All three evaluation records have the same complete initial-state identity
(including seed, layout, style and control mode), task instruction, and
episode path. The example was selected because VLM-3R follows an erroneous
navigation hint into the decoy room and never reaches the dining room.
At steps 304-336, it predicts a forward bearing while the true binned
bearing is -112.5 degrees; the robot drives approximately in the predicted
direction and its distance to the target increases from 4.53 to 4.90 m.
Stock also enters the decoy room; Q3D with GT geometry reaches the dining
room and completes the task. This is one selected matched episode, not
an aggregate performance comparison.

Main text above the players explains the task, the wrong-room navigation,
and how inaccurate planner guidance can turn into a navigation failure
despite a shared executor. The short caption below describes the overlays,
speed, and error tint.

The original predicted subtask overlays are preserved. A subtle red tint
marks navigation hints whose predicted and ground-truth bearing labels are
more than one bin apart on the circular 16-bin grid. Predictions are snapped
back to their nearest bin before comparison, avoiding false errors from
two-decimal radian formatting. This visualization intentionally differs from
the raw-angle threshold used by the paper's unchanged accuracy-placement
plot. Tint does not measure distance error, subtask correctness, or task
completion.

Each probe's rollout step is aligned with the original video's frame index
and checked against the timed action captions. Error status updates at each
recorded model call and applies to its action chunk, ending at the next
probe or subtask change. Missing bearings remain unscored and untinted;
missing or misaligned navigation records fail preparation explicitly.
Tint is applied before acceleration, and the preserved subtasks, tint,
and `4x` label are encoded in the MP4, including in fullscreen.

Stock and VLM-3R run for 70 seconds (17.5 seconds displayed); Q3D GT finishes
after 61.7 seconds (about 15.43 seconds displayed). Each has independent
native playback controls. There is no shared transport or custom fullscreen
button; the native controls request that fullscreen and download buttons
be omitted. Source metadata is removed, and raw summaries, probe records,
and storage addresses stay private.

To reproduce the media, stage private inputs outside this repository:
`paired-{stock,v3r,q3d-gt}-results.jsonl`, and corresponding
`paired-{stock,v3r,q3d-gt}-source/` directories containing
`head_camera_left_video.mp4`, `head_camera_left_actions.vtt`, and
`polar_probe.jsonl`. Run:

```sh
node tools/prepare-paired-rollouts.mjs PRIVATE_SOURCE_DIRECTORY
```

The tool verifies pairing, frame timing and captions, then writes only the
sanitized MP4s and PNG posters to `assets/videos/`. An optional second
argument selects the output directory; an optional third selects the
episode suffix (default `/ServeSteak/0011`). Output filenames include the
trial index to prevent reuse of cached media from a previous selection.
It requires FFmpeg/ffprobe
and the system DejaVu Sans font, but no Node dependencies or Python setup.

## Preview

Run `npm start` with Node.js installed, then open <http://127.0.0.1:4173>.
In a remote VS Code workspace, forward port 4173 from the Ports panel.
The `Preview paper website` task provides the same preview.
Set `PORT` to choose a different port. The server binds only to loopback.

Run `npm test` for asset, navigation, metadata, and interactive-chart checks.
No dependency installation or build step is required.

## Publish

GitHub Pages can serve this repository directly from its root.
Only the static page, stylesheet, browser script, and assets are needed.
The Node.js preview server is for local development.

## Double-blind submission

Do not add author names, affiliations, institutional logos, personal links,
identifying comments, citation metadata, or identity-revealing resource links.
Do not publish the source paper PDF until it has been checked for visible
identifiers and embedded metadata. Paper, code, and benchmark links are
intentionally pending in this draft. The public page does not display
anonymity labels or submission-status notices.

Raster assets retain only image data and rendering-critical chunks; source
metadata has been stripped. Keep this policy when adding new media. Check
both visible content and embedded metadata before publication.

The trajectory comparison is an **oracle-guidance motivating experiment**,
not a rollout of the learned planner. The architecture diagram uses sampled
tour thumbnails; the separate tour players show the complete recorded videos.
The main quantitative metric is placement rate, not
full-task success, and ground-truth geometry is a privileged reference.