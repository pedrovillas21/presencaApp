export const maskCpf = (cpf: string) => {
  const d = (cpf ?? '').replace(/\D/g, '')
  if (d.length !== 11) return cpf ?? ''
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

export const maskPhone = (phone: string | null | undefined) => {
  const d = (phone ?? '').replace(/\D/g, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return phone ?? ''
}

// Marcas de acentuação combinantes (U+0300–U+036F), montadas via string ASCII
// para o arquivo ficar legível em qualquer editor.
const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g')

export const slugify = (value: string) =>
  value
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'evento'
