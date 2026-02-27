export function isMacClient(): boolean {
  if (typeof navigator === "undefined") return false;
  const navWithUserAgentData = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };
  const platform =
    navWithUserAgentData.userAgentData?.platform || navigator.platform || "";
  return /mac|iphone|ipad|ipod/i.test(platform);
}
