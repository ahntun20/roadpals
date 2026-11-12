/**
 * GPS while driving. In a development/production build this runs as a background task, so
 * kilometres and passes keep counting with the phone locked. In Expo Go (no background
 * location) it falls back to foreground tracking while the app is open.
 */
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import type { Fix } from '@roadpals/shared';
import { api } from './api';

export const DRIVE_TASK = 'roadpals-drive';

type Listener = (fix: Fix) => void;
const listeners = new Set<Listener>();
export function onFix(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

let queue: Fix[] = [];
let flushing = false;

function toFix(l: Location.LocationObject): Fix {
  return {
    lat: l.coords.latitude,
    lng: l.coords.longitude,
    ts: Math.round(l.timestamp),
    speed: l.coords.speed != null && l.coords.speed >= 0 ? l.coords.speed : null,
    heading: l.coords.heading != null && l.coords.heading >= 0 ? l.coords.heading : null,
    accuracy: l.coords.accuracy ?? null,
    mocked: l.mocked ?? false,
  };
}

/** Upload buffered fixes. Kept on failure (e.g. no signal) and retried on the next update. */
async function flush(): Promise<void> {
  if (flushing || !queue.length) return;
  flushing = true;
  const batch = queue.slice(0, 300);
  try {
    await api.sendFixes(batch);
    queue = queue.slice(batch.length);
  } catch {
    if (queue.length > 2000) queue = queue.slice(-2000); // don't grow forever offline
  } finally {
    flushing = false;
  }
}

function handle(locations: Location.LocationObject[]) {
  for (const l of locations) {
    const f = toFix(l);
    queue.push(f);
    listeners.forEach((fn) => fn(f));
  }
  void flush();
}

// Must be defined at module scope (imported from the root layout).
TaskManager.defineTask<{ locations: Location.LocationObject[] }>(DRIVE_TASK, async ({ data, error }) => {
  if (error || !data?.locations) return;
  handle(data.locations);
});

let foregroundSub: Location.LocationSubscription | null = null;

export type DriveMode = 'background' | 'foreground';

export async function startDriving(): Promise<DriveMode> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') throw new Error('Location permission is needed to drive with RoadPals.');
  try {
    const bg = await Location.requestBackgroundPermissionsAsync();
    if (bg.status !== 'granted') throw new Error('no background permission');
    if (!(await Location.hasStartedLocationUpdatesAsync(DRIVE_TASK))) {
      await Location.startLocationUpdatesAsync(DRIVE_TASK, {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 3000,
        distanceInterval: 10,
        activityType: Location.ActivityType.AutomotiveNavigation,
        pausesUpdatesAutomatically: true,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: 'RoadPals is tracking your drive',
          notificationBody: 'Counting kilometres and drivers you pass.',
          notificationColor: '#33ccff',
        },
      });
    }
    return 'background';
  } catch {
    // Expo Go, or the user only allowed "While using the app".
    if (!foregroundSub) {
      foregroundSub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 3000, distanceInterval: 10 },
        (l) => handle([l]),
      );
    }
    return 'foreground';
  }
}

export async function stopDriving(): Promise<void> {
  foregroundSub?.remove();
  foregroundSub = null;
  if (await Location.hasStartedLocationUpdatesAsync(DRIVE_TASK).catch(() => false)) {
    await Location.stopLocationUpdatesAsync(DRIVE_TASK);
  }
  await flush();
  await api.stop().catch(() => {});
}

export async function isDriving(): Promise<boolean> {
  if (foregroundSub) return true;
  return Location.hasStartedLocationUpdatesAsync(DRIVE_TASK).catch(() => false);
}
