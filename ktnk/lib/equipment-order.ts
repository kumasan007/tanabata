export function orderByFloor<T extends { floor_id: string }>(rows: T[], floors: { id: string }[]): T[] {
  const ranks = new Map(floors.map((floor, index) => [floor.id, index]));
  return [...rows].sort((a, b) => (ranks.get(a.floor_id) ?? Infinity) - (ranks.get(b.floor_id) ?? Infinity));
}

export function reorderDestination<T extends { id: string; floor_id: string }>(rows: T[], ids: string[], movedId: string, targetId?: string) {
  const moved = rows.find(row => row.id === movedId);
  const target = targetId ? rows.find(row => row.id === targetId) : rows[ids.indexOf(movedId)];
  return moved && target && moved.floor_id !== target.floor_id ? target.floor_id : null;
}

export function normalizeEquipmentOrder<T extends { id: string; floor_id: string }>(
  rows: T[], ids: string[], movedId: string, destinationFloorId: string | null, floors: { id: string }[],
) {
  if (!destinationFloorId) return ids;
  const byId = new Map(rows.map(row => [row.id, row]));
  const reordered = ids.flatMap(id => {
    const row = byId.get(id);
    return row ? [{ ...row, floor_id: id === movedId ? destinationFloorId : row.floor_id }] : [];
  });
  return orderByFloor(reordered, floors).map(row => row.id);
}
