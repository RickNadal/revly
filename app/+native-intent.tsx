export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    const rawPath = path || "";
    const decodedPath = decodeURIComponent(rawPath);

    if (
      decodedPath.includes("type=recovery") ||
      decodedPath.includes("access_token=") ||
      decodedPath.includes("refresh_token=") ||
      decodedPath.includes("token_hash=") ||
      decodedPath.includes("reset-password")
    ) {
      return "/reset-password";
    }

    if (decodedPath.includes("payment-success")) {
      return "/payment-success";
    }

    if (decodedPath.includes("payment-cancel")) {
      return "/payment-cancel";
    }

    return rawPath;
  } catch {
    return "/sign-in";
  }
}