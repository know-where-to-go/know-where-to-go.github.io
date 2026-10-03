import { points } from "./accuracy-plot-data.js";

export const settingColors = { seen: "#2b8cbe", easy: "#fd8d3c", hard: "#d7301f" };
const namespace = "http://www.w3.org/2000/svg";

export function filterPoints(data, { setting = "all", planner = "all" } = {}) {
  return data.filter(point => (setting === "all" || point.setting === setting)
    && (planner === "all" || point.planner === planner));
}

export function correlation(data) {
  if (data.length < 3) return null;
  const meanX = data.reduce((sum, point) => sum + point.hintAccuracy, 0) / data.length;
  const meanY = data.reduce((sum, point) => sum + point.placementRate, 0) / data.length;
  let covariance = 0;
  let varianceX = 0;
  let varianceY = 0;
  for (const point of data) {
    const x = point.hintAccuracy - meanX;
    const y = point.placementRate - meanY;
    covariance += x * y;
    varianceX += x * x;
    varianceY += y * y;
  }
  return varianceX > 0 && varianceY > 0 ? covariance / Math.sqrt(varianceX * varianceY) : null;
}

export function rolloutTarget(point) {
  return point.setting === "hard" && ["stock", "v3r", "q3d-gt"].includes(point.planner)
    ? `rollout-${point.planner}` : null;
}

export function plotLayout(width) {
  const boundedWidth = Math.max(280, Math.min(760, width));
  const height = boundedWidth < 480 ? 320 : 420;
  const left = 58;
  const top = 24;
  const plotWidth = boundedWidth - left - 18;
  const plotHeight = height - top - 60;
  return {
    width: boundedWidth, height, left, top, plotWidth, plotHeight,
    x: value => left + (value - 10) / 72 * plotWidth,
    y: value => top + (40 - value) / 30 * plotHeight,
  };
}

