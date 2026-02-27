const YEARS = [2020, 2021, 2022, 2023, 2024, 2025];
const STAGE_LABELS = {
  dormancy: "Dormancy",
  bud_bloom: "Bud and Bloom",
  growth: "Growth",
};

const MAP_MODES = {
  stage_risk: { label: "Stage Risk", min: 0, max: 100 },
  annual_chill: { label: "Annual Chill Percentile", min: 0, max: 1 },
  annual_wet: { label: "Annual Wet-Day Percentile", min: 0, max: 1 },
  annual_frost: { label: "Annual Frost Percentile", min: 0, max: 1 },
};

const state = {
  year: 2025,
  stage: "bud_bloom",
  mapMode: "stage_risk",
  selectedFieldId: null,
  yearCache: new Map(),
  geoCache: new Map(),
  map: null,
  geoLayer: null,
  trendChart: null,
  distChart: null,
};

const refs = {
  yearSelect: document.getElementById("yearSelect"),
  stageSelect: document.getElementById("stageSelect"),
  mapMetricSelect: document.getElementById("mapMetricSelect"),
  trendMetricSelect: document.getElementById("trendMetricSelect"),
  distMetricSelect: document.getElementById("distMetricSelect"),
  mapLegend: document.getElementById("mapLegend"),
  emptyState: document.getElementById("emptyState"),
  contentState: document.getElementById("contentState"),
  fieldTitle: document.getElementById("fieldTitle"),
  fieldSubtitle: document.getElementById("fieldSubtitle"),
  headlineText: document.getElementById("headlineText"),
  kpiChill: document.getElementById("kpiChill"),
  kpiChillPct: document.getElementById("kpiChillPct"),
  kpiWet: document.getElementById("kpiWet"),
  kpiWetPct: document.getElementById("kpiWetPct"),
  kpiPrecip: document.getElementById("kpiPrecip"),
  kpiPrecipPct: document.getElementById("kpiPrecipPct"),
  kpiStageRisk: document.getElementById("kpiStageRisk"),
  kpiStageBand: document.getElementById("kpiStageBand"),
  stageMatrixBody: document.getElementById("stageMatrixBody"),
  trendChart: document.getElementById("trendChart"),
  distChart: document.getElementById("distChart"),
  distNote: document.getElementById("distNote"),
};

async function fetchJSON(path) {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`Failed to load ${path}: ${res.status}`);
  }
  return res.json();
}

async function ensureYearData(year) {
  if (!state.yearCache.has(year)) {
    const profiles = await fetchJSON(`./data/field_profiles_${year}.json`);
    const byField = new Map(profiles.map((row) => [row.field_id, row]));
    state.yearCache.set(year, { profiles, byField });
  }
  return state.yearCache.get(year);
}

async function ensureGeoData(year) {
  if (!state.geoCache.has(year)) {
    const geo = await fetchJSON(`./data/fields_metrics_${year}.geojson`);
    state.geoCache.set(year, geo);
  }
  return state.geoCache.get(year);
}

function initControls() {
  for (const y of YEARS) {
    const option = document.createElement("option");
    option.value = String(y);
    option.textContent = String(y);
    if (y === state.year) option.selected = true;
    refs.yearSelect.appendChild(option);
  }
  refs.stageSelect.value = state.stage;
  refs.mapMetricSelect.value = state.mapMode;

  refs.yearSelect.addEventListener("change", async (e) => {
    state.year = Number(e.target.value);
    await renderYear();
  });

  refs.stageSelect.addEventListener("change", async (e) => {
    state.stage = e.target.value;
    refreshMapStyles();
    await refreshSidebar();
  });

  refs.mapMetricSelect.addEventListener("change", async (e) => {
    state.mapMode = e.target.value;
    refreshMapStyles();
    renderLegend();
    await refreshSidebar();
  });

  refs.trendMetricSelect.addEventListener("change", refreshSidebar);
  refs.distMetricSelect.addEventListener("change", refreshSidebar);
}

