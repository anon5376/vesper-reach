const STATIONS = {
  campfire: ['campfire', 'cooker'],
  cooker: ['cooker', 'campfire'],
  refiner: ['refiner'],
  purifier: ['purifier'],
}

export function basesHere(state) {
  if (state.location !== 'surface' || state.planetIndex == null) return []
  return state.bases.filter((base) => base.systemIndex === state.systemIndex && base.planetIndex === state.planetIndex)
}

export function allPieces(state) {
  const pieces = []
  for (const base of basesHere(state)) {
    for (const piece of base.pieces) pieces.push({ base, piece })
  }
  return pieces
}

export function findPieceNear(state, stationOrIds, radius = 6) {
  const ids = Array.isArray(stationOrIds) ? stationOrIds : (STATIONS[stationOrIds] || [stationOrIds])
  const p = state.player.position
  let best = null
  let bestD = radius
  for (const entry of allPieces(state)) {
    if (!ids.includes(entry.piece.blockId)) continue
    const d = Math.hypot(entry.piece.x - p.x, entry.piece.z - p.z)
    if (d <= bestD) {
      bestD = d
      best = entry
    }
  }
  return best
}

export function pieceAt(base, x, y, z) {
  return base.pieces.find((piece) => piece.x === x && piece.y === y && piece.z === z) || null
}
