import path from 'path'
import { fileURLToPath } from 'url'
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3001
const distPath = path.resolve(__dirname, '../dist')

app.use(cors())
app.use(express.json({ limit: '5mb' }))

// API routes
import authRoutes from './routes/auth.js'
import insightRoutes from './routes/insights.js'
import reportRoutes from './routes/reports.js'
import adminRoutes from './routes/admin.js'
import profileRoutes from './routes/profile.js'
import signalRoutes from './routes/signals.js'
import aiUsageRoutes from './routes/aiUsage.js'
import aiRoutes from './routes/ai.js'

app.use('/api/auth', authRoutes)
app.use('/api/insights', insightRoutes)
app.use('/api/reports', reportRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/profile', profileRoutes)
app.use('/api/signals', signalRoutes)
app.use('/api/ai-usage', aiUsageRoutes)
app.use('/api/ai', aiRoutes)

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() })
})

// Static files + SPA fallback
app.use(express.static(distPath))

app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

app.listen(PORT, () => {
  console.log(`🚀 AI Intelligence Hub running on http://localhost:${PORT}`)
  console.log(`📂 Serving frontend from: ${distPath}`)
})