/** A short name for a new passkey, from the device that made it. The owner sees it in settings. */
export function passkeyName({ userAgent }: { userAgent: string }): string {
  if (/iPhone/.test(userAgent)) {
    return "iPhone";
  }
  if (/iPad/.test(userAgent)) {
    return "iPad";
  }
  if (/Android/.test(userAgent)) {
    return "Android device";
  }
  if (/Macintosh|Mac OS X/.test(userAgent)) {
    return "Mac";
  }
  if (/Windows/.test(userAgent)) {
    return "Windows computer";
  }
  if (/CrOS/.test(userAgent)) {
    return "Chromebook";
  }
  if (/Linux/.test(userAgent)) {
    return "Linux computer";
  }
  return "Passkey";
}
