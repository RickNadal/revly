const appJson = require("./app.json");

module.exports = ({ config }) => {
  const base = appJson.expo ?? config ?? {};
  const buildProfile = (process.env.EAS_BUILD_PROFILE || "").toLowerCase();
  const appVariant = (process.env.APP_VARIANT || "").toLowerCase();

  const profileForVariant = buildProfile || appVariant;
  const isDevLike =
    profileForVariant === "development" ||
    profileForVariant === "dev" ||
    profileForVariant === "devclient";

  const baseAndroidPackage = base.android?.package;
  const baseIosBundleId = base.ios?.bundleIdentifier;
  const projectId = base.extra?.eas?.projectId;

  const androidPackage = isDevLike && baseAndroidPackage
    ? (baseAndroidPackage.endsWith(".dev") ? baseAndroidPackage : `${baseAndroidPackage}.dev`)
    : baseAndroidPackage;

  const iosBundleIdentifier = isDevLike && baseIosBundleId
    ? (baseIosBundleId.endsWith(".dev") ? baseIosBundleId : `${baseIosBundleId}.dev`)
    : baseIosBundleId;

  return {
    ...base,
    name: isDevLike ? "Oranga Dev" : base.name,
    android: {
      ...(base.android ?? {}),
      package: androidPackage,
    },
    ios: {
      ...(base.ios ?? {}),
      bundleIdentifier: iosBundleIdentifier,
    },
    runtimeVersion: {
      policy: "appVersion",
    },
    updates: {
      ...(base.updates ?? {}),
      ...(projectId ? { url: `https://u.expo.dev/${projectId}` } : {}),
      checkAutomatically: "ON_LOAD",
      fallbackToCacheTimeout: 0,
    },
  };
};
