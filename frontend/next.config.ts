import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Necessário para a imagem Docker enxuta do perfil "fullstack".
  // A Vercel ignora esta opção.
  output: 'standalone',
}

export default nextConfig
