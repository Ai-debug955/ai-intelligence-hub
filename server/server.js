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
import learnRoutes from './routes/learnResources.js'

app.use('/api/auth', authRoutes)
app.use('/api/insights', insightRoutes)
app.use('/api/reports', reportRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/profile', profileRoutes)
app.use('/api/signals', signalRoutes)
app.use('/api/ai-usage', aiUsageRoutes)
app.use('/api/ai', aiRoutes)
app.use('/api/learn', learnRoutes)

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() })
})

// Return JSON 404 for unmatched /api routes (never serve HTML for API calls)
app.use('/api', (req, res) => {
  res.status(404).json({ error: `Cannot ${req.method} /api${req.path} — route not found` })
})

// Global error handler — always return JSON so frontend never gets HTML on errors
app.use((err, req, res, _next) => {
  console.error('Unhandled server error:', err)
  if (req.path.startsWith('/api')) {
    return res.status(err.status || 500).json({ error: err.message || 'Internal server error' })
  }
  res.status(500).send('Server error')
})

// Static files + SPA fallback
app.use(express.static(distPath))

app.get('/{*splat}', (req, res) => {
  if (req.originalUrl.startsWith('/api')) {
    return res.status(404).json({ error: `Cannot ${req.method} ${req.originalUrl} — route not found` })
  }
  res.sendFile(path.join(distPath, 'index.html'))
})

app.listen(PORT, () => {
  console.log(`🚀 AI Intelligence Hub running on http://localhost:${PORT}`)
  console.log(`📂 Serving frontend from: ${distPath}`)
  console.log(`✅ Routes: auth, insights, reports, admin, profile, signals, ai-usage, ai, learn`)
})