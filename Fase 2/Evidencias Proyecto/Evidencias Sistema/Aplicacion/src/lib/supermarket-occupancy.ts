export const OCCUPANCY_FILTER_LEVELS = [
  { id: 'low', label: 'Bajo', color: '#22C55E' },
  { id: 'moderate', label: 'Medio', color: '#EAB308' },
  { id: 'busy', label: 'Alto', color: '#F97316' },
  { id: 'high', label: 'Muy alto', color: '#EF4444' },
  { id: 'full', label: 'Completo', color: '#111827' },
] as const;

export type OccupancyFilterLevel = (typeof OCCUPANCY_FILTER_LEVELS)[number]['id'];

export const ALL_OCCUPANCY_FILTER_LEVELS: OccupancyFilterLevel[] =
  OCCUPANCY_FILTER_LEVELS.map(({ id }) => id);

export function getOccupancyFilterLevel(
  percentage: number | null | undefined
): OccupancyFilterLevel | null {
  if (percentage === null || percentage === undefined || !Number.isFinite(percentage)) {
    return null;
  }
  if (percentage <= 20) {
    return 'low';
  }
  if (percentage <= 40) {
    return 'moderate';
  }
  if (percentage <= 60) {
    return 'busy';
  }
  if (percentage <= 80) {
    return 'high';
  }
  return 'full';
}

export function getSupermarketOccupancyColor(percentage: number | null | undefined) {
  const level = getOccupancyFilterLevel(percentage);
  switch (level) {
    case 'low':
      return '#22C55E';
    case 'moderate':
      return '#EAB308';
    case 'busy':
      return '#F97316';
    case 'high':
      return '#EF4444';
    case 'full':
      return '#111827';
    default:
      return '#9CA3AF';
  }
}

export function isOccupancyLevelVisible(
  percentage: number | null | undefined,
  selectedLevels: OccupancyFilterLevel[]
) {
  const level = getOccupancyFilterLevel(percentage);
  return level === null || selectedLevels.includes(level);
}
