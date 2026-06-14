const DATA_URL = "./iberia-risk-field/data/iberia-risk.json";

const COLORS = {
  low: "#4f8661",
  lowmedium: "#8ea66c",
  mediumhigh: "#d0a03a",
  high: "#be623e",
  extreme: "#893131",
  nodata: "#a8afaa",
};

const root = document.querySelector("[data-risk-field]");
const canvas = root.querySelector("[data-map]");
const stage = canvas.closest(".risk-map-stage");
const context = canvas.getContext("2d", { alpha: true });
const cue = root.querySelector("[data-cue]");

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

let data;
let points = [];
let boundaryPaths = [];
let width = 0;
let height = 0;
let dpr = 1;
let frameRequest = 0;
let isVisible = true;
let loadStartedAt = performance.now();
let lastFrame = loadStartedAt;

const pointer = {
  x: 0,
  y: 0,
  smoothX: 0,
  smoothY: 0,
  active: false,
  pressed: false,
  type: "mouse",
};

function allCoordinates(geometry) {
  const coordinates = [];
  const visit = (value) => {
    if (
      Array.isArray(value) &&
      value.length >= 2 &&
      typeof value[0] === "number" &&
      typeof value[1] === "number"
    ) {
      coordinates.push(value);
      return;
    }
    if (Array.isArray(value)) value.forEach(visit);
  };
  visit(geometry.coordinates);
  return coordinates;
}

function createProjection(mapWidth, mapHeight) {
  const isMobile = mapWidth < 620;
  const bounds = [-9.85, 35.55, 4.45, 44.05];
  const [minLon, minLat, maxLon, maxLat] = bounds;
  // Longitude degrees narrow with latitude. Correcting by the midpoint cosine
  // avoids the horizontal stretch produced by plotting raw lon/lat degrees.
  const standardLatitude = ((minLat + maxLat) / 2) * Math.PI / 180;
  const longitudeScale = Math.cos(standardLatitude);
  const projectedWidth = (maxLon - minLon) * longitudeScale;
  const projectedHeight = maxLat - minLat;
  const padding = isMobile
    ? { left: 13, right: 13, top: 116, bottom: 72 }
    : { left: mapWidth * .075, right: mapWidth * .17, top: 35, bottom: 40 };
  const scale = Math.min(
    (mapWidth - padding.left - padding.right) / projectedWidth,
    (mapHeight - padding.top - padding.bottom) / projectedHeight
  );
  const contentWidth = projectedWidth * scale;
  const contentHeight = projectedHeight * scale;
  const offsetX = padding.left + (mapWidth - padding.left - padding.right - contentWidth) / 2;
  const offsetY = padding.top + (mapHeight - padding.top - padding.bottom - contentHeight) / 2;

  return ([lon, lat]) => [
    offsetX + (lon - minLon) * longitudeScale * scale,
    mapHeight - offsetY - (lat - minLat) * scale,
  ];
}

