export type VehicleType = 'car' | 'taxi' | 'bus' | 'truck' | 'container';

export const VEHICLE_ICON: Record<VehicleType, string> = {
  car: '🚗', taxi: '🚕', bus: '🚌', truck: '🚚', container: '🚛',
};

/** Every brand has exactly one paint colour, so the same brand always looks the same on the map. */
export const BRANDS: Record<VehicleType, { name: string; color: string }[]> = {
  car: [
    { name: 'Toyota', color: '#dc2626' }, { name: 'Honda', color: '#64748b' }, { name: 'Ford', color: '#1d4ed8' },
    { name: 'Tesla', color: '#d1d5db' }, { name: 'Chevrolet', color: '#ca8a04' }, { name: 'Hyundai', color: '#0891b2' },
    { name: 'BMW', color: '#111827' }, { name: 'Kia', color: '#7c3aed' }, { name: 'Nissan', color: '#ea580c' },
    { name: 'Subaru', color: '#db2777' }, { name: 'Other', color: '#94a3b8' },
  ],
  taxi: [{ name: 'City Cab', color: '#facc15' }],
  bus: [{ name: 'Metro Transit', color: '#16a34a' }],
  truck: [{ name: 'QuickShip', color: '#f97316' }, { name: 'ParcelPro', color: '#0ea5e9' }, { name: 'FreshFarm', color: '#65a30d' }, { name: 'Other', color: '#64748b' }],
  container: [{ name: 'BlueWave Lines', color: '#1e3a8a' }, { name: 'RedStar Freight', color: '#b91c1c' }, { name: 'Atlas Cargo', color: '#4338ca' }, { name: 'Other', color: '#475569' }],
};

export function brandColor(type: VehicleType, brand: string): string {
  const list = BRANDS[type] ?? BRANDS.car;
  return (list.find((b) => b.name === brand) ?? list[list.length - 1]).color;
}

export function isVehicleType(v: unknown): v is VehicleType {
  return typeof v === 'string' && v in VEHICLE_ICON;
}
