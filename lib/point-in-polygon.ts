import type { LatLng } from '@/hooks/use-current-location'

// Ray-casting algorithm. Polygon is an ordered list of vertices (implicitly
// closed — the closing vertex need not be repeated).
export function isPointInPolygon(point: LatLng, polygon: LatLng[]): boolean {
  if (polygon.length < 3) return false
  const { latitude: lat, longitude: lng } = point
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const lat_i = polygon[i].latitude
    const lng_i = polygon[i].longitude
    const lat_j = polygon[j].latitude
    const lng_j = polygon[j].longitude
    const intersect =
      lng_i > lng !== lng_j > lng &&
      lat < ((lat_j - lat_i) * (lng - lng_i)) / (lng_j - lng_i) + lat_i
    if (intersect) inside = !inside
  }
  return inside
}
