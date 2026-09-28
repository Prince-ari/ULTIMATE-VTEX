export function isDemoPreview(hostname: string, nodeEnv: string | undefined, explicitlyEnabled: boolean) {
  if (nodeEnv === "production" || !explicitlyEnabled) return false

  return hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".manus.computer")
}
