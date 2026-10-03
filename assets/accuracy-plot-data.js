const settings = [["seen", "Seen"], ["easy", "Unseen-Easy"], ["hard", "Unseen-Hard"]];
const planners = [
  ["stock", "Stock Qwen3-VL", false,
    [30.83333333333335, 23.58333333333334, 13.624999999999995],
    [50.127727514635446, 29.23904688700999, 19.514266304347824],
    [18790, 19515, 23552], [9419, 5706, 4596]],
  ["cs", "CS", false,
    [33.87500000000001, 18.916666666666675, 12.95833333333333],
    [55.45819642205184, 25.34853134590092, 23.286775353856214],
    [19173, 22810, 21407], [10633, 5782, 4985]],
  ["cp", "CP", false,
    [38.08333333333333, 26.666666666666675, 17.833333333333336],
    [56.107356254285435, 28.260130830005945, 19.91303335015724],
    [20418, 23542, 25757], [11456, 6653, 5129]],
  ["v3r", "VLM-3R", false,
    [36.70833333333331, 26.87500000000001, 18.583333333333336],
    [63.88815754831236, 33.89341034392229, 24.78508844437097],
    [18991, 19045, 24196], [12133, 6455, 5997]],
  ["q3d-est", "Q3D, estimated geometry", false,
    [36.999999999999986, 27.625000000000018, 24.791666666666675],
    [70.7795371498173, 51.44459036266289, 45.45369416612042],
    [16420, 19798, 21358], [11622, 10185, 9708]],
  ["q3d-gt", "Q3D, GT geometry (privileged)", true,
    [36.29166666666664, 34.375, 32.500000000000014],
    [74.80018495277099, 74.50793472775192, 75.47129160831628],
    [15139, 17833, 18566], [11324, 13287, 14012]],
];

export const points = planners.flatMap(([planner, plannerLabel, privileged, placements, accuracies, queries, correct]) =>
  settings.map(([setting, settingLabel], index) => ({
    id: `${planner}-${setting}`, planner, plannerLabel, setting, settingLabel, privileged,
    episodes: 200, placementRate: placements[index], hintAccuracy: accuracies[index],
    hintQueries: queries[index], correctHints: correct[index],
  })));
