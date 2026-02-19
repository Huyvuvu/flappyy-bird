require('dotenv').config()
const express = require('express')
const cors = require('cors')
const { createClient } = require('@supabase/supabase-js')

const app = express()
const PORT = process.env.PORT || 3001

// Supabase client
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
)

// Middleware
app.use(cors())
app.use(express.json())

// POST /api/scores — submit a score
app.post('/api/scores', async (req, res) => {
    try {
        const { player_name, score } = req.body

        if (typeof score !== 'number' || score < 0) {
            return res.status(400).json({ error: 'Invalid score' })
        }

        const name =
            typeof player_name === 'string' && player_name.trim()
                ? player_name.trim().slice(0, 20)
                : 'Anonymous'

        const { data, error } = await supabase
            .from('scores')
            .insert({ player_name: name, score })
            .select()
            .single()

        if (error) {
            console.error('Supabase insert error:', error)
            return res.status(500).json({ error: 'Failed to save score' })
        }

        res.json(data)
    } catch (err) {
        console.error('Score submission error:', err)
        res.status(500).json({ error: 'Internal server error' })
    }
})

// GET /api/leaderboard — top 10 scores
app.get('/api/leaderboard', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('scores')
            .select('player_name, score, created_at')
            .order('score', { ascending: false })
            .limit(10)

        if (error) {
            console.error('Supabase fetch error:', error)
            return res.status(500).json({ error: 'Failed to fetch leaderboard' })
        }

        res.json(data)
    } catch (err) {
        console.error('Leaderboard fetch error:', err)
        res.status(500).json({ error: 'Internal server error' })
    }
})

app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`)
})
