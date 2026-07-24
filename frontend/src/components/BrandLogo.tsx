import Image from 'next/image'

export default function BrandLogo({
  className = '',
  priority = false,
}: {
  className?: string
  priority?: boolean
}) {
  return (
    <Image
      src="/crefito-11-logo.png"
      alt="CREFITO 11"
      width={709}
      height={255}
      priority={priority}
      className={`h-auto w-full object-contain ${className}`}
    />
  )
}
