import { MAP_LABEL_LAYERS, mapLabelText } from './map-labels'

/** Where each road class's own label starts in the CARTO style. */
const STYLE_ROAD_LABEL_START: Record<string, number> = {
  'beeb-label-road-highway': 13,
  'beeb-label-road-primary': 14,
  'beeb-label-road-secondary': 15,
}

describe('MAP_LABEL_LAYERS', () => {
  it('hands each road over to the style exactly where its label starts, so no road is named twice', () => {
    for (const [id, start] of Object.entries(STYLE_ROAD_LABEL_START)) {
      expect(MAP_LABEL_LAYERS.find((l) => l.id === id)?.maxzoom).toBe(start)
    }
  })

  it('does not ask for a road name below the zoom the tiles start carrying it', () => {
    const minzoom = (id: string) => MAP_LABEL_LAYERS.find((l) => l.id === id)?.minzoom
    expect(minzoom('beeb-label-road-highway')).toBeGreaterThanOrEqual(11)
    expect(minzoom('beeb-label-road-primary')).toBeGreaterThanOrEqual(12)
    expect(minzoom('beeb-label-road-secondary')).toBeGreaterThanOrEqual(12)
  })

  it('names Baghdad quarters, which the style has no layer for', () => {
    const quarter = MAP_LABEL_LAYERS.find((l) => l.id === 'beeb-label-quarter')
    expect(JSON.stringify(quarter?.filter)).toContain('macrohood')
  })

  it('uses unique ids and a valid zoom range on every layer', () => {
    expect(new Set(MAP_LABEL_LAYERS.map((l) => l.id)).size).toBe(MAP_LABEL_LAYERS.length)
    for (const layer of MAP_LABEL_LAYERS) expect(layer.minzoom).toBeLessThan(layer.maxzoom)
  })
})

describe('mapLabelText', () => {
  it('reads the name for the language and falls back to the local name', () => {
    expect(mapLabelText('ar')).toEqual(['coalesce', ['get', 'name:ar'], ['get', 'name']])
    expect(mapLabelText('en')).toEqual(['coalesce', ['get', 'name:en'], ['get', 'name']])
  })
})