function initMap() {
  state.map = L.map("map", { zoomControl: true }).setView([38.5, -7.9], 8);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(state.map);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function blendColor(t) {
  const c1 = [233, 247, 239];
  const c2 = [248, 203, 123];
  const c3 = [214, 95, 73];
  const m = clamp(t, 0, 1);
  const [a, b, u] = m < 0.5 ? [c1, c2, m / 0.5] : [c2, c3, (m - 0.5) / 0.5];
  const mix = a.map((x, i) => Math.round(x + (b[i] - x) * u));
  return `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`;
}

function computePrecipPercentile(profiles, value) {
  const values = profiles.map((p) => Number(p.precip_total_mm)).sort((a, b) => a - b);
  let rank = 0;
  while (rank < values.length && values[rank] <= value) rank += 1;
  return rank / values.length;
}

function getStageRow(profile, stage) {
  return profile.stages.find((s) => s.stage === stage);
}

function getMapValue(profile, profiles) {
  if (!profile) return null;
  if (state.mapMode === "stage_risk") {
    const stage = getStageRow(profile, state.stage);
    return stage ? Number(stage.stage_risk_score) / 100 : null;
  }
  if (state.mapMode === "annual_chill") return Number(profile.percentile_chill);
  if (state.mapMode === "annual_wet") return Number(profile.percentile_wet);
  if (state.mapMode === "annual_frost") return Number(profile.percentile_frost);
  return null;
}

function styleFeature(feature) {
  const { byField, profiles } = state.yearCache.get(state.year);
  const fieldId = feature.properties.field_id;
  const profile = byField.get(fieldId);
  const mapValue = getMapValue(profile, profiles);
  const selected = fieldId === state.selectedFieldId;

  return {
    color: selected ? "#1f2937" : "#34454f",
    weight: selected ? 2.4 : 0.8,
    fillColor: mapValue == null ? "#d8d6d1" : blendColor(mapValue),
    fillOpacity: selected ? 0.82 : 0.68,
  };
}

function refreshMapStyles() {
  if (state.geoLayer) {
    state.geoLayer.setStyle((feature) => styleFeature(feature));
  }
}

function renderLegend() {
  const mode = MAP_MODES[state.mapMode];
  const left = state.mapMode === "stage_risk" ? "0" : "0th pct";
  const right = state.mapMode === "stage_risk" ? "100" : "100th pct";
  refs.mapLegend.innerHTML = `
    <strong>${mode.label}</strong>
    <div>${state.mapMode === "stage_risk" ? STAGE_LABELS[state.stage] : "National comparison"}</div>
    <div class="legend-bar"></div>
    <div class="legend-scale"><span>${left}</span><span>${right}</span></div>
  `;
}

async function renderYear() {
  await Promise.all([ensureYearData(state.year), ensureGeoData(state.year)]);
  const geo = state.geoCache.get(state.year);

  if (state.geoLayer) {
    state.map.removeLayer(state.geoLayer);
  }

  state.geoLayer = L.geoJSON(geo, {
    style: (feature) => styleFeature(feature),
    onEachFeature: (feature, layer) => {
      const fieldId = feature.properties.field_id;
      layer.bindTooltip(fieldId, { sticky: true });
      layer.on("click", () => {
        state.selectedFieldId = fieldId;
        refreshMapStyles();
        refreshSidebar();
      });
    },
  }).addTo(state.map);

  if (!state.selectedFieldId) {
    state.map.fitBounds(state.geoLayer.getBounds(), { padding: [20, 20] });
  }

  refreshMapStyles();
  renderLegend();
  await refreshSidebar();
}

function percentileLabel(pct) {
  return `${Math.round(Number(pct) * 100)}th percentile`;
}

function formatBand(band) {
  if (!band) return "-";
  return band[0].toUpperCase() + band.slice(1);
}

function makeBandBadge(band) {
  return `<span class="badge ${band}">${formatBand(band)}</span>`;
}

async function buildFieldTrend(fieldId) {
  const series = [];
  for (const y of YEARS) {
    const data = await ensureYearData(y);
    const profile = data.byField.get(fieldId);
    if (profile) series.push(profile);
  }
  return series;
}

function upsertTrendChart(labels, values, label, color) {
  if (state.trendChart) {
    state.trendChart.data.labels = labels;
    state.trendChart.data.datasets[0] = {
      label,
      data: values,
      borderColor: color,
      backgroundColor: "rgba(15,118,110,0.14)",
      pointRadius: 3,
      pointHoverRadius: 4,
      fill: true,
      tension: 0.25,
    };
    state.trendChart.update();
    return;
  }

  state.trendChart = new Chart(refs.trendChart, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label,
          data: values,
          borderColor: color,
          backgroundColor: "rgba(15,118,110,0.14)",
          pointRadius: 3,
          fill: true,
          tension: 0.25,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: "rgba(0,0,0,0.08)" } },
        y: { grid: { color: "rgba(0,0,0,0.08)" } },
      },
    },
  });
}

function buildHistogram(values, selectedValue, bins = 16) {
  const sorted = values.slice().sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const span = max - min || 1;
  const step = span / bins;
  const counts = Array.from({ length: bins }, () => 0);

  for (const v of sorted) {
    const idx = Math.min(bins - 1, Math.floor((v - min) / step));
    counts[idx] += 1;
  }
  const selIdx = Math.min(bins - 1, Math.floor((selectedValue - min) / step));
  const labels = counts.map((_, i) => {
    const a = min + i * step;
    const b = a + step;
    return `${a.toFixed(1)}-${b.toFixed(1)}`;
  });

  return { labels, counts, selIdx, min, max };
}

