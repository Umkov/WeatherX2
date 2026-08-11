// hurdat2-parser.js
import { HURDAT2_DATA } from "./hurdat2-data.js";

export function parseHurdat2(text = HURDAT2_DATA) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const storms = [];
  const byId = new Map();

  let i = 0;
  while (i < lines.length) {
    const header = lines[i];
    const h = header.split(",").map(s => s.trim());
    if (h.length < 3) throw new Error(`Bad header at line ${i + 1}: ${header}`);

    const id = h[0];
    const name = h[1];
    const entryCount = parseInt(h[2], 10);
    if (!id || Number.isNaN(entryCount)) {
      throw new Error(`Invalid header values at line ${i + 1}: ${header}`);
    }

    const storm = { id, name, entryCount, entries: [] };

    for (let j = 0; j < entryCount; j++) {
      const line = lines[i + 1 + j];
      if (!line) throw new Error(`Missing entry for ${id} near line ${i + 2 + j}`);

      const p = line.split(",").map(s => s.trim());

      storm.entries.push({
        date: p[0] || "",
        time: p[1] || "",
        recordId: p[2] || "",
        status: p[3] || "",
        lat: parseLatLon(p[4]),
        lon: parseLatLon(p[5]),
        wind: toInt(p[6]),
        pressure: toInt(p[7]),
        extra: p.slice(8).map(x => (x === "" ? null : toIntMaybe(x)))
      });
    }

    storms.push(storm);
    byId.set(id.toUpperCase(), storm);
    i += 1 + entryCount;
  }

  return { storms, byId };
}

export function findStorm(db, query) {
  const q = (query || "").trim().toUpperCase();
  if (!q) return null;

  // exact id always returns one
  const byId = db.byId.get(q);
  if (byId) return byId;

  // exact name should return ALL storms with that name
  const exactNameMatches = db.storms.filter(
    s => (s.name || "").toUpperCase() === q
  );
  if (exactNameMatches.length === 1) return exactNameMatches[0];
  if (exactNameMatches.length > 1) return exactNameMatches;

  // otherwise partial match list
  const matches = db.storms.filter(s =>
    s.id.toUpperCase().includes(q) || (s.name || "").toUpperCase().includes(q)
  );
  return matches.length ? matches : null;
}

function parseLatLon(s) {
  // e.g. "28.0N" or "94.8W"
  if (!s) return null;
  const m = s.match(/^(\d+(\.\d+)?)([NSEW])$/i);
  if (!m) return null;
  let val = parseFloat(m[1]);
  const hemi = m[3].toUpperCase();
  if (hemi === "S" || hemi === "W") val = -val;
  return val;
}

function toInt(s) {
  const v = parseInt(s, 10);
  return Number.isNaN(v) ? null : v;
}

function toIntMaybe(s) {
  const v = parseInt(s, 10);
  return Number.isNaN(v) ? s : v;
}