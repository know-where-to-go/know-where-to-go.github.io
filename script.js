const settings = {
  seen: { label: "Seen", values: [41.6, 37.0, 36.3] },
  easy: { label: "Unseen-Easy", values: [20.4, 27.6, 34.4] },
  hard: { label: "Unseen-Hard", values: [10.9, 24.8, 32.5] },
};

const buttons = document.querySelectorAll("[data-setting]");
const chart = document.querySelector("#placement-chart");
const rows = chart.querySelectorAll(".chart-row");
const summary = document.querySelector("#chart-summary");

for (const button of buttons) {
  button.addEventListener("click", () => {
    const setting = settings[button.dataset.setting];
    for (const option of buttons) {
      option.setAttribute("aria-pressed", String(option === button));
    }
    rows.forEach((row, index) => {
      row.querySelector(".bar").style.setProperty("--bar-size", `${setting.values[index] * 2}%`);
      row.querySelector(".bar-value").textContent = `${setting.values[index].toFixed(1)}%`;
    });
    const [flat, estimated, privileged] = setting.values;
    chart.setAttribute(
      "aria-label",
      `${setting.label} placement rate: flat policy ${flat.toFixed(1)}%, Qwen3D policy with estimated geometry ${estimated.toFixed(1)}%, Qwen3D policy with privileged ground-truth geometry ${privileged.toFixed(1)}%`,
    );
    const difference = estimated - flat;
    summary.textContent = `In ${setting.label}, Qwen3D with estimated geometry achieves ${estimated.toFixed(1)}% versus ${flat.toFixed(1)}% for the flat policy: a ${Math.abs(difference).toFixed(1)} percentage-point ${difference >= 0 ? "gain" : "decrease"}.`;
  });
}

for (const section of document.querySelectorAll("[data-video-section]")) {
  const mediaError = section.querySelector(".media-error");
  for (const media of section.querySelectorAll("video, source")) {
    media.addEventListener("error", () => {
      mediaError.textContent = `A ${section.dataset.videoSection} video could not be loaded. Reload the page to try again.`;
      mediaError.hidden = false;
    });
  }
}
