const map = L.map("map", { zoomControl: true });

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

map.fitBounds([
  [-22.6, 25.0],
  [-14.9, 33.2]
]);

const suitabilityColors = {
  1: "#f03b20",
  2: "#feb24c",
  3: "#2ca25f"
};

const diffColors = {
  1: "#b2182b",
  2: "#ef8a62",
  3: "#f7f7f7",
  4: "#99d594",
  5: "#1b7837"
};

// Limiting-factor descriptors used in legend + popups.
// If your CropSuite codebook differs, edit this table in one place.
const factorDescriptors = {
  0: "No dominant limiting factor",
  1: "Temperature",
  2: "Precipitation",
  3: "Climate variability (failure risk)",
  4: "Slope / terrain",
  5: "Soil depth",
  6: "Soil texture",
  7: "Coarse fragments",
  8: "Gypsum",
  9: "Base saturation",
  10: "Soil pH",
  11: "Organic carbon",
  12: "Salinity / sodicity"
};

function factorColor(code) {
  const n = Number(code) || 0;
  const hue = (n * 37) % 360;
  return `hsl(${hue} 64% 48%)`;
}

const layers = [
  {
    id: "mask",
    title: "Base Mask Suitability",
    file: "./data/zw_cocoa_mask_ir_var.geojson",
    opacity: 0.65,
    style: (p, o) => ({ color: "#5f5340", weight: 0.4, fillColor: suitabilityColors[p.suit_class] || "#999", fillOpacity: o }),
    legend: [
      [suitabilityColors[1], "Marginal (1-32)"],
      [suitabilityColors[2], "Moderate (33-74)"],
      [suitabilityColors[3], "High (75-100)"]
    ],
    popupFields: ["suit_label", "suit_class", "area_ha", "mask_scenario"]
  },
  {
    id: "climate",
    title: "Climate Suitability",
    file: "./data/zw_cocoa_climate_ir_var.geojson",
    opacity: 0.7,
    style: (p, o) => ({ color: "#5f5340", weight: 0.4, fillColor: suitabilityColors[p.climate_class] || "#999", fillOpacity: o }),
    legend: [
      [suitabilityColors[1], "Marginal (1-32)"],
      [suitabilityColors[2], "Moderate (33-74)"],
      [suitabilityColors[3], "High (75-100)"]
    ],
    popupFields: ["clim_label", "climate_class", "area_ha", "mask_scenario"]
  },
  {
    id: "limiting",
    title: "Most Limiting Factor",
    file: "./data/zw_cocoa_limiting_factor_ir_var.geojson",
    opacity: 0.72,
    style: (p, o) => ({ color: "#4f4f4f", weight: 0.3, fillColor: factorColor(p.factor_code), fillOpacity: o }),
    legendFromData: true,
    popupFields: ["factor_code", "factor_desc", "area_ha", "mask_scenario", "factor_note"]
  },
  {
    id: "uplift",
    title: "Irrigation Uplift (ir_var - rf_var)",
    file: "./data/zw_cocoa_uplift_irvar_minus_rfvar.geojson",
    opacity: 0.75,
    style: (p, o) => ({ color: "#585858", weight: 0.25, fillColor: diffColors[p.uplift_class] || "#999", fillOpacity: o }),
    legend: [
      [diffColors[1], "<= -20"],
      [diffColors[2], "(-20, -5]"],
      [diffColors[3], "(-5, 5]"],
      [diffColors[4], "(5, 20]"],
      [diffColors[5], "> 20"]
    ],
    popupFields: ["uplift_bin", "uplift_class", "area_ha", "scenario_a", "scenario_b"]
  },
  {
    id: "penalty",
    title: "Rainfed Variability Penalty (rf_novar - rf_var)",
    file: "./data/zw_cocoa_penalty_rfnovar_minus_rfvar.geojson",
    opacity: 0.75,
    style: (p, o) => ({ color: "#585858", weight: 0.25, fillColor: diffColors[p.penalty_class] || "#999", fillOpacity: o }),
    legend: [
      [diffColors[1], "<= -20"],
      [diffColors[2], "(-20, -5]"],
      [diffColors[3], "(-5, 5]"],
      [diffColors[4], "(5, 20]"],
      [diffColors[5], "> 20"]
    ],
    popupFields: ["penalty_bin", "penalty_class", "area_ha", "scenario_a", "scenario_b"]
  }
];

const state = Object.fromEntries(layers.map((l) => [l.id, {
  visible: false,
  loading: false,
  opacity: l.opacity,
  layerRef: null,
  geojson: null,
  dynamicLegend: null
}]));

const controlsEl = document.getElementById("layer-controls");
const legendEl = document.getElementById("legend");

function formatValue(v) {
  if (v === null || v === undefined) return "-";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(2);
  return String(v);
}