function addGeometryToPath(path, geometry, project) {
  const addRing = (ring) => {
    ring.forEach((coordinate, index) => {
      const [x, y] = project(coordinate);
      if (index === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    });
    path.closePath();
  };

  if (geometry.type === "Polygon") {
    geometry.coordinates.forEach(addRing);
  } else if (geometry.type === "MultiPolygon") {
    geometry.coordinates.forEach((polygon) => polygon.forEach(addRing));
  }
}

function hash(row, index) {
  const value = Math.sin(row.lon * 91.31 + row.lat * 47.77 + index * 13.1) * 43758.5453;
  return value - Math.floor(value);
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  width = Math.max(1, rect.width);
  height = Math.max(1, rect.height);
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  if (!data) return;
  const project = createProjection(width, height);
  const maxArea = Math.max(...data.almond_grid.map((row) => row.area_ha));
  const radiusScale = width < 620 ? 1.6 : Math.max(1.35, Math.min(2.25, width / 720));

  boundaryPaths = data.iberia_boundaries.features
    .filter((feature) => {
      const coords = allCoordinates(feature.geometry);
      return coords.some((coordinate) => coordinate[1] > 35.5);
    })
    .map((feature) => {
      const path = new Path2D();
      addGeometryToPath(path, feature.geometry, project);
      return { path, country: feature.properties.country_code };
    });

  points = data.almond_grid
    .map((row, index) => {
      const [x, y] = project([row.lon, row.lat]);
      return {
        ...row,
        x,
        y,
        radius: (.68 + Math.sqrt(row.area_ha / maxArea) * 3.15) * radiusScale,
        seed: hash(row, index),
      };
    })
    .filter((point) => point.x > -20 && point.x < width + 20 && point.y > -20 && point.y < height + 20)
    .sort((a, b) => a.area_ha - b.area_ha);

  draw(performance.now());
}

function drawBoundary() {
  context.save();
  context.lineJoin = "round";
  boundaryPaths.forEach(({ path, country }) => {
    context.fillStyle = country === "PT" ? "rgba(72, 130, 134, .09)" : "rgba(48, 82, 82, .035)";
    context.fill(path, "evenodd");
    context.strokeStyle = country === "PT" ? "rgba(48, 82, 82, .48)" : "rgba(48, 82, 82, .28)";
    context.lineWidth = country === "PT" ? 1.15 : .72;
    context.stroke(path);
  });
  context.restore();
}

function drawLabels(project) {
  const labels = width < 620
    ? [
        ["PORTUGAL", -8.35, 40.0, ".58rem"],
        ["SPAIN", -3.6, 41.0, ".64rem"],
      ]
    : [
        ["ATLANTIC", -9.25, 39.15, ".62rem"],
        ["PORTUGAL", -8.05, 40.35, ".7rem"],
        ["SPAIN", -3.2, 41.4, ".76rem"],
        ["MEDITERRANEAN", 1.5, 37.2, ".62rem"],
      ];

  context.save();
  context.fillStyle = "rgba(48, 82, 82, .58)";
  context.textAlign = "center";
  labels.forEach(([label, lon, lat, size]) => {
    const [x, y] = project([lon, lat]);
    context.font = `600 ${size} Inter, sans-serif`;
    context.letterSpacing = "0.16em";
    context.fillText(label, x, y);
  });
  context.restore();
}

function smoothstep(value) {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
}

function draw(time) {
  frameRequest = 0;
  if (!data || !width || !height) return;

  const elapsed = time - loadStartedAt;
  const delta = Math.min(32, time - lastFrame);
  lastFrame = time;
  const project = createProjection(width, height);
  const easeFactor = reducedMotion.matches ? 1 : 1 - Math.pow(.001, delta / 1000);

  pointer.smoothX += (pointer.x - pointer.smoothX) * easeFactor;
  pointer.smoothY += (pointer.y - pointer.smoothY) * easeFactor;

  context.clearRect(0, 0, width, height);
  drawBoundary();

  const lensRadius = Math.max(80, Math.min(155, width * .105));

  points.forEach((point) => {
    const dx = point.x - pointer.smoothX;
    const dy = point.y - pointer.smoothY;
    const distance = Math.hypot(dx, dy);
    const lensStrength = pointer.active ? smoothstep(1 - distance / lensRadius) : 0;
    const safeDistance = Math.max(distance, 1);
    const pressure = lensStrength * (width < 620 ? 7 : 12);
    const phase = time * .0022 + point.seed * Math.PI * 2;
    const agitation = reducedMotion.matches ? 0 : lensStrength * Math.sin(phase) * 1.15;
    const x = point.x + (dx / safeDistance) * pressure + Math.cos(phase) * agitation;
    const y = point.y + (dy / safeDistance) * pressure + Math.sin(phase) * agitation;
    const radius = point.radius * (1 + lensStrength * (1.2 + point.seed * .55));
    const reveal = reducedMotion.matches ? 1 : smoothstep((elapsed - point.seed * 650) / 720);

    context.beginPath();
    context.arc(x, y, Math.max(.3, radius * reveal), 0, Math.PI * 2);
    context.globalAlpha = (.72 + lensStrength * .25) * reveal;
    context.fillStyle = COLORS[point.bau2030] || COLORS.nodata;
    context.fill();

    if (lensStrength > .5 && radius > 2.2) {
      context.globalAlpha = lensStrength * .55;
      context.strokeStyle = "#f4f1e9";
      context.lineWidth = .55;
      context.stroke();
    }
  });

  context.globalAlpha = 1;
  drawLabels(project);

  if (pointer.active) {
    context.save();
    context.beginPath();
    context.arc(pointer.smoothX, pointer.smoothY, lensRadius, 0, Math.PI * 2);
    context.strokeStyle = "rgba(48, 82, 82, .24)";
    context.lineWidth = 1;
    context.setLineDash([2, 6]);
    context.stroke();
    context.restore();
  }

  const animating =
    !reducedMotion.matches &&
    isVisible &&
    (pointer.active ||
      elapsed < 1600 ||
      Math.abs(pointer.smoothX - pointer.x) > .1 ||
      Math.abs(pointer.smoothY - pointer.y) > .1);

  if (animating) requestFrame();
}

function requestFrame() {
  if (!frameRequest) frameRequest = requestAnimationFrame(draw);
}

function updatePointer(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = event.clientX - rect.left;
  pointer.y = event.clientY - rect.top;
  pointer.type = event.pointerType;
  pointer.active = event.pointerType === "mouse" || pointer.pressed;
  cue.classList.add("is-hidden");
  requestFrame();
}

canvas.addEventListener("pointerenter", (event) => {
  if (event.pointerType === "mouse") {
    pointer.active = true;
    updatePointer(event);
  }
});

canvas.addEventListener("pointermove", updatePointer);

canvas.addEventListener("pointerdown", (event) => {
  pointer.pressed = true;
  pointer.active = true;
  canvas.setPointerCapture(event.pointerId);
  updatePointer(event);
});

canvas.addEventListener("pointerup", (event) => {
  pointer.pressed = false;
  if (event.pointerType !== "mouse") pointer.active = false;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  requestFrame();
});

canvas.addEventListener("pointercancel", () => {
  pointer.pressed = false;
  pointer.active = false;
  requestFrame();
});

canvas.addEventListener("pointerleave", (event) => {
  if (event.pointerType === "mouse") {
    pointer.active = false;
    requestFrame();
  }
});

new ResizeObserver(resize).observe(canvas);

new IntersectionObserver(([entry]) => {
  isVisible = entry.isIntersecting;
  if (isVisible) requestFrame();
}, { threshold: .05 }).observe(stage);

reducedMotion.addEventListener("change", () => {
  requestFrame();
});

async function init() {
  if (window.IBERIA_RISK_DATA) {
    data = window.IBERIA_RISK_DATA;
  } else {
    const response = await fetch(DATA_URL);
    if (!response.ok) throw new Error(`Could not load ${DATA_URL}`);
    data = await response.json();
  }
  if (document.fonts?.ready) await document.fonts.ready;
  loadStartedAt = performance.now();
  lastFrame = loadStartedAt;
  resize();
  root.dataset.ready = "true";
}

init().catch((error) => {
  console.error(error);
});