function upsertDistChart(hist) {
  const colors = hist.counts.map((_, idx) => (idx === hist.selIdx ? "#0f766e" : "#d7d0c2"));
  if (state.distChart) {
    state.distChart.data.labels = hist.labels;
    state.distChart.data.datasets[0].data = hist.counts;
    state.distChart.data.datasets[0].backgroundColor = colors;
    state.distChart.update();
    return;
  }

  state.distChart = new Chart(refs.distChart, {
    type: "bar",
    data: {
      labels: hist.labels,
      datasets: [
        {
          data: hist.counts,
          backgroundColor: colors,
          borderRadius: 4,
          barPercentage: 1,
          categoryPercentage: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: {
          ticks: { display: false },
          grid: { display: false },
        },
        y: { grid: { color: "rgba(0,0,0,0.08)" } },
      },
    },
  });
}

async function refreshSidebar() {
  if (!state.selectedFieldId) {
    refs.emptyState.classList.remove("hidden");
    refs.contentState.classList.add("hidden");
    return;
  }

  const { profiles, byField } = await ensureYearData(state.year);
  const profile = byField.get(state.selectedFieldId);
  if (!profile) {
    refs.emptyState.classList.remove("hidden");
    refs.contentState.classList.add("hidden");
    return;
  }

  refs.emptyState.classList.add("hidden");
  refs.contentState.classList.remove("hidden");

  const stageCurrent = getStageRow(profile, state.stage);
  const stageRiskPercentile = (() => {
    const values = profiles.map((p) => Number(getStageRow(p, state.stage)?.stage_risk_score ?? 0)).sort((a, b) => a - b);
    let rank = 0;
    while (rank < values.length && values[rank] <= Number(stageCurrent.stage_risk_score)) rank += 1;
    return rank / values.length;
  })();

  refs.fieldTitle.textContent = `Field ${state.selectedFieldId}`;
  refs.fieldSubtitle.textContent = `${state.year} | ${STAGE_LABELS[state.stage]}`;
  refs.headlineText.textContent = `${STAGE_LABELS[state.stage]} risk is ${Math.round(stageCurrent.stage_risk_score)} (${formatBand(stageCurrent.stage_risk_band)}) and ranks in the ${Math.round(stageRiskPercentile * 100)}th percentile nationally.`;

  refs.kpiChill.textContent = `${Math.round(profile.chill_hours)} h`;
  refs.kpiChillPct.textContent = percentileLabel(profile.percentile_chill);
  refs.kpiWet.textContent = `${profile.wet_days} days`;
  refs.kpiWetPct.textContent = percentileLabel(profile.percentile_wet);
  refs.kpiPrecip.textContent = `${Number(profile.precip_total_mm).toFixed(1)} mm`;
  refs.kpiPrecipPct.textContent = percentileLabel(computePrecipPercentile(profiles, Number(profile.precip_total_mm)));
  refs.kpiStageRisk.textContent = `${Math.round(stageCurrent.stage_risk_score)} / 100`;
  refs.kpiStageBand.innerHTML = makeBandBadge(stageCurrent.stage_risk_band);

  const stageRows = profile.stages
    .slice()
    .sort((a, b) => ["dormancy", "bud_bloom", "growth"].indexOf(a.stage) - ["dormancy", "bud_bloom", "growth"].indexOf(b.stage));
  refs.stageMatrixBody.innerHTML = stageRows
    .map((s) => `
      <tr>
        <td>${STAGE_LABELS[s.stage]}</td>
        <td>${Math.round(s.stage_risk_score)}</td>
        <td>${makeBandBadge(s.stage_risk_band)}</td>
        <td>${s.wet_days}</td>
        <td>${Math.round(s.chill_hours)}</td>
      </tr>
    `)
    .join("");

  const trendMetric = refs.trendMetricSelect.value;
  const fieldSeries = await buildFieldTrend(state.selectedFieldId);
  const trendValues = fieldSeries.map((row) => {
    if (trendMetric === "stage_risk") {
      return Number(getStageRow(row, state.stage).stage_risk_score);
    }
    return Number(row[trendMetric]);
  });
  const trendLabel = trendMetric === "stage_risk" ? `${STAGE_LABELS[state.stage]} risk score` : trendMetric.replaceAll("_", " ");
  upsertTrendChart(YEARS, trendValues, trendLabel, "#0f766e");

  const distMetric = refs.distMetricSelect.value;
  let distValues;
  let selectedValue;
  if (distMetric === "stage_risk") {
    distValues = profiles.map((p) => Number(getStageRow(p, state.stage).stage_risk_score));
    selectedValue = Number(stageCurrent.stage_risk_score);
  } else {
    distValues = profiles.map((p) => Number(p[distMetric]));
    selectedValue = Number(profile[distMetric]);
  }
  const hist = buildHistogram(distValues, selectedValue);
  upsertDistChart(hist);

  const distPct = (() => {
    const sorted = distValues.slice().sort((a, b) => a - b);
    let rank = 0;
    while (rank < sorted.length && sorted[rank] <= selectedValue) rank += 1;
    return Math.round((rank / sorted.length) * 100);
  })();
  refs.distNote.textContent = `Selected field value: ${selectedValue.toFixed(1)} (${distPct}th percentile in ${state.year}).`;
}

async function boot() {
  initControls();
  initMap();
  renderLegend();
  await renderYear();
}

boot().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  alert(`App failed to initialize: ${err.message}`);
});
