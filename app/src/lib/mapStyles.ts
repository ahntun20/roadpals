import type { MapStyleElement } from 'react-native-maps';

/** Google Maps styles for the shop's map themes (Android). iOS uses light/dark Apple Maps. */
const night: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#1b2230' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#c9d1dc' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0f141d' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#3a465c' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#c79a2e' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#1d3b57' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#1f3a2f' }] },
];

const retro: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#efe2c4' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#5b3a1e' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#fbf3e0' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#e0915a' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#9fc0bf' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#c9d3a0' }] },
];

export function mapStyleFor(theme: string): MapStyleElement[] | undefined {
  return theme === 'night' ? night : theme === 'retro' ? retro : undefined;
}
