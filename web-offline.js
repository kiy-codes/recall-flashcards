// Only the static website needs an app-shell cache. Electron already has the files.
if ('serviceWorker' in navigator && ['https:', 'http:'].includes(location.protocol)) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js', { updateViaCache: 'none' }).catch(() => {
      // A failed cache install never prevents studying or local persistence.
    });
  });
}