function svgElement(tag, attributes = {}, text) {
  const element = document.createElementNS(namespace, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  if (text != null) element.textContent = text;
  return element;
}

function marker(planner, color, privileged) {
  const attributes = { fill: privileged ? "white" : color, stroke: privileged ? color : "#26313a",
    "stroke-width": privileged ? 1.6 : 1 };
  if (planner === "stock") return svgElement("circle", { ...attributes, r: 5.5 });
  const shapes = {
    cs: "M0,-7 L7,0 L0,7 L-7,0 Z",
    cp: "M-2,-7 H2 V-2 H7 V2 H2 V7 H-2 V2 H-7 V-2 H-2 Z",
    v3r: "M-6,-4 L-4,-6 L0,-2 L4,-6 L6,-4 L2,0 L6,4 L4,6 L0,2 L-4,6 L-6,4 L-2,0 Z",
  };
  if (shapes[planner]) return svgElement("path", { ...attributes, d: shapes[planner] });
  const vertices = Array.from({ length: 10 }, (_, index) => {
    const radius = index % 2 === 0 ? 9 : 4;
    const angle = -Math.PI / 2 + index * Math.PI / 5;
    return `${index === 0 ? "M" : "L"}${radius * Math.cos(angle)},${radius * Math.sin(angle)}`;
  });
  return svgElement("path", { ...attributes, d: `${vertices.join(" ")} Z` });
}

export function initializePlot(root, data) {
  if (data.length !== 18 || new Set(data.map(point => point.id)).size !== 18) {
    throw Error("Expected 18 unique planner-setting results.");
  }
  for (const point of data) {
    if (!Number.isFinite(point.hintAccuracy) || point.hintAccuracy < 10 || point.hintAccuracy > 82
      || !Number.isFinite(point.placementRate) || point.placementRate < 10 || point.placementRate > 40
      || !settingColors[point.setting] || point.episodes !== 200 || point.hintQueries <= 0) {
      throw Error(`Invalid aggregate plot result: ${point.id}`);
    }
  }
  const svg = root.querySelector("#accuracy-scatter");
  const details = root.querySelector("#scatter-details");
  const status = root.querySelector("#scatter-status");
  const plannerSelect = root.querySelector("#scatter-planner");
  const settingButtons = [...root.querySelectorAll("[data-scatter-setting]")];
  const legend = root.querySelector(".scatter-legend");
  const state = { setting: "all", planner: "all" };
  let activeId = null;
  let renderedWidth = 0;

  for (const point of data.filter((point, index) => data.findIndex(other => other.planner === point.planner) === index)) {
    const option = document.createElement("option");
    option.value = point.planner;
    option.textContent = point.plannerLabel;
    plannerSelect.append(option);
    const item = document.createElement("li");
    const symbol = svgElement("svg", { viewBox: "-12 -12 24 24", width: 24, height: 24, "aria-hidden": "true" });
    symbol.append(marker(point.planner, "#66717c", point.privileged));
    item.append(symbol, document.createTextNode(point.plannerLabel));
    legend.append(item);
  }

  const showDetails = point => {
    details.replaceChildren();
    if (!point) {
      const prompt = document.createElement("p");
      prompt.textContent = "Inspect a point to see the planner, evaluation setting, and measured results.";
      details.append(prompt);
      return;
    }
    const heading = document.createElement("h4");
    heading.textContent = point.plannerLabel;
    const setting = document.createElement("p");
    setting.textContent = point.settingLabel;
    const list = document.createElement("dl");
    const fields = [
      ["Navigation-hint bearing accuracy", `${point.hintAccuracy.toFixed(2)}%`],
      ["Placement rate", `${point.placementRate.toFixed(2)}%`],
    ];
    for (const [label, value] of fields) {
      const row = document.createElement("div");
      const term = document.createElement("dt");
      const definition = document.createElement("dd");
      term.textContent = label;
      definition.textContent = value;
      row.append(term, definition);
      list.append(row);
    }
    details.append(heading, setting, list);
    const target = rolloutTarget(point);
    if (target) {
      const link = document.createElement("a");
      link.href = `#${target}`;
      link.textContent = "View this planner's rollout example";
      link.addEventListener("click", () => {
        for (const card of document.querySelectorAll("#paired-rollouts .video-card")) {
          card.classList.toggle("rollout-highlight", card.id === target);
        }
      });
      details.append(link);
    }
  };

  const inspect = point => {
    activeId = point.id;
    for (const node of svg.querySelectorAll("[data-point-id]")) {
      node.setAttribute("aria-pressed", String(node.dataset.pointId === activeId));
    }
    showDetails(point);
  };

  const render = () => {
    const visible = filterPoints(data, state);
    const layout = plotLayout(svg.parentElement.clientWidth);
    renderedWidth = svg.parentElement.clientWidth;
    svg.setAttribute("viewBox", `0 0 ${layout.width} ${layout.height}`);
    svg.replaceChildren(
      svgElement("title", { id: "scatter-title" }, "Navigation-hint bearing accuracy versus placement rate"),
      svgElement("desc", { id: "scatter-description" },
        `${visible.length} planner-setting points. Colors show evaluation settings; shapes show planners. Open stars use privileged GT geometry. Use Tab to inspect points, and Enter or Space to select.`),
    );
    for (const value of [10, 15, 20, 25, 30, 35, 40]) {
      const y = layout.y(value);
      svg.append(svgElement("line", { x1: layout.left, x2: layout.x(82), y1: y, y2: y, class: "scatter-grid" }),
        svgElement("text", { x: layout.left - 8, y: y + 4, "text-anchor": "end", class: "scatter-label" }, value));
    }
    for (const value of [10, 20, 40, 60, 80]) {
      const x = layout.x(value);
      svg.append(svgElement("line", { x1: x, x2: x, y1: layout.top, y2: layout.y(10), class: "scatter-grid" }),
        svgElement("text", { x, y: layout.y(10) + 20, "text-anchor": "middle", class: "scatter-label" }, value));
    }
    svg.append(
      svgElement("line", { x1: layout.left, x2: layout.x(82), y1: layout.y(10), y2: layout.y(10), class: "scatter-axis" }),
      svgElement("line", { x1: layout.left, x2: layout.left, y1: layout.top, y2: layout.y(10), class: "scatter-axis" }),
      svgElement("line", { x1: layout.x(18.75), x2: layout.x(18.75), y1: layout.top, y2: layout.y(10), class: "scatter-chance" }),
      svgElement("text", { x: layout.x(18.75) + 5, y: layout.top + 13, class: "scatter-label" }, "chance 18.8%"),
      svgElement("text", { x: layout.left + layout.plotWidth / 2, y: layout.height - 13,
        "text-anchor": "middle", class: "scatter-label" }, "Nav-hint bearing accuracy (%)"),
      svgElement("text", { transform: `translate(15,${layout.top + layout.plotHeight / 2}) rotate(-90)`,
        "text-anchor": "middle", class: "scatter-label" }, "Placement rate (%)"),
    );
    if (!visible.some(point => point.id === activeId)) activeId = null;
    for (const point of visible) {
      const group = svgElement("g", {
        transform: `translate(${layout.x(point.hintAccuracy)},${layout.y(point.placementRate)})`,
        class: "scatter-point", tabindex: 0, role: "button", "data-point-id": point.id,
        "aria-pressed": point.id === activeId,
        "aria-label": `${point.plannerLabel}, ${point.settingLabel}: bearing accuracy ${point.hintAccuracy.toFixed(2)}%, placement rate ${point.placementRate.toFixed(2)}%`,
      });
      group.append(svgElement("title", {}, group.getAttribute("aria-label")),
        svgElement("circle", { r: 13, class: "point-halo" }),
        svgElement("circle", { r: 13, fill: "transparent" }),
        marker(point.planner, settingColors[point.setting], point.privileged));
      for (const event of ["pointerenter", "focus", "click"]) group.addEventListener(event, () => inspect(point));
      group.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          inspect(point);
        }
      });
      svg.append(group);
    }
    showDetails(visible.find(point => point.id === activeId));
    const r = correlation(visible);
    status.textContent = visible.length === 0 ? "No points match these filters."
      : `${visible.length} of 18 planner-setting points shown. ${r === null
        ? "Correlation requires at least three points with variation."
        : `Pearson r for shown points: ${r.toFixed(2)}.`}`;
  };

  for (const button of settingButtons) {
    button.addEventListener("click", () => {
      state.setting = button.dataset.scatterSetting;
      for (const option of settingButtons) option.setAttribute("aria-pressed", String(option === button));
      render();
    });
  }
  plannerSelect.addEventListener("change", () => {
    state.planner = plannerSelect.value;
    render();
  });
  root.hidden = false;
  render();
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(() => {
      if (Math.abs(svg.parentElement.clientWidth - renderedWidth) > 0.5) render();
    }).observe(svg.parentElement);
  } else {
    window.addEventListener("resize", render);
  }
}

if (typeof document !== "undefined") {
  const root = document.querySelector("#accuracy-interactive");
  if (root) {
    const fallback = document.querySelector("[data-static-correlation]");
    try {
      initializePlot(root, points);
      fallback.hidden = true;
    } catch (error) {
      root.hidden = true;
      fallback.hidden = false;
      const notice = document.querySelector(".scatter-error");
      notice.textContent = `The interactive plot could not be loaded: ${error.message}. The original figure is shown below.`;
      notice.hidden = false;
      console.error("Interactive accuracy plot initialization failed", error);
    }
  }
}
