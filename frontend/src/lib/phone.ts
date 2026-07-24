export const unmaskPhone = (value: string) => value.replace(/\D/g, '')

/** (00) 00000-0000 — aceita fixo (10) e celular (11). */
export const maskPhone = (value: string) => {
  const d = unmaskPhone(value).slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

export const isValidPhone = (value: string) => /^\d{10,11}$/.test(unmaskPhone(value))
