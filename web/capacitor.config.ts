import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'dev.mantaray.modulate',
  appName: 'Modulate',
  webDir: 'dist/web/browser',
  server: {
    androidScheme: 'https',
    iosScheme: 'capacitor',
    cleartext: true,
  },
  android: {
    // Self-hosted servers on a LAN often run without TLS. The app itself is
    // served over https://localhost, so allow it to call those http addresses.
    allowMixedContent: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 900,
      backgroundColor: '#0B0A0F',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0B0A0F',
    },
  },
};

export default config;
