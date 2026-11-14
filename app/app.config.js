// Dynamic config: adds secrets from the environment on top of app.json.
// Android maps need a Google Maps API key (Maps SDK for Android) in development and
// production builds — without it the map is blank white. Expo Go has its own key.
//   PowerShell:  $env:GOOGLE_MAPS_API_KEY="AIza..."
//   EAS builds:  npx eas-cli@latest env:create --name GOOGLE_MAPS_API_KEY --value AIza... --visibility sensitive
module.exports = ({ config }) => {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  // Only warn on EAS build servers (EAS_BUILD=true); locally the key lives on EAS, not your machine.
  if (!key && process.env.EAS_BUILD) console.warn('GOOGLE_MAPS_API_KEY is not set: Android builds will show a blank map (Expo Go is fine).');
  return {
    ...config,
    plugins: [...(config.plugins ?? []), ['react-native-maps', key ? { androidGoogleMapsApiKey: key } : {}]],
  };
};
