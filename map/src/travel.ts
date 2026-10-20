import type { Stamina, WorldPoint } from './types'

/** Measured on foot, standing, no injuries (m/s). */
const JOG_SPEED = 4.1
const SPRINT_SPEED = 6.6

// DayZ's StaminaHandler and GameConstants
const SPRINT_DRAIN = 4
const JOG_GAIN = 2
const GAIN_BONUS = 3
const EXHAUSTION_COOLDOWN = 0.45
const STAMINA_MIN_CAP = 5
const SPRINT_RESUME = STAMINA_MIN_CAP + 15


export const VANILLA_STAMINA: Stamina = { max: 100, sprintDrain: 1 }

/**
 * Seconds to cover `meters` holding sprint without load: sprint from a full bar until it is empty, then jog
 * until the game lets you sprint again (above 20), sprint that away, and so on.
 */
export function sprintSeconds(meters: number, stamina: Stamina = VANILLA_STAMINA): number {
  const drain = SPRINT_DRAIN * stamina.sprintDrain
  if (drain <= 0) return meters / SPRINT_SPEED
  const opening = (stamina.max / drain) * SPRINT_SPEED
  if (meters <= opening) return meters / SPRINT_SPEED

  // Below 25 stamina the game adds its full regain bonus, so jogging back up to 20 regains at a flat rate
  const resume = Math.min(SPRINT_RESUME, stamina.max)
  const jogTime = EXHAUSTION_COOLDOWN + resume / (JOG_GAIN + GAIN_BONUS)
  const sprintTime = resume / drain
  const cycle = jogTime * JOG_SPEED + sprintTime * SPRINT_SPEED

  let rest = meters - opening
  const cycles = Math.floor(rest / cycle)
  rest -= cycles * cycle
  let seconds = stamina.max / drain + cycles * (jogTime + sprintTime)
  const jogged = Math.min(rest, jogTime * JOG_SPEED)
  seconds += jogged / JOG_SPEED + (rest - jogged) / SPRINT_SPEED
  return seconds
}

export function pathLength(points: readonly WorldPoint[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1])
  return total
}

export function formatDistance(meters: number, locale: string): string {
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km`
}

export function formatDuration(seconds: number): string {
  const total = Math.round(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h} h ${m} min`
  if (m > 0) return `${m} min ${s} s`
  return `${s} s`
}
