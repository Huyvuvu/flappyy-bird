require('dotenv').config()
const express = require('express')
const cors = require('cors')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { createClient } = require('@supabase/supabase-js')
const swaggerUi = require('swagger-ui-express')
const swaggerJsdoc = require('swagger-jsdoc')

const app = express()
const PORT = process.env.PORT || 3001
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret'

// Supabase client
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
)

// Middleware
app.use(cors())
app.use(express.json())

// ─── Swagger Setup ───────────────────────────────────────────────────────────

const swaggerSpec = swaggerJsdoc({
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Flappy Bird API',
            version: '1.0.0',
            description: 'Backend API for Flappy Bird — scores, leaderboard, and player authentication',
        },
        servers: [{ url: `http://localhost:${PORT}` }],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                },
            },
            schemas: {
                Player: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer' },
                        username: { type: 'string' },
                        is_online: { type: 'boolean' },
                        last_login: { type: 'string', format: 'date-time', nullable: true },
                        last_logout: { type: 'string', format: 'date-time', nullable: true },
                        created_at: { type: 'string', format: 'date-time' },
                    },
                },
                Score: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer' },
                        player_name: { type: 'string' },
                        score: { type: 'integer' },
                        user_id: { type: 'integer', nullable: true },
                        created_at: { type: 'string', format: 'date-time' },
                    },
                },
                LeaderboardEntry: {
                    type: 'object',
                    properties: {
                        player_name: { type: 'string' },
                        score: { type: 'integer' },
                        created_at: { type: 'string', format: 'date-time' },
                    },
                },
            },
        },
    },
    apis: [__filename],
})

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Flappy Bird API Docs',
}))

// ─── Auth Middleware ─────────────────────────────────────────────────────────

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(' ')[1]
    if (!token) return res.status(401).json({ error: 'Token required' })

    jwt.verify(token, JWT_SECRET, (err, payload) => {
        if (err) return res.status(403).json({ error: 'Invalid or expired token' })
        req.user = payload
        next()
    })
}

function optionalAuth(req, res, next) {
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(' ')[1]
    if (token) {
        jwt.verify(token, JWT_SECRET, (err, payload) => {
            if (!err) req.user = payload
        })
    }
    next()
}

// ─── Auth Routes ─────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new player
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 20
 *               password:
 *                 type: string
 *                 minLength: 4
 *     responses:
 *       201:
 *         description: Player registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 player: { $ref: '#/components/schemas/Player' }
 *                 token: { type: string }
 *       400:
 *         description: Validation error
 *       409:
 *         description: Username already taken
 */
app.post('/api/auth/register', async (req, res) => {
    try {
        console.log('Register request body:', req.body)
        const { username, password } = req.body

        if (!username || typeof username !== 'string' || username.trim().length < 2 || username.trim().length > 20) {
            return res.status(400).json({ error: 'Username must be 2-20 characters' })
        }
        if (!password || typeof password !== 'string' || password.length < 4) {
            return res.status(400).json({ error: 'Password must be at least 4 characters' })
        }

        const cleanUsername = username.trim()
        const passwordHash = await bcrypt.hash(password, 10)

        const { data, error } = await supabase
            .from('players')
            .insert({ username: cleanUsername, password_hash: passwordHash })
            .select('id, username, is_online, last_login, last_logout, created_at')
            .single()

        if (error) {
            if (error.code === '23505') {
                return res.status(409).json({ error: 'Username already taken' })
            }
            console.error('Register error:', error)
            return res.status(500).json({ error: 'Failed to register' })
        }

        const token = jwt.sign({ id: data.id, username: data.username }, JWT_SECRET, { expiresIn: '7d' })

        res.status(201).json({ message: 'Registered successfully', player: data, token })
    } catch (err) {
        console.error('Register error:', err)
        res.status(500).json({ error: 'Internal server error' })
    }
})

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login a player
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username: { type: string }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 player: { $ref: '#/components/schemas/Player' }
 *                 token: { type: string }
 *       401:
 *         description: Invalid credentials
 */
app.post('/api/auth/login', async (req, res) => {
    try {
        console.log('Login request body:', req.body)
        const { username, password } = req.body

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' })
        }

        const { data: player, error } = await supabase
            .from('players')
            .select('*')
            .eq('username', username.trim())
            .single()

        if (error || !player) {
            return res.status(401).json({ error: 'Invalid username or password' })
        }

        const validPassword = await bcrypt.compare(password, player.password_hash)
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid username or password' })
        }

        // Update online status
        await supabase
            .from('players')
            .update({ is_online: true, last_login: new Date().toISOString() })
            .eq('id', player.id)

        const token = jwt.sign({ id: player.id, username: player.username }, JWT_SECRET, { expiresIn: '7d' })

        const { password_hash, ...safePlayer } = player
        safePlayer.is_online = true
        safePlayer.last_login = new Date().toISOString()

        res.json({ message: 'Login successful', player: safePlayer, token })
    } catch (err) {
        console.error('Login error:', err)
        res.status(500).json({ error: 'Internal server error' })
    }
})

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Logout a player
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out
 *       401:
 *         description: Token required
 */
app.post('/api/auth/logout', authenticateToken, async (req, res) => {
    try {
        console.log('Logout request for user:', req.user.username)
        await supabase
            .from('players')
            .update({ is_online: false, last_logout: new Date().toISOString() })
            .eq('id', req.user.id)

        res.json({ message: 'Logged out successfully' })
    } catch (err) {
        console.error('Logout error:', err)
        res.status(500).json({ error: 'Internal server error' })
    }
})

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get current player profile
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Player profile
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Player'
 *       401:
 *         description: Token required
 */
app.get('/api/auth/me', authenticateToken, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('players')
            .select('id, username, is_online, last_login, last_logout, created_at')
            .eq('id', req.user.id)
            .single()

        if (error || !data) {
            return res.status(404).json({ error: 'Player not found' })
        }

        res.json(data)
    } catch (err) {
        console.error('Profile error:', err)
        res.status(500).json({ error: 'Internal server error' })
    }
})

// ─── Score Routes ────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/scores:
 *   post:
 *     tags: [Scores]
 *     summary: Submit a score
 *     description: Submit a game score. If authenticated, the score is linked to the player.
 *     security:
 *       - bearerAuth: []
 *       - {}
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [score]
 *             properties:
 *               player_name:
 *                 type: string
 *                 description: Display name (used if not authenticated)
 *               score:
 *                 type: integer
 *                 minimum: 0
 *     responses:
 *       200:
 *         description: Score saved
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Score'
 *       400:
 *         description: Invalid score
 */
app.post('/api/scores', optionalAuth, async (req, res) => {
    try {
        const { player_name, score } = req.body

        if (typeof score !== 'number' || score < 0) {
            return res.status(400).json({ error: 'Invalid score' })
        }

        const insertData = { score }

        // If authenticated, use the player's username and link user_id
        if (req.user) {
            insertData.player_name = req.user.username
            insertData.user_id = req.user.id
        } else {
            insertData.player_name =
                typeof player_name === 'string' && player_name.trim()
                    ? player_name.trim().slice(0, 20)
                    : 'Anonymous'
        }

        const { data, error } = await supabase
            .from('scores')
            .insert(insertData)
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

/**
 * @swagger
 * /api/leaderboard:
 *   get:
 *     tags: [Scores]
 *     summary: Get top 10 scores
 *     responses:
 *       200:
 *         description: Leaderboard
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/LeaderboardEntry'
 */
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

// ─── Start Server ────────────────────────────────────────────────────────────

app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`)
    console.log(`Swagger docs at http://localhost:${PORT}/api-docs`)
})
