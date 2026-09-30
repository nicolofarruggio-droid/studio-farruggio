import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...classi: ClassValue[]) {
  return twMerge(clsx(classi))
}

export const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
export const numero = new Intl.NumberFormat('it-IT')

export function formattaDimensione(byte: number): string {
  if (byte < 1024) return `${byte} B`
  if (byte < 1024 * 1024) return `${(byte / 1024).toFixed(0)} KB`
  return `${(byte / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
}

export function iniziali(nome: string, cognome = ''): string {
  return ((nome[0] ?? '') + (cognome[0] ?? '')).toUpperCase() || '?'
}