function popupHtml(props, fields) {
  const rows = fields
    .filter((f) => Object.prototype.hasOwnProperty.call(props, f))
    .map((f) => `<tr><td>${f}</td><td>${formatValue(props[f])}</td></tr>`)
    .join("");
  return `<table class="popup-table">${rows}</table>`;
}

function buildDynamicFactorLegend(features) {
  const codes = Array.from(new Set(features.map((f) => f.properties?.factor_code).filter((v) => v !== undefined && v !== null)))
    .map(Number)
    .sort((a, b) => a - b);
  return codes.map((code) => [factorColor(code), `Code ${code}: ${factorDescriptors[code] || "Unmapped descriptor"}`]);
}

async function loadLayer(layerCfg) {
  const st = state[layerCfg.id];
  if (st.layerRef) return st.layerRef;
  st.loading = true;

  const res = await fetch(layerCfg.file);
  if (!res.ok) throw new Error(`Failed to load ${layerCfg.file}`);
  const gj = await res.json();

  if (layerCfg.id === "limiting" && Array.isArray(gj.features)) {
    gj.features = gj.features.map((f) => {
      const props = f.properties || {};
      const code = Number(props.factor_code);
      return {
        ...f,
        properties: {
          ...props,
          factor_desc: factorDescriptors[code] || "Unmapped descriptor"
        }
      };
    });
  }

  st.geojson = gj;

  if (layerCfg.legendFromData) {
    st.dynamicLegend = buildDynamicFactorLegend(gj.features || []);
  }

  st.layerRef = L.geoJSON(gj, {
    style: (feature) => layerCfg.style(feature.properties || {}, st.opacity),
    onEachFeature: (feature, lyr) => {
      lyr.bindPopup(popupHtml(feature.properties || {}, layerCfg.popupFields));
    }
  });

  st.loading = false;
  return st.layerRef;
}

function refreshLayerStyle(layerCfg) {
  const st = state[layerCfg.id];
  if (!st.layerRef) return;
  st.layerRef.setStyle((feature) => layerCfg.style(feature.properties || {}, st.opacity));
}

function renderLegend() {
  const visible = layers.filter((l) => state[l.id].visible);
  if (!visible.length) {
    legendEl.innerHTML = "<p class='subtitle'>Turn on one or more overlays to view legends.</p>";
    return;
  }

  legendEl.innerHTML = visible.map((l) => {
    const st = state[l.id];
    const entries = l.legendFromData ? (st.dynamicLegend || []) : (l.legend || []);
    const rows = entries.map(([color, label]) => (
      `<div class="legend-row"><span class="swatch" style="background:${color}"></span><span>${label}</span></div>`
    )).join("");
    return `<div class="legend-card"><div class="legend-title">${l.title}</div>${rows}</div>`;
  }).join("");
}

function makeLayerControl(layerCfg) {
  const item = document.createElement("div");
  item.className = "layer-item";

  const head = document.createElement("div");
  head.className = "layer-head";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.id = `layer-${layerCfg.id}`;

  const label = document.createElement("label");
  label.htmlFor = checkbox.id;
  label.textContent = layerCfg.title;

  const opacityRow = document.createElement("div");
  opacityRow.className = "opacity-row";

  const opacityLabel = document.createElement("span");
  opacityLabel.textContent = "Opacity";

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = "100";
  slider.value = String(Math.round(layerCfg.opacity * 100));

  const valueTag = document.createElement("span");
  valueTag.textContent = `${slider.value}%`;

  slider.addEventListener("input", () => {
    const st = state[layerCfg.id];
    st.opacity = Number(slider.value) / 100;
    valueTag.textContent = `${slider.value}%`;
    refreshLayerStyle(layerCfg);
  });

  checkbox.addEventListener("change", async () => {
    const st = state[layerCfg.id];
    if (checkbox.checked) {
      checkbox.disabled = true;
      try {
        const layerRef = await loadLayer(layerCfg);
        layerRef.addTo(map);
        st.visible = true;
      } catch (err) {
        console.error(err);
        alert(`Layer load failed: ${layerCfg.title}`);
        checkbox.checked = false;
      } finally {
        checkbox.disabled = false;
      }
    } else {
      if (st.layerRef) map.removeLayer(st.layerRef);
      st.visible = false;
    }
    renderLegend();
  });

  head.appendChild(checkbox);
  head.appendChild(label);
  opacityRow.appendChild(opacityLabel);
  opacityRow.appendChild(slider);
  opacityRow.appendChild(valueTag);

  item.appendChild(head);
  item.appendChild(opacityRow);
  return item;
}

layers.forEach((cfg, idx) => {
  controlsEl.appendChild(makeLayerControl(cfg));
  if (idx === 1) {
    const checkbox = document.getElementById(`layer-${cfg.id}`);
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event("change"));
  }
});

renderLegend();
