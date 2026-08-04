import { env } from '../config/env.js'

/** Public frontend base used in invite emails / copy-paste links. */
export function appPublicBaseUrl(): string {
  if (env.APP_PUBLIC_URL?.trim()) {
    return env.APP_PUBLIC_URL.replace(/\/$/, '')
  }
  if (env.NODE_ENV === 'production') {
    return 'https://midpointblue.co.za/real'
  }
  return 'http://localhost:5173/real'
}

export function inviteLink(token: string): string {
  return `${appPublicBaseUrl()}/#/invite/${token}`
}
