/**
 * Porta em TS da mesma lógica de dígitos verificadores da função
 * public.is_valid_cpf do Postgres. Aqui é só feedback imediato no formulário —
 * a CHECK constraint do banco é a rede de segurança de verdade.
 */
export const unmaskCpf = (value: string) => value.replace(/\D/g, '')

export const maskCpf = (value: string) => {
  const d = unmaskCpf(value).slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

export const isValidCpf = (value: string) => {
  const d = unmaskCpf(value)
  if (d.length !== 11) return false
  if (/^(\d)\1{10}$/.test(d)) return false

  let s = 0
  for (let i = 0; i < 9; i++) s += Number(d[i]) * (10 - i)
  let v1 = 11 - (s % 11)
  if (v1 >= 10) v1 = 0

  s = 0
  for (let i = 0; i < 10; i++) s += Number(d[i]) * (11 - i)
  let v2 = 11 - (s % 11)
  if (v2 >= 10) v2 = 0

  return v1 === Number(d[9]) && v2 === Number(d[10])
}
