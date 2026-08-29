#!/usr/bin/env node
/**
 * Build the geographic imada layer used by the map.
 *
 * Source: HDX COD-AB Tunisia, administrative level 4, derived from
 * OpenStreetMap (ODbL). The public BlackoutTN repository hosts the source
 * snapshot used here and documents the same provenance.
 *
 * Compared with BlackoutTN's ~80 m simplification, this build keeps vertices
 * to roughly 15 m and rounds coordinates to 5 decimals (~1.1 m).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(scriptDirectory, "..", "data", "tn-imadas.geojson");
const sourceUrl = process.env.TPW_IMADAS_SOURCE_URL
  || "https://raw.githubusercontent.com/saifgo/BlackoutTn/master/scripts/raw-sectors.geojson";
const tolerance = 0.00015;
const decimals = 5;

function roundCoordinate(value) {
  const factor = 10 ** decimals;
  return Math.round(Number(value) * factor) / factor;
}

function perpendicularDistance(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  if (dx === 0 && dy === 0) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  const ratio = Math.max(0, Math.min(1,
    ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy),
  ));
  return Math.hypot(point[0] - (start[0] + ratio * dx), point[1] - (start[1] + ratio * dy));
}

function simplifyOpenLine(points) {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop();
    let farthestIndex = -1;
    let farthestDistance = tolerance;
    for (let index = start + 1; index < end; index += 1) {
      const distance = perpendicularDistance(points[index], points[start], points[end]);
      if (distance > farthestDistance) {
        farthestIndex = index;
        farthestDistance = distance;
      }
    }
    if (farthestIndex !== -1) {
      keep[farthestIndex] = 1;
      stack.push([start, farthestIndex], [farthestIndex, end]);
    }
  }
  return points.filter((_, index) => keep[index]);
}

function simplifyRing(rawRing) {
  const ring = rawRing.length > 1
    && rawRing[0][0] === rawRing[rawRing.length - 1][0]
    && rawRing[0][1] === rawRing[rawRing.length - 1][1]
    ? rawRing.slice(0, -1)
    : rawRing.slice();
  if (ring.length < 4) return rawRing.map(([lng, lat]) => [roundCoordinate(lng), roundCoordinate(lat)]);

  let splitIndex = 1;
  let splitDistance = -1;
  for (let index = 1; index < ring.length; index += 1) {
    const distance = Math.hypot(ring[index][0] - ring[0][0], ring[index][1] - ring[0][1]);
    if (distance > splitDistance) {
      splitIndex = index;
      splitDistance = distance;
    }
  }
  const firstArc = simplifyOpenLine(ring.slice(0, splitIndex + 1));
  const secondArc = simplifyOpenLine([...ring.slice(splitIndex), ring[0]]);
  const simplified = [...firstArc.slice(0, -1), ...secondArc.slice(0, -1)];
  const usable = simplified.length >= 3 ? simplified : ring;
  const rounded = usable.map(([lng, lat]) => [roundCoordinate(lng), roundCoordinate(lat)]);
  rounded.push([...rounded[0]]);
  return rounded;
}

function simplifyGeometry(geometry) {
  if (geometry.type === "Polygon") {
    return { type: "Polygon", coordinates: geometry.coordinates.map(simplifyRing) };
  }
  if (geometry.type === "MultiPolygon") {
    return {
      type: "MultiPolygon",
      coordinates: geometry.coordinates.map((polygon) => polygon.map(simplifyRing)),
    };
  }
  throw new Error(`Unsupported geometry: ${geometry.type}`);
}

const response = await fetch(sourceUrl);
if (!response.ok) throw new Error(`Unable to download imadas: HTTP ${response.status}`);
const raw = await response.json();
if (raw.type !== "FeatureCollection") throw new Error("Expected a GeoJSON FeatureCollection");

const features = raw.features.map((feature, index) => {
  const properties = feature.properties || {};
  return {
    type: "Feature",
    properties: {
      id: String(properties.adm4_pcode || `TN-IMADA-${index + 1}`),
      name: String(properties.adm4_name || properties.adm4_ref_name || "Zone sans nom"),
      nameAr: String(properties.adm4_name1 || ""),
      delegation: String(properties.adm3_name || ""),
      delegationAr: String(properties.adm3_name1 || ""),
      governorate: String(properties.adm2_name || ""),
      governorateAr: String(properties.adm2_name1 || ""),
      lat: roundCoordinate(properties.center_lat),
      lng: roundCoordinate(properties.center_lon),
    },
    geometry: simplifyGeometry(feature.geometry),
  };
});

const output = {
  type: "FeatureCollection",
  metadata: {
    source: "HDX COD-AB Tunisia adm4 / OpenStreetMap",
    license: "ODbL",
    officialArchiveUpdated: "2026-01-26",
    boundariesValidOn: String(raw.features[0]?.properties?.valid_on || ""),
    precisionMeters: 15,
    featureCount: features.length,
  },
  features,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(output));
console.log(`Imadas: ${features.length}`);
console.log(`Output: ${outputPath}`);
