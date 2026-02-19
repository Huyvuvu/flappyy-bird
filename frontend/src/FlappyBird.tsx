import type React from "react"
import { useEffect, useRef, useState, useCallback } from "react"

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001"

interface LeaderboardEntry {
    player_name: string
    score: number
    created_at: string
}

interface PlayerInfo {
    id: number
    username: string
    is_online: boolean
}

// Physics constants
const GRAVITY = 0.3
const JUMP_STRENGTH = 7.5
const PIPE_WIDTH = 52
const PIPE_GAP = 150
const PIPE_SPEED = 2
const BIRD_WIDTH = 34
const BIRD_HEIGHT = 24
const TARGET_FPS = 60
const MAX_DELTA_TIME = 1
const JUMP_COOLDOWN = 200
const CANVAS_WIDTH = 288
const CANVAS_HEIGHT = 512

interface Bird { y: number; velocity: number; frame: number }
interface Pipe { x: number; topHeight: number; scored: boolean }
interface GameState {
    bird: Bird; pipes: Pipe[]; score: number
    gameOver: boolean; gameStarted: boolean; frameCount: number
}

export default function FlappyBird() {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const [assetsLoaded, setAssetsLoaded] = useState(false)
    const [loadingError, setLoadingError] = useState<string | null>(null)
    const [isGameOver, setIsGameOver] = useState(false)
    const [isGameStarted, setIsGameStarted] = useState(false)
    const [scale, setScale] = useState(1)
    const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [hasSubmitted, setHasSubmitted] = useState(false)
    const [finalScore, setFinalScore] = useState(0)

    // Auth state
    const [token, setToken] = useState<string | null>(() => localStorage.getItem("token"))
    const [player, setPlayer] = useState<PlayerInfo | null>(null)
    const [showAuth, setShowAuth] = useState(false)
    const [authMode, setAuthMode] = useState<"login" | "register">("login")
    const [authUsername, setAuthUsername] = useState("")
    const [authPassword, setAuthPassword] = useState("")
    const [authError, setAuthError] = useState("")
    const [authLoading, setAuthLoading] = useState(false)

    // Guest name for non-logged-in score submission
    const [playerName, setPlayerName] = useState("")

    const lastFrameTimeRef = useRef<number>(0)
    const audioContextRef = useRef<AudioContext | null>(null)
    const audioBuffersRef = useRef<{ point?: AudioBuffer; hit?: AudioBuffer; wing?: AudioBuffer }>({})
    const lastJumpTimeRef = useRef<number>(0)
    const pendingSoundsRef = useRef<Set<"point" | "hit" | "wing">>(new Set())

    const gameStateRef = useRef<GameState>({
        bird: { y: 200, velocity: 0, frame: 0 }, pipes: [], score: 0,
        gameOver: false, gameStarted: false, frameCount: 0,
    })

    const birdSprites = useRef<HTMLImageElement[]>([])
    const backgroundImage = useRef<HTMLImageElement | null>(null)
    const numberSprites = useRef<HTMLImageElement[]>([])
    const gameOverImage = useRef<HTMLImageElement | null>(null)
    const messageImage = useRef<HTMLImageElement | null>(null)
    const pipeImage = useRef<HTMLImageElement | null>(null)

    // ─── Auth Functions ───────────────────────────────────────────────────

    const fetchProfile = useCallback(async (t: string) => {
        try {
            const res = await fetch(`${API_BASE}/api/auth/me`, {
                headers: { Authorization: `Bearer ${t}` },
            })
            if (res.ok) {
                const data = await res.json()
                setPlayer(data)
            } else {
                localStorage.removeItem("token")
                setToken(null)
                setPlayer(null)
            }
        } catch {
            // ignore
        }
    }, [])

    useEffect(() => {
        if (token) fetchProfile(token)
    }, [token, fetchProfile])

    const handleAuth = useCallback(async () => {
        setAuthError("")
        setAuthLoading(true)
        try {
            const endpoint = authMode === "login" ? "/api/auth/login" : "/api/auth/register"
            const res = await fetch(`${API_BASE}${endpoint}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: authUsername, password: authPassword }),
            })
            const data = await res.json()
            if (!res.ok) {
                console.error("Auth failed:", data)
                setAuthError(data.error || "Something went wrong")
                return
            }
            localStorage.setItem("token", data.token)
            setToken(data.token)
            setPlayer(data.player)
            setShowAuth(false)
            setAuthUsername("")
            setAuthPassword("")
        } catch (err) {
            console.error("Auth network error:", err)
            setAuthError("Network error. Check console.")
        } finally {
            setAuthLoading(false)
        }
    }, [authMode, authUsername, authPassword])

    const handleLogout = useCallback(async () => {
        if (token) {
            try {
                await fetch(`${API_BASE}/api/auth/logout`, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` },
                })
            } catch { /* ignore */ }
        }
        localStorage.removeItem("token")
        setToken(null)
        setPlayer(null)
    }, [token])

    // ─── Scale ────────────────────────────────────────────────────────────

    useEffect(() => {
        const updateScale = () => {
            if (window.innerWidth < 768) {
                setScale(Math.max(window.innerWidth / CANVAS_WIDTH, window.innerHeight / CANVAS_HEIGHT))
            } else {
                setScale(1)
            }
        }
        updateScale()
        window.addEventListener("resize", updateScale)
        window.addEventListener("orientationchange", updateScale)
        return () => { window.removeEventListener("resize", updateScale); window.removeEventListener("orientationchange", updateScale) }
    }, [])

    // ─── Load Assets ──────────────────────────────────────────────────────

    useEffect(() => {
        const birdUrls = [
            "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/yellowbird-downflap-ZExrg9YxRxwFfLXDu6JijpJUQgByX6.png",
            "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/yellowbird-midflap-8mBrx070GYsw2As4Ue9BfQJ5XNMUg3.png",
            "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/yellowbird-upflap-hMo7jE66Ar0TzdbAMTzTMWaEGpTNx2.png",
        ]
        const numberUrls = [
            "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/0-n6uJmiEzXXFf0NDHejRxdna8JdqZ9P.png",
            "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/1-2s71zdNWUSfnqIUbOABB2QJzzbG7fR.png",
            "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/2-QNpaMYRZvP9MgObyqVbxo7wu0MyjYE.png",
            "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/3-6yXb5a7IxZyl8kdXXBatpxq48enb2d.png",
            "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/4-9beOrHBy4QSBLifUwqaLXqbNWfK4Hr.png",
            "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/5-pgAY4wiTYa2Ppho9w3YXtLx3UHryJI.png",
            "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/6-5v6snji9HWY7UpBuqDkKDtck2zED4B.png",
            "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/7-zTxqP8uIOG4OYFtl8x6Dby0mqKfNYo.png",
            "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/8-gkhiN6iBVr2DY7SqrTZIEP7Q3doyo9.png",
            "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/9-PxwOSLzHQAiMeneqctp2q5mzWAv0Kv.png",
        ]
        const loadImage = (url: string) => new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image(); img.crossOrigin = "anonymous"
            img.onload = () => resolve(img); img.onerror = () => reject(new Error(`Failed: ${url}`)); img.src = url
        })
        const loadAudioBuffer = async (url: string): Promise<AudioBuffer> => {
            const response = await fetch(url); const ab = await response.arrayBuffer()
            const Ctx = window.AudioContext || (window as any).webkitAudioContext
            const ctx = audioContextRef.current || new Ctx(); audioContextRef.current = ctx
            return await ctx.decodeAudioData(ab)
        }
        Promise.all([
            ...birdUrls.map(loadImage), ...numberUrls.map(loadImage),
            loadImage("https://hebbkx1anhila5yf.public.blob.vercel-storage.com/background-day-rvpnF7CJRMdBNqqBc8Zfzz3QpIfkBG.png"),
            loadImage("https://hebbkx1anhila5yf.public.blob.vercel-storage.com/gameover-NwA13AFRtIFat9QoA12T3lpjK76Qza.png"),
            loadImage("https://hebbkx1anhila5yf.public.blob.vercel-storage.com/message-g1ru4NKF3KrKoFmiVpzR8fwdeLhwNa.png"),
            loadImage("https://hebbkx1anhila5yf.public.blob.vercel-storage.com/pipe-green-zrz2zTtoVXaLn6xDqgrNVF9luzjW1B.png"),
            loadAudioBuffer("https://hebbkx1anhila5yf.public.blob.vercel-storage.com/point-SdTORahWMlxujnLCoDbujDLHI6KFeC.wav").then(b => { audioBuffersRef.current.point = b; return b }),
            loadAudioBuffer("https://hebbkx1anhila5yf.public.blob.vercel-storage.com/hit-YVMFYQJEgZASG6O3xPWiyiqPtOLygb.wav").then(b => { audioBuffersRef.current.hit = b; return b }),
            loadAudioBuffer("https://hebbkx1anhila5yf.public.blob.vercel-storage.com/wing-oOSsspXpVMDc0enrWj4WWLaHVqs6Hk.wav").then(b => { audioBuffersRef.current.wing = b; return b }),
        ]).then((loaded) => {
            birdSprites.current = loaded.slice(0, 3) as HTMLImageElement[]
            numberSprites.current = loaded.slice(3, 13) as HTMLImageElement[]
            backgroundImage.current = loaded[13] as HTMLImageElement
            gameOverImage.current = loaded[14] as HTMLImageElement
            messageImage.current = loaded[15] as HTMLImageElement
            pipeImage.current = loaded[16] as HTMLImageElement
            setAssetsLoaded(true)
        }).catch((error) => { console.error("Asset loading error:", error); setLoadingError(error.message) })
    }, [])

    // ─── Sound ────────────────────────────────────────────────────────────

    const playSoundImmediately = useCallback((key: "point" | "hit" | "wing") => {
        const buf = audioBuffersRef.current[key]; const ctx = audioContextRef.current
        if (buf && ctx && ctx.state === "running") {
            try { const s = ctx.createBufferSource(); s.buffer = buf; s.connect(ctx.destination); s.start(0) } catch { }
        }
    }, [])

    const queueSound = useCallback((key: "point" | "hit" | "wing") => { pendingSoundsRef.current.add(key) }, [])

    // ─── Jump ─────────────────────────────────────────────────────────────

    const jump = useCallback(() => {
        const state = gameStateRef.current; const now = Date.now()
        if (now - lastJumpTimeRef.current < JUMP_COOLDOWN) return
        lastJumpTimeRef.current = now
        if (!audioContextRef.current) { const C = window.AudioContext || (window as any).webkitAudioContext; audioContextRef.current = new C() }
        if (audioContextRef.current.state === "suspended") audioContextRef.current.resume()
        if (!state.gameOver && state.gameStarted) { state.bird.velocity = -JUMP_STRENGTH; playSoundImmediately("wing") }
        else if (!state.gameStarted) { state.gameStarted = true; setIsGameStarted(true); lastFrameTimeRef.current = 0 }
    }, [playSoundImmediately])

    // ─── Leaderboard API ─────────────────────────────────────────────────

    const fetchLeaderboard = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/api/leaderboard`)
            if (res.ok) setLeaderboard(await res.json())
        } catch (err) { console.error("Failed to fetch leaderboard:", err) }
    }, [])

    const submitScore = useCallback(async () => {
        if (isSubmitting || hasSubmitted) return
        setIsSubmitting(true)
        try {
            const headers: Record<string, string> = { "Content-Type": "application/json" }
            if (token) headers["Authorization"] = `Bearer ${token}`

            const body: Record<string, any> = { score: finalScore }
            if (!token) body.player_name = playerName.trim() || "Anonymous"

            await fetch(`${API_BASE}/api/scores`, { method: "POST", headers, body: JSON.stringify(body) })
            setHasSubmitted(true)
            await fetchLeaderboard()
        } catch (err) { console.error("Failed to submit score:", err) }
        finally { setIsSubmitting(false) }
    }, [isSubmitting, hasSubmitted, playerName, finalScore, fetchLeaderboard, token])

    const restartGame = useCallback(() => {
        gameStateRef.current = { bird: { y: 200, velocity: 0, frame: 0 }, pipes: [], score: 0, gameOver: false, gameStarted: true, frameCount: 0 }
        setIsGameOver(false); setIsGameStarted(true); setHasSubmitted(false); setLeaderboard([]); setFinalScore(0)
        lastFrameTimeRef.current = 0
    }, [])

    // ─── Keyboard ─────────────────────────────────────────────────────────

    useEffect(() => {
        const handleKeyPress = (e: KeyboardEvent) => {
            if (e.code === "Space") {
                e.preventDefault(); const state = gameStateRef.current
                if (!state.gameStarted) { state.gameStarted = true; setIsGameStarted(true); lastFrameTimeRef.current = 0 }
                else if (!state.gameOver) jump()
            }
        }
        window.addEventListener("keydown", handleKeyPress)
        return () => window.removeEventListener("keydown", handleKeyPress)
    }, [jump])

    // ─── Game Loop ────────────────────────────────────────────────────────

    useEffect(() => {
        if (!assetsLoaded) return
        const canvas = canvasRef.current
        const ctx = canvas?.getContext("2d", { alpha: false, desynchronized: true })
        if (!canvas || !ctx) return
        let animationFrameId: number

        const gameLoop = (currentTime: number) => {
            const state = gameStateRef.current
            if (pendingSoundsRef.current.size > 0) { pendingSoundsRef.current.forEach(s => playSoundImmediately(s)); pendingSoundsRef.current.clear() }
            if (lastFrameTimeRef.current === 0) lastFrameTimeRef.current = currentTime
            let dt = (currentTime - lastFrameTimeRef.current) / (1000 / TARGET_FPS)
            dt = Math.min(dt, MAX_DELTA_TIME); lastFrameTimeRef.current = currentTime
            ctx.clearRect(0, 0, canvas.width, canvas.height)
            if (backgroundImage.current) ctx.drawImage(backgroundImage.current, 0, 0, canvas.width, canvas.height)

            if (!state.gameStarted) {
                if (messageImage.current) { const mw = 184, mh = 267; ctx.drawImage(messageImage.current, (canvas.width - mw) / 2, (canvas.height - mh) / 2, mw, mh) }
                animationFrameId = requestAnimationFrame(gameLoop); return
            }

            if (!state.gameOver) {
                state.bird.velocity += GRAVITY * dt; state.bird.y += state.bird.velocity * dt
                state.frameCount++; if (state.frameCount % 5 === 0) state.bird.frame = (state.bird.frame + 1) % 3
                const rm: number[] = []
                for (let i = 0; i < state.pipes.length; i++) { state.pipes[i].x -= PIPE_SPEED * dt; if (state.pipes[i].x + PIPE_WIDTH <= 0) rm.push(i) }
                for (let i = rm.length - 1; i >= 0; i--) state.pipes.splice(rm[i], 1)
                if (state.pipes.length === 0 || state.pipes[state.pipes.length - 1].x < canvas.width - 200) {
                    state.pipes.push({ x: canvas.width, topHeight: Math.random() * (canvas.height - PIPE_GAP - 100) + 50, scored: false })
                }
                const br = { x: 50, y: state.bird.y, width: BIRD_WIDTH, height: BIRD_HEIGHT }
                for (const pipe of state.pipes) {
                    if (!pipe.scored && pipe.x + PIPE_WIDTH < 50) { pipe.scored = true; state.score++; queueSound("point") }
                    const tr = { x: pipe.x, y: 0, width: PIPE_WIDTH, height: pipe.topHeight }
                    const btr = { x: pipe.x, y: pipe.topHeight + PIPE_GAP, width: PIPE_WIDTH, height: canvas.height - pipe.topHeight - PIPE_GAP }
                    if (br.x < tr.x + tr.width && br.x + br.width > tr.x && br.y < tr.y + tr.height && br.y + br.height > tr.y) {
                        state.gameOver = true; setFinalScore(state.score); setIsGameOver(true); queueSound("hit"); break
                    }
                    if (br.x < btr.x + btr.width && br.x + br.width > btr.x && br.y < btr.y + btr.height && br.y + br.height > btr.y) {
                        state.gameOver = true; setFinalScore(state.score); setIsGameOver(true); queueSound("hit"); break
                    }
                }
                if (state.bird.y > canvas.height || state.bird.y < 0) { state.gameOver = true; setFinalScore(state.score); setIsGameOver(true); queueSound("hit") }
            }

            for (const pipe of state.pipes) {
                if (pipeImage.current) {
                    ctx.save(); ctx.scale(1, -1); ctx.drawImage(pipeImage.current, pipe.x, -pipe.topHeight, PIPE_WIDTH, 320); ctx.restore()
                    ctx.drawImage(pipeImage.current, pipe.x, pipe.topHeight + PIPE_GAP, PIPE_WIDTH, 320)
                }
            }
            ctx.save(); ctx.translate(50 + BIRD_WIDTH / 2, state.bird.y + BIRD_HEIGHT / 2)
            ctx.rotate(Math.min(Math.PI / 4, Math.max(-Math.PI / 4, state.bird.velocity * 0.1)))
            ctx.drawImage(birdSprites.current[state.bird.frame], -BIRD_WIDTH / 2, -BIRD_HEIGHT / 2, BIRD_WIDTH, BIRD_HEIGHT); ctx.restore()
            const ss = state.score.toString(); const dw = 24; const tw = ss.length * dw; const sx = (canvas.width - tw) / 2
            for (let i = 0; i < ss.length; i++) { const d = numberSprites.current[parseInt(ss[i])]; if (d) ctx.drawImage(d, sx + i * dw, 20, dw, 36) }
            animationFrameId = requestAnimationFrame(gameLoop)
        }
        animationFrameId = requestAnimationFrame(gameLoop)
        return () => cancelAnimationFrame(animationFrameId)
    }, [assetsLoaded, playSoundImmediately, queueSound])

    useEffect(() => { if (isGameOver) fetchLeaderboard() }, [isGameOver, fetchLeaderboard])

    const handleCanvasClick = useCallback((_e: React.MouseEvent<HTMLCanvasElement>) => {
        if (gameStateRef.current.gameOver) return; jump()
    }, [jump])

    const handleTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
        e.preventDefault(); e.stopPropagation(); if (gameStateRef.current.gameOver) return; jump()
    }, [jump])

    // ─── Render ───────────────────────────────────────────────────────────

    return (
        <div className="game-container">
            {/* Top-right auth bar */}
            <div className="auth-bar">
                {player ? (
                    <>
                        <span className="auth-user">👤 {player.username}</span>
                        <button className="btn-auth-small" onClick={handleLogout}>Logout</button>
                    </>
                ) : (
                    <button className="btn-auth-small" onClick={() => { setShowAuth(true); setAuthError("") }}>Login / Register</button>
                )}
            </div>

            {/* Auth Modal */}
            {showAuth && (
                <div className="modal-backdrop" onClick={() => setShowAuth(false)}>
                    <div className="modal-panel" onClick={e => e.stopPropagation()}>
                        <div className="modal-title">{authMode === "login" ? "Login" : "Register"}</div>
                        {authError && <div className="auth-error">{authError}</div>}
                        <input
                            type="text" value={authUsername} onChange={e => setAuthUsername(e.target.value)}
                            placeholder="Username" maxLength={20} className="auth-input"
                        />
                        <input
                            type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)}
                            placeholder="Password" className="auth-input"
                            onKeyDown={e => e.key === "Enter" && handleAuth()}
                        />
                        <button className="btn-auth" onClick={handleAuth} disabled={authLoading}>
                            {authLoading ? "..." : authMode === "login" ? "Login" : "Register"}
                        </button>
                        <div className="auth-switch">
                            {authMode === "login" ? (
                                <>No account? <button className="btn-link" onClick={() => { setAuthMode("register"); setAuthError("") }}>Register</button></>
                            ) : (
                                <>Have an account? <button className="btn-link" onClick={() => { setAuthMode("login"); setAuthError("") }}>Login</button></>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {!assetsLoaded && !loadingError && (
                <div className="loading">
                    <div className="loading-title">Loading Flappy Bird...</div>
                    <div className="loading-subtitle">Please wait</div>
                </div>
            )}
            {loadingError && (
                <div className="error">
                    <div className="error-title">Loading Error</div>
                    <div className="error-message">{loadingError}</div>
                    <button className="btn-retry" onClick={() => window.location.reload()}>Retry</button>
                </div>
            )}
            {assetsLoaded && (
                <div className="canvas-wrapper">
                    <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="game-canvas"
                        style={{ transform: `scale(${scale})`, transformOrigin: "center center", imageRendering: "pixelated" }}
                        onClick={handleCanvasClick} onTouchStart={handleTouchStart}
                    />
                    {!isGameStarted && <p className="hint">Tap to play or press Space to jump</p>}

                    {/* Game Over Overlay */}
                    {isGameOver && (
                        <div className="overlay" style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT, transform: `scale(${scale})`, transformOrigin: "center center" }}>
                            <div className="overlay-panel">
                                <div className="overlay-header">
                                    <div className="game-over-text">GAME OVER</div>
                                    <div className="final-score">{finalScore}</div>
                                    <div className="score-label">Score</div>
                                </div>

                                {/* Submit */}
                                {!hasSubmitted ? (
                                    <div className="submit-section">
                                        {!player && (
                                            <input type="text" value={playerName} onChange={e => setPlayerName(e.target.value)}
                                                placeholder="Your name" maxLength={20} className="name-input" />
                                        )}
                                        {player && <div className="logged-in-as">Playing as <strong>{player.username}</strong></div>}
                                        <button onClick={submitScore} disabled={isSubmitting}
                                            className={`btn-submit ${isSubmitting ? "disabled" : ""}`}>
                                            {isSubmitting ? "Saving..." : "Submit Score"}
                                        </button>
                                    </div>
                                ) : (
                                    <div className="submitted-msg">✓ Score saved!</div>
                                )}

                                {/* Leaderboard */}
                                {leaderboard.length > 0 && (
                                    <div className="leaderboard">
                                        <div className="leaderboard-title">Top 10</div>
                                        <div className="leaderboard-list">
                                            {leaderboard.map((entry, i) => (
                                                <div key={i} className={`lb-row ${i === 0 ? "gold" : i < 3 ? "top3" : ""}`}>
                                                    <span className="lb-name">{i + 1}. {entry.player_name}</span>
                                                    <span className="lb-score">{entry.score}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <button onClick={restartGame} className="btn-restart">Restart</button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
