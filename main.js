import { parseHurdat2, findStorm } from "./hurdat2-parser.js";

const db = parseHurdat2();

const input = document.getElementById("stormSearch");
const button = document.getElementById("stormSearchBtn");
const matchesEl = document.getElementById("stormMatches");
const output = document.getElementById("stormOutput");
const animateStormBtn = document.getElementById("animateStormBtn");

let animationId = null;
let animationRunning = false;

const seasonYearInput = document.getElementById("seasonYear");
const plotSeasonBtn = document.getElementById("plotSeasonBtn");

plotSeasonBtn.addEventListener("click", plotSeasonFromInput);

const canvas = document.getElementById("trackCanvas");
const ctx = canvas.getContext("2d");

let lastStormForRedraw = null;

let currentView = "WORLD";

const mapImg = new Image();
// If you ever use a URL map (not local), keep this line:
mapImg.crossOrigin = "anonymous";

const hurricaneImg = new Image();
hurricaneImg.src = "/images/hurricane_icon.png";

// IMPORTANT: use a ROOT-relative path if possible:
mapImg.src = "/images/nasa_world_map.jpg";

mapImg.onload = () => {
  console.log("[map] loaded OK:", mapImg.src, mapImg.naturalWidth, mapImg.naturalHeight);
  // Redraw the last selected storm now that the map exists
  if (lastStormForRedraw) drawTrack(lastStormForRedraw);
};

mapImg.onerror = () => {
  console.error("[map] FAILED:", mapImg.src);
};

button.addEventListener("click", runSearch);
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") runSearch();
});

const BASINS = {
    WORLD: {minLat:-90, maxLat:90, minLon:-180, maxLon:180},

    NATL: {minLat:0, maxLat:60, minLon:-110, maxLon:-10},

    EPAC: {minLat:0, maxLat:50, minLon:-180, maxLon:-70},

    WPAC: {minLat:0, maxLat:60, minLon:100, maxLon:180},

    NIO: {minLat:0, maxLat:40, minLon:40, maxLon:110},

    SWIO: {minLat:-45, maxLat:10, minLon:20, maxLon:120},

    AUS: {minLat:-45, maxLat:0, minLon:90, maxLon:170},

    SPAC: {minLat:-50, maxLat:0, minLon:140, maxLon:-100}
};

function runSearch() {
  const q = input.value.trim();
  clearMatches();
  output.textContent = "";

  if (!q) {
    output.textContent = "Type a storm ID or name.";
    return;
  }

  const result = findStorm(db, q);

  if (!result) {
    output.textContent = "No matches.";
    return;
  }

  // If multiple matches, create a button for each.
  if (Array.isArray(result)) {
    // Sort a bit: exact starts-with first, then alphabetical
    const uq = q.toUpperCase();
    const sorted = [...result].sort((a, b) => {
      const aScore =
        (a.id.toUpperCase().startsWith(uq) ? 2 : 0) +
        ((a.name || "").toUpperCase().startsWith(uq) ? 1 : 0);
      const bScore =
        (b.id.toUpperCase().startsWith(uq) ? 2 : 0) +
        ((b.name || "").toUpperCase().startsWith(uq) ? 1 : 0);
      if (aScore !== bScore) return bScore - aScore;
      return a.id.localeCompare(b.id);
    });

    sorted.forEach(storm => addStormButton(storm));
    output.textContent = `Found ${sorted.length} storms. Click one of the buttons above.`;
    return;
  }

  // If single storm, show it immediately + also provide one button.
  addStormButton(result);
  renderStormAllPoints(result);
}

function addStormButton(storm) {
  // Custom tag requested: <searchbutton>
  const btn = document.createElement("searchbutton");
  btn.textContent = stormLabel(storm);
  // Make it behave like a button (since it's a custom element)
  btn.style.display = "inline-block";
  btn.style.cursor = "pointer";
  btn.style.padding = "6px 10px";
  btn.style.margin = "6px 6px 0 0";
  btn.style.border = "1px solid #bbb";
  btn.style.borderRadius = "10px";
  btn.style.userSelect = "none";
  const peak = peakWindKt(storm);
    const cat = saffirSimpsonFromWind(peak);

    btn.style.background = categoryColor(cat);
    btn.style.color = categoryTextColor(cat);

  btn.addEventListener("click", () => {
    renderStormAllPoints(storm);
    drawTrack(storm);
  });

  matchesEl.appendChild(btn);
}

