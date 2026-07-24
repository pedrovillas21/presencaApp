/**
 * Ícone Material Symbols. A folha de estilo da fonte vem do layout raiz;
 * aqui só padronizamos o markup para não repetir a classe em cada uso.
 */
export default function Icon({
  name,
  className = '',
  filled = false,
}: {
  name: string
  className?: string
  filled?: boolean
}) {
  return (
    <span aria-hidden className={`material-symbols-outlined ${filled ? 'fill' : ''} ${className}`}>
      {name}
    </span>
  )
}
