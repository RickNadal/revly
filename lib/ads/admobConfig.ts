// Google AdMob Configuration

// AdMob App ID
export const admobAppId = 'YOUR_ADMOB_APP_ID';

// AdMob Banner Ad Unit ID
export const bannerAdUnitId = 'YOUR_BANNER_AD_UNIT_ID';

// AdMob Interstitial Ad Unit ID
export const interstitialAdUnitId = 'YOUR_INTERSTITIAL_AD_UNIT_ID';

// Initialization of Google AdMob
export const initializeAdMob = () => {
    if (admobAppId) {
        // Code to initialize AdMob with the app ID
        console.log(`AdMob initialized with App ID: ${admobAppId}`);
    } else {
        console.error('AdMob App ID is not set.');
    }
};