function renderStormAllPoints(storm) {
  clearMatchesSelectionHighlight();
  highlightButtonForStorm(storm);

  // Print ALL datapoints (every entry)
  // Keep it preformatted in <pre>
  const header =
    `${storm.id} — ${storm.name}\n` +
    `Points: ${storm.entries.length}\n\n` +
    `date time  status  lat  lon  wind(kt)  pres(mb)\n` +
    `------------------------------------------------\n`;

  const lines = storm.entries.map(e => {
    const lat = e.lat ?? "";
    const lon = e.lon ?? "";
    const wind = e.wind ?? "";
    const pres = e.pressure ?? "";
    return `${e.date} ${e.time}  ${pad(e.status, 3)}  ${pad(lat, 6)}  ${pad(lon, 7)}  ${pad(wind, 7)}  ${pad(pres, 7)}`;
  });

  output.textContent = header + lines.join("\n");
}

function clearMatches() {
  matchesEl.innerHTML = "";
}

function pad(val, width) {
  const s = String(val);
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}

function clearMatchesSelectionHighlight() {
  const kids = matchesEl.querySelectorAll("searchbutton");
  kids.forEach(k => {
    k.style.outline = "none";
    k.style.boxShadow = "none";
  });
}

function highlightButtonForStorm(storm) {
  const kids = matchesEl.querySelectorAll("searchbutton");
  kids.forEach(k => {
    if (k.dataset.stormId === storm.id) {
      k.style.outline = "3px solid black";
      k.style.boxShadow = "0 0 0 2px white inset";
    }
  });
}

function stormLabel(storm) {
  // Extract year from ID: AL052019 -> 2019
  const year = storm.id.slice(-4);

  const name = (storm.name || "").toUpperCase();

  if (name === "UNNAMED") {
    return `UNNAMED ${year}`;
  }

  // Capitalize nicely: DORIAN -> Dorian
  const prettyName =
    name.charAt(0) + name.slice(1).toLowerCase();

  return `${prettyName} ${year}`;
}

function peakWindKt(storm) {
  let max = null;
  for (const e of storm.entries) {
    if (typeof e.wind === "number") {
      if (max === null || e.wind > max) max = e.wind;
    }
  }
  return max;
}

function saffirSimpsonFromWind(windKt) {
  if (windKt == null) return null;

  if (windKt < 34) return "TD";
  if (windKt < 64) return "TS";
  if (windKt < 83) return "C1";
  if (windKt < 96) return "C2";
  if (windKt < 113) return "C3";
  if (windKt < 137) return "C4";
  return "C5";
}

function categoryColor(cat) {
  switch (cat) {
    case "TD": return "rgb(110, 194, 235)"; // 0.43,0.76,0.92
    case "TS": return "rgb(76, 255, 255)";  // 0.3,1,1
    case "C1": return "rgb(255, 255, 217)"; // 1,1,0.85
    case "C2": return "rgb(255, 217, 140)"; // 1,0.85,0.55
    case "C3": return "rgb(255, 158, 89)";  // 1,0.62,0.35
    case "C4": return "rgb(255, 115, 138)"; // 1,0.45,0.54
    case "C5": return "rgb(140, 117, 230)"; // 0.55,0.46,0.90
    default:   return "#ddd";
  }
}

function categoryTextColor(cat) {
  if (cat === "C3" || cat === "C4" || cat === "C5") return "white";
  return "black";
}



// Convert lat/lon to canvas XY using fitted bounds (equirectangular)
function makeProjector(points, w, h, pad = 30) {
  // filter valid points
  const pts = points.filter(p => typeof p.lat === "number" && typeof p.lon === "number");
  if (pts.length < 2) return null;

  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const p of pts) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  }

  // handle totally flat bounds
  if (minLat === maxLat) { minLat -= 0.5; maxLat += 0.5; }
  if (minLon === maxLon) { minLon -= 0.5; maxLon += 0.5; }

  const x0 = pad, y0 = pad;
  const x1 = w - pad, y1 = h - pad;

  const lonSpan = (maxLon - minLon);
  const latSpan = (maxLat - minLat);

  // map lon -> x, lat -> y (inverted because canvas y goes down)
  function projectLatLon(lat, lon, w, h) {
  // Equirectangular projection
  const x = ((lon + 180) / 360) * w;
  const y = ((90 - lat) / 180) * h;
  return { x, y };
}

  return { project, bounds: { minLat, maxLat, minLon, maxLon } };
}

function clearCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // white background (optional, looks nicer)
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function projectLatLon(lat, lon, w, h) {

    const b = BASINS[currentView];

    let x;

    if (b.minLon < b.maxLon) {

        x = (lon - b.minLon) /
            (b.maxLon - b.minLon);

    } else {

        let adjLon = lon;

        if (adjLon < 0) adjLon += 360;

        let minLon = b.minLon;
        let maxLon = b.maxLon + 360;

        x = (adjLon - minLon) /
            (maxLon - minLon);
    }

    const y =
        (b.maxLat - lat) /
        (b.maxLat - b.minLat);

    return {
        x: x * w,
        y: y * h
    };
}
function drawTrack(storm) {
  lastStormForRedraw = storm;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw map background if it's actually loaded
  if (mapImg.complete && mapImg.naturalWidth > 0) {
    drawBackgroundMap();
  } else {
    // fallback
    ctx.fillStyle = "#d9d9d9";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  const pts = storm.entries.filter(
    e => typeof e.lat === "number" && typeof e.lon === "number"
  );
  if (pts.length < 2) return;

  // line
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const p = projectLatLon(pts[i].lat, pts[i].lon, canvas.width, canvas.height);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.stroke();

  // points
  // Draw points (shape by type, color by intensity)
for (const e of pts) {
  const p = projectLatLon(e.lat, e.lon, canvas.width, canvas.height);

  const cat = saffirSimpsonFromWind(e.wind);
  const type = pointTypeFromStatus(e.status);

  const size = 3; // tweak if you want bigger markers

  drawMarker(ctx, p.x, p.y, type, size);

  ctx.fillStyle = categoryColor(cat);
  ctx.fill();

  ctx.strokeStyle = "#000";
  ctx.lineWidth = 0.8;
  ctx.stroke();
}
}

function pointTypeFromStatus(statusRaw) {
  const s = (statusRaw || "").trim().toUpperCase();

  // Subtropical
  if (s === "SD" || s === "SS") return "SUBTROPICAL";

  // Non-tropical / not purely tropical in HURDAT2 labels
  // (common codes: EX=extratropical, LO=low, WV=wave, DB=disturbance)
  if (s === "EX" || s === "LO" || s === "WV" || s === "DB") return "NONTROPICAL";

  return "TROPICAL";
}

function drawMarker(ctx, x, y, type, size) {
  ctx.beginPath();

  if (type === "NONTROPICAL") {
    // triangle (pointing up)
    ctx.moveTo(x, y - size);
    ctx.lineTo(x - size, y + size);
    ctx.lineTo(x + size, y + size);
    ctx.closePath();
    return;
  }

  if (type === "SUBTROPICAL") {
    // square
    ctx.rect(x - size, y - size, size * 2, size * 2);
    return;
  }

  // default: circle (tropical)
  ctx.arc(x, y, size, 0, Math.PI * 2);
}

function stormYear(storm) {
  return storm.id.slice(-4);
}

function getStormsByYear(year) {
  return db.storms.filter(storm => stormYear(storm) === String(year));
}

function plotSeasonFromInput() {
  const year = seasonYearInput.value.trim();

  if (!year) {
    output.textContent = "Type a year first.";
    return;
  }

  const storms = getStormsByYear(year);

  if (storms.length === 0) {
    output.textContent = `No storms found for ${year}.`;
    return;
  }

  drawSeason(storms);

  const strongestWindStorm = strongestByWind(storms);
  const strongestPressureStorm = strongestByLowestPressure(storms);

  output.textContent =
    `${year} season\n` +
    `Storms: ${storms.length}\n\n` +

    `Strongest by wind:\n` +
    `${stormLabel(strongestWindStorm)} — peak ${peakWindKt(strongestWindStorm)} kt, ${peakPressureMb(strongestWindStorm)} mb\n\n` +

    `Strongest by pressure:\n` +
    `${stormLabel(strongestPressureStorm)} — peak ${peakWindKt(strongestPressureStorm)} kt, ${peakPressureMb(strongestPressureStorm)} mb\n\n` +

    `All storms:\n` +
    storms.map(s =>
      `${stormLabel(s)} — peak ${peakWindKt(s)} kt, ${peakPressureMb(s)} mb`
    ).join("\n");
}

function drawSeason(storms) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (mapImg.complete && mapImg.naturalWidth > 0) {
    drawBackgroundMap();
  } else {
    ctx.fillStyle = "#d9d9d9";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  for (const storm of storms) {
    drawStormTrackOnly(storm);
  }
}

function drawStormTrackOnly(storm) {
  const pts = storm.entries.filter(
    e => typeof e.lat === "number" && typeof e.lon === "number"
  );

  if (pts.length < 2) return;

  ctx.beginPath();

  for (let i = 0; i < pts.length; i++) {
    const p = projectLatLon(pts[i].lat, pts[i].lon, canvas.width, canvas.height);

    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  for (const e of pts) {
    const p = projectLatLon(e.lat, e.lon, canvas.width, canvas.height);

    const cat = saffirSimpsonFromWind(e.wind);
    const type = pointTypeFromStatus(e.status);

    drawMarker(ctx, p.x, p.y, type, 2.5);

    ctx.fillStyle = categoryColor(cat);
    ctx.fill();

    ctx.strokeStyle = "#000";
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }
}

function peakPressureMb(storm) {
  let min = null;

  for (const e of storm.entries) {
    if (typeof e.pressure === "number" && e.pressure > 0) {
      if (min === null || e.pressure < min) min = e.pressure;
    }
  }

  return min ?? "unknown";
}

function strongestByWind(storms) {
  return storms.reduce((best, storm) => {
    if (!best) return storm;

    const stormWind = peakWindKt(storm) ?? -Infinity;
    const bestWind = peakWindKt(best) ?? -Infinity;

    return stormWind > bestWind ? storm : best;
  }, null);
}

function hurdatTimestamp(date, time) {
    if (!date || !time) return null;

    // HURDAT:
    // date = YYYYMMDD
    // time = HHMM

    const year =
        Number(date.slice(0, 4));

    const month =
        Number(date.slice(4, 6)) - 1;

    const day =
        Number(date.slice(6, 8));

    const hour =
        Number(time.slice(0, 2));

    const minute =
        Number(time.slice(2, 4));

    return Date.UTC(
        year,
        month,
        day,
        hour,
        minute
    );
}

function animateStorm(storm) {
    // Stop previous animation
    if (animationId !== null) {
        cancelAnimationFrame(animationId);
    }

    const pts = storm.entries
        .filter(e =>
            typeof e.lat === "number" &&
            typeof e.lon === "number"
        )
        .map(e => ({
            ...e,
            timestamp: hurdatTimestamp(e.date, e.time)
        }))
        .filter(e => e.timestamp !== null);

    if (pts.length < 2) return;

    animationRunning = true;

    // How fast simulated time passes.
    // 1 real second = 6 simulated hours
    const SIM_HOURS_PER_SECOND = 12;

    const startTime = pts[0].timestamp;
    const endTime = pts[pts.length - 1].timestamp;

    const realStart = performance.now();

    function animate(now) {
        const realElapsedSeconds =
            (now - realStart) / 1000;

        const simulatedElapsedMs =
            realElapsedSeconds *
            SIM_HOURS_PER_SECOND *
            60 * 60 * 1000;

        const currentSimTime =
            startTime + simulatedElapsedMs;

        // Animation finished
        if (currentSimTime >= endTime) {
            drawTrack(storm);

            const last = pts[pts.length - 1];

            const p = projectLatLon(
                last.lat,
                last.lon,
                canvas.width,
                canvas.height
            );

            drawHurricaneIcon(
                p.x,
                p.y,
                -performance.now() / 300
            );

            animationRunning = false;
            animationId = null;

            return;
        }

        // Find which two HURDAT points surround the current time
        let index = 0;

        for (let i = 0; i < pts.length - 1; i++) {
            if (
                currentSimTime >= pts[i].timestamp &&
                currentSimTime <= pts[i + 1].timestamp
            ) {
                index = i;
                break;
            }
        }

        const current = pts[index];
        const next = pts[index + 1];

        const segmentDuration =
            next.timestamp - current.timestamp;

        const segmentElapsed =
            currentSimTime - current.timestamp;

        const progress =
            segmentDuration > 0
                ? segmentElapsed / segmentDuration
                : 0;

        const p1 = projectLatLon(
            current.lat,
            current.lon,
            canvas.width,
            canvas.height
        );

        const p2 = projectLatLon(
            next.lat,
            next.lon,
            canvas.width,
            canvas.height
        );

        const x =
            p1.x + (p2.x - p1.x) * progress;

        const y =
            p1.y + (p2.y - p1.y) * progress;

        // Redraw map + track
        drawTrack(storm);

        // Counterclockwise rotation
        const rotation =
            -performance.now() / 300;

        drawHurricaneIcon(
            x,
            y,
            rotation
        );

        animationId =
            requestAnimationFrame(animate);
    }

    animationId =
        requestAnimationFrame(animate);
}

function drawHurricaneIcon(x, y, rotation = 0) {
    const size = 35;

    if (!hurricaneImg.complete || hurricaneImg.naturalWidth === 0) {
        return;
    }

    ctx.save();

    ctx.translate(x, y);
    ctx.rotate(rotation);

    ctx.drawImage(
        hurricaneImg,
        -size / 2,
        -size / 2,
        size,
        size
    );

    ctx.restore();
}

function strongestByLowestPressure(storms) {
  return storms.reduce((best, storm) => {
    if (!best) return storm;

    const stormPressure = pressureForCompare(storm);
    const bestPressure = pressureForCompare(best);

    return stormPressure < bestPressure ? storm : best;
  }, null);
}

function pressureForCompare(storm) {
  const p = peakPressureMb(storm);
  return typeof p === "number" ? p : Infinity;
}

function drawBackgroundMap() {
  if (!(mapImg.complete && mapImg.naturalWidth > 0)) {
    ctx.fillStyle = "#d9d9d9";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const b = BASINS[currentView];

  const imgW = mapImg.naturalWidth;
  const imgH = mapImg.naturalHeight;

  function lonToX(lon) {
    return ((lon + 180) / 360) * imgW;
  }

  function latToY(lat) {
    return ((90 - lat) / 180) * imgH;
  }

  const sy = latToY(b.maxLat);
  const sh = latToY(b.minLat) - sy;

  // Normal basins
  if (b.minLon <= b.maxLon) {
    const sx = lonToX(b.minLon);
    const sw = lonToX(b.maxLon) - sx;

    ctx.drawImage(
      mapImg,
      sx, sy, sw, sh,
      0, 0, canvas.width, canvas.height
    );

    return;
  }

  // Dateline-crossing basins, like SPAC
  const sx1 = lonToX(b.minLon);
  const sw1 = imgW - sx1;

  const sx2 = 0;
  const sw2 = lonToX(b.maxLon);

  const total = sw1 + sw2;
  const dw1 = canvas.width * (sw1 / total);
  const dw2 = canvas.width - dw1;

  ctx.drawImage(
    mapImg,
    sx1, sy, sw1, sh,
    0, 0, dw1, canvas.height
  );

  ctx.drawImage(
    mapImg,
    sx2, sy, sw2, sh,
    dw1, 0, dw2, canvas.height
  );
}

document
.querySelectorAll(".basinBtn")
.forEach(btn => {

    btn.addEventListener("click", () => {

        currentView =
            btn.dataset.basin;

        document
        .querySelectorAll(".basinBtn")
        .forEach(b => b.classList.remove("active"));

        btn.classList.add("active");

        if (lastStormForRedraw) {
            drawTrack(lastStormForRedraw);
        }
    });

});

animateStormBtn.addEventListener("click", () => {
    if (lastStormForRedraw) {
        animateStorm(lastStormForRedraw);
    }
});
