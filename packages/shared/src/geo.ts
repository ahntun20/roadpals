export interface LatLng { lat: number; lng: number }

const R = 6371000;
const toRad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in metres. */
export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Initial bearing in degrees (0 = north, clockwise). */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Move a point by a distance (m) along a bearing (deg). */
export function offset(p: LatLng, meters: number, bearing: number): LatLng {
  const d = meters / R, br = toRad(bearing), lat1 = toRad(p.lat), lng1 = toRad(p.lng);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(br));
  const lng2 = lng1 + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: (lat2 * 180) / Math.PI, lng: (((lng2 * 180) / Math.PI + 540) % 360) - 180 };
}

const B32 = '0123456789bcdefghjkmnpqrstuvwxyz';
/** Standard geohash. Precision 7 ≈ 153 m × 153 m cells (used for "new area explored"). */
export function geohash(p: LatLng, precision = 7): string {
  let latR = [-90, 90], lngR = [-180, 180], hash = '', bit = 0, ch = 0, even = true;
  while (hash.length < precision) {
    const r = even ? lngR : latR, v = even ? p.lng : p.lat, mid = (r[0] + r[1]) / 2;
    if (v >= mid) { ch = (ch << 1) | 1; r[0] = mid; } else { ch = ch << 1; r[1] = mid; }
    even = !even;
    if (++bit === 5) { hash += B32[ch]; bit = 0; ch = 0; }
  }
  return hash;
}

export function isValidLatLng(p: Partial<LatLng>): p is LatLng {
  return typeof p.lat === 'number' && typeof p.lng === 'number' && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180 && Number.isFinite(p.lat) && Number.isFinite(p.lng);
}

/**
 * Shortest distance (m) from point p to the segment a→b. Used for pass detection so two
 * fast cars that cross between GPS updates still count as passing each other.
 */
export function distanceToSegmentM(p: LatLng, a: LatLng, b: LatLng): number {
  const k = Math.cos(toRad((a.lat + b.lat) / 2));
  const ax = a.lng * k, ay = a.lat, bx = b.lng * k, by = b.lat, px = p.lng * k, py = p.lat;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return distanceM(p, { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t });
}
