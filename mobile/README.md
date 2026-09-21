# Recall Flashcards for Android

This is a separate, native Expo/React Native mobile project. It does not change the Electron app or share its local data.

## Run it

1. In this `mobile` folder, run `npm install`.
2. For an Android emulator, start one in Android Studio, then run `npm run android`.
3. For a physical Android phone, install **Expo Go**, run `npm start`, and scan the QR code on the same Wi-Fi network. If the network blocks discovery, run `npx expo start --tunnel`.

## Tests

Run `npm test` to exercise learning transitions, typed-answer matching, filters, duplicate detection, CSV/TSV/paste parsing, sharing/import, migration, session stats, and streaks.

## Android packages

- Test APK: install the EAS CLI, sign in to an Expo account, then run `npx eas build --platform android --profile preview`. The `preview` profile in `eas.json` produces an installable APK.
- Play Store AAB: run `npx eas build --platform android --profile production`. The `production` profile produces an Android App Bundle.

Before the first cloud build, replace the placeholder `extra.eas.projectId` in `app.json` with the ID created by `npx eas init`.

## Local data and sharing

The app persists its library in AsyncStorage, so it works without internet. Share files contain selected decks, folders, side labels, cards, tags, hints, notes, flags, and card progress—never session history. The data layer is isolated in `src/core.js`, making a later cloud-sync adapter straightforward.
