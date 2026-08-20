import express from 'express'
import cors from 'cors'
import { env } from './env'
import reportsRouter from './routes/reports'

const app = express()

app.disable('x-powered-by')

app.use(
  cors({
    origin(origin, callback) {
      // curl / healthcheck não mandam Origin
      if (!origin || env.allowedOrigins.includes(origin)) return callback(null, true)
      callback(new Error(`Origem não permitida: ${origin}`))
    },
    methods: ['GET', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    // sem isso o frontend não enxerga o nome do arquivo em cross-origin
    exposedHeaders: ['Content-Disposition'],
  })
)

app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.use('/api', reportsRouter)

app.use((_req, res) => {
  res.status(404).json({ error: 'Rota não encontrada.' })
})

app.listen(env.PORT, () => {
  console.log(`presencaApp backend ouvindo na porta ${env.PORT}`)
  console.log(`Origens permitidas: ${env.allowedOrigins.join(', ')}`)
})
