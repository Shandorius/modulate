# Modulate web client

Angular 22 standalone app, mobile-first, custom CSS. It runs in the browser and
is wrapped by Capacitor for Android and iOS.

```bash
npm install
npm start       # dev server at http://localhost:4200, proxies API to :3000
npm test
npm run build
```

## Native

```bash
npm run build
npx cap sync android
npx cap sync ios
```

Android debug build:

```bash
cd android
JAVA_HOME=/usr/lib/jvm/java-21-openjdk ./gradlew assembleDebug
```

The native app asks for the self-hosted instance URL on first launch. The URL
and bearer token are stored in Keychain/Keystore-backed secure storage.

The web client uses same-origin session cookies. Native builds use bearer tokens
and call the same API origin.
