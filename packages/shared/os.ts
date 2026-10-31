export type OS = 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'unknown'

export const osMap: Record<OS, { type: OS; label: string }> = {
  android: {
    label: 'Android',
    type: 'android',
  },
  ios: {
    label: 'iOS',
    type: 'ios',
  },
  linux: {
    label: 'Linux',
    type: 'linux',
  },
  macos: {
    label: 'macOS',
    type: 'macos',
  },
  unknown: {
    label: 'Unknown',
    type: 'unknown',
  },
  windows: {
    label: 'Windows',
    type: 'windows',
  },
}

export const getOS = (userAgent: string): { type: OS; label: string } => {
  const agent = userAgent.toLowerCase()

  // Mobile first: iPhone agents say "like Mac OS X" and Android ones say "Linux".
  if (agent.includes('android')) {
    return osMap.android
  } else if (
    agent.includes('ios') ||
    agent.includes('iphone') ||
    agent.includes('ipad')
  ) {
    return osMap.ios
  } else if (agent.includes('win')) {
    return osMap.windows
  } else if (agent.includes('mac')) {
    return osMap.macos
  } else if (agent.includes('linux')) {
    return osMap.linux
  }

  return osMap.unknown
}
