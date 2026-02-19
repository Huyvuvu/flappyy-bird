import type React from "react"
import { useEffect, useRef, useState, useCallback } from "react"

const API_BASE = "http://localhost:3001"

interface LeaderboardEntry {
    player_name: string
    score: number
    created_at: string
}

// Recalibrated constants for time-based physics
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

// Fixed canvas dimensions
const CANVAS_WIDTH = 288
const CANVAS_HEIGHT = 512

interface Bird {
    y: number
    velocity: number
    frame: number
}

interface Pipe {
    x: number
    topHeight: number
    scored: boolean
}

interface GameState {
    bird: Bird
    pipes: Pipe[]
    score: number
    gameOver: boolean
    gameStarted: boolean
    frameCount: number
}

export default function FlappyBird() {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const [assetsLoaded, setAssetsLoaded] = useState(false)
    const [loadingError, setLoadingError] = useState<string | null>(null)
    const [isGameOver, setIsGameOver] = useState(false)
    const [isGameStarted, setIsGameStarted] = useState(false)
    const [scale, setScale] = useState(1)
    const [playerName, setPlayerName] = useState("")
    const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [hasSubmitted, setHasSubmitted] = useState(false)
    const [finalScore, setFinalScore] = useState(0)

    const lastFrameTimeRef = useRef<number>(0)
    const audioContextRef = useRef<AudioContext | null>(null)
    const audioBuffersRef = useRef<{
        point?: AudioBuffer
        hit?: AudioBuffer
        wing?: AudioBuffer
    }>({})

    const lastJumpTimeRef = useRef<number>(0)
    const pendingSoundsRef = useRef<Set<"point" | "hit" | "wing">>(new Set())

    const gameStateRef = useRef<GameState>({
        bird: { y: 200, velocity: 0, frame: 0 },
        pipes: [],
        score: 0,
        gameOver: false,
        gameStarted: false,
        frameCount: 0,
    })

    const birdSprites = useRef<HTMLImageElement[]>([])
    const backgroundImage = useRef<HTMLImageElement | null>(null)
    const numberSprites = useRef<HTMLImageElement[]>([])
    const gameOverImage = useRef<HTMLImageElement | null>(null)
    const messageImage = useRef<HTMLImageElement | null>(null)
    const pipeImage = useRef<HTMLImageElement | null>(null)

    // Calculate scale for mobile
    useEffect(() => {
        const updateScale = () => {
            if (window.innerWidth < 768) {
                const scaleX = window.innerWidth / CANVAS_WIDTH
                const scaleY = window.innerHeight / CANVAS_HEIGHT
                setScale(Math.max(scaleX, scaleY))
            } else {
                setScale(1)
            }
        }
        updateScale()
        window.addEventListener("resize", updateScale)
        window.addEventListener("orientationchange", updateScale)
        return () => {
            window.removeEventListener("resize", updateScale)
            window.removeEventListener("orientationchange", updateScale)
        }
    }, [])

    // Load assets
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
        const backgroundUrl =
            "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/background-day-rvpnF7CJRMdBNqqBc8Zfzz3QpIfkBG.png"
        const gameOverUrl =
            "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/gameover-NwA13AFRtIFat9QoA12T3lpjK76Qza.png"
        const messageUrl =
            "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/message-g1ru4NKF3KrKoFmiVpzR8fwdeLhwNa.png"
        const pipeUrl =
            "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/pipe-green-zrz2zTtoVXaLn6xDqgrNVF9luzjW1B.png"

        const loadImage = (url: string) =>
            new Promise<HTMLImageElement>((resolve, reject) => {
                const img = new Image()
                img.crossOrigin = "anonymous"
                img.onload = () => resolve(img)
                img.onerror = () => reject(new Error(`Failed to load image: ${url}`))
                img.src = url
            })

        const loadAudioBuffer = async (url: string): Promise<AudioBuffer> => {
            const response = await fetch(url)
            const arrayBuffer = await response.arrayBuffer()
            const AudioContextClass =
                window.AudioContext || (window as any).webkitAudioContext
            const audioContext =
                audioContextRef.current || new AudioContextClass()
            audioContextRef.current = audioContext
            return await audioContext.decodeAudioData(arrayBuffer)
        }

        Promise.all([
            ...birdUrls.map(loadImage),
            ...numberUrls.map(loadImage),
            loadImage(backgroundUrl),
            loadImage(gameOverUrl),
            loadImage(messageUrl),
            loadImage(pipeUrl),
            loadAudioBuffer(
                "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/point-SdTORahWMlxujnLCoDbujDLHI6KFeC.wav"
            ).then((buffer) => {
                audioBuffersRef.current.point = buffer
                return buffer
            }),
            loadAudioBuffer(
                "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/hit-YVMFYQJEgZASG6O3xPWiyiqPtOLygb.wav"
            ).then((buffer) => {
                audioBuffersRef.current.hit = buffer
                return buffer
            }),
            loadAudioBuffer(
                "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/wing-oOSsspXpVMDc0enrWj4WWLaHVqs6Hk.wav"
            ).then((buffer) => {
                audioBuffersRef.current.wing = buffer
                return buffer
            }),
        ])
            .then((loadedAssets) => {
                birdSprites.current = loadedAssets.slice(0, 3) as HTMLImageElement[]
                numberSprites.current = loadedAssets.slice(3, 13) as HTMLImageElement[]
                backgroundImage.current = loadedAssets[13] as HTMLImageElement
                gameOverImage.current = loadedAssets[14] as HTMLImageElement
                messageImage.current = loadedAssets[15] as HTMLImageElement
                pipeImage.current = loadedAssets[16] as HTMLImageElement
                setAssetsLoaded(true)
            })
            .catch((error) => {
                console.error("Asset loading error:", error)
                setLoadingError(error.message)
            })
    }, [])

    const playSoundImmediately = useCallback(
        (bufferKey: "point" | "hit" | "wing") => {
            const buffer = audioBuffersRef.current[bufferKey]
            const audioContext = audioContextRef.current
            if (buffer && audioContext && audioContext.state === "running") {
                try {
                    const source = audioContext.createBufferSource()
                    source.buffer = buffer
                    source.connect(audioContext.destination)
                    source.start(0)
                } catch (error) {
                    console.error("Error playing sound:", error)
                }
            }
        },
        []
    )

    const queueSound = useCallback((bufferKey: "point" | "hit" | "wing") => {
        pendingSoundsRef.current.add(bufferKey)
    }, [])

    const jump = useCallback(() => {
        const state = gameStateRef.current
        const now = Date.now()
        if (now - lastJumpTimeRef.current < JUMP_COOLDOWN) return
        lastJumpTimeRef.current = now

        if (!audioContextRef.current) {
            const AudioContextClass =
                window.AudioContext || (window as any).webkitAudioContext
            audioContextRef.current = new AudioContextClass()
        }
        if (audioContextRef.current.state === "suspended") {
            audioContextRef.current.resume()
        }

        if (!state.gameOver && state.gameStarted) {
            state.bird.velocity = -JUMP_STRENGTH
            playSoundImmediately("wing")
        } else if (!state.gameStarted) {
            state.gameStarted = true
            setIsGameStarted(true)
            lastFrameTimeRef.current = 0
        }
    }, [playSoundImmediately])

    // Leaderboard API
    const fetchLeaderboard = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/api/leaderboard`)
            if (res.ok) {
                const data = await res.json()
                setLeaderboard(data)
            }
        } catch (err) {
            console.error("Failed to fetch leaderboard:", err)
        }
    }, [])

    const submitScore = useCallback(async () => {
        if (isSubmitting || hasSubmitted) return
        setIsSubmitting(true)
        try {
            const name = playerName.trim() || "Anonymous"
            await fetch(`${API_BASE}/api/scores`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ player_name: name, score: finalScore }),
            })
            setHasSubmitted(true)
            await fetchLeaderboard()
        } catch (err) {
            console.error("Failed to submit score:", err)
        } finally {
            setIsSubmitting(false)
        }
    }, [isSubmitting, hasSubmitted, playerName, finalScore, fetchLeaderboard])

    const restartGame = useCallback(() => {
        gameStateRef.current = {
            bird: { y: 200, velocity: 0, frame: 0 },
            pipes: [],
            score: 0,
            gameOver: false,
            gameStarted: true,
            frameCount: 0,
        }
        setIsGameOver(false)
        setIsGameStarted(true)
        setHasSubmitted(false)
        setLeaderboard([])
        setFinalScore(0)
        lastFrameTimeRef.current = 0
    }, [])

    // Keyboard
    useEffect(() => {
        const handleKeyPress = (e: KeyboardEvent) => {
            if (e.code === "Space") {
                e.preventDefault()
                const state = gameStateRef.current
                if (!state.gameStarted) {
                    state.gameStarted = true
                    setIsGameStarted(true)
                    lastFrameTimeRef.current = 0
                } else if (!state.gameOver) {
                    jump()
                }
            }
        }
        window.addEventListener("keydown", handleKeyPress)
        return () => window.removeEventListener("keydown", handleKeyPress)
    }, [jump])

    // Game loop
    useEffect(() => {
        if (!assetsLoaded) return
        const canvas = canvasRef.current
        const ctx = canvas?.getContext("2d", { alpha: false, desynchronized: true })
        if (!canvas || !ctx) return

        let animationFrameId: number

        const gameLoop = (currentTime: number) => {
            const state = gameStateRef.current

            if (pendingSoundsRef.current.size > 0) {
                pendingSoundsRef.current.forEach((sound) => playSoundImmediately(sound))
                pendingSoundsRef.current.clear()
            }

            if (lastFrameTimeRef.current === 0) lastFrameTimeRef.current = currentTime
            let deltaTime =
                (currentTime - lastFrameTimeRef.current) / (1000 / TARGET_FPS)
            deltaTime = Math.min(deltaTime, MAX_DELTA_TIME)
            lastFrameTimeRef.current = currentTime

            ctx.clearRect(0, 0, canvas.width, canvas.height)

            if (backgroundImage.current) {
                ctx.drawImage(backgroundImage.current, 0, 0, canvas.width, canvas.height)
            }

            if (!state.gameStarted) {
                if (messageImage.current) {
                    const mw = 184, mh = 267
                    ctx.drawImage(messageImage.current, (canvas.width - mw) / 2, (canvas.height - mh) / 2, mw, mh)
                }
                animationFrameId = requestAnimationFrame(gameLoop)
                return
            }

            if (!state.gameOver) {
                state.bird.velocity += GRAVITY * deltaTime
                state.bird.y += state.bird.velocity * deltaTime
                state.frameCount++
                if (state.frameCount % 5 === 0) state.bird.frame = (state.bird.frame + 1) % 3

                const pipesToRemove: number[] = []
                for (let i = 0; i < state.pipes.length; i++) {
                    state.pipes[i].x -= PIPE_SPEED * deltaTime
                    if (state.pipes[i].x + PIPE_WIDTH <= 0) pipesToRemove.push(i)
                }
                for (let i = pipesToRemove.length - 1; i >= 0; i--) state.pipes.splice(pipesToRemove[i], 1)

                if (state.pipes.length === 0 || state.pipes[state.pipes.length - 1].x < canvas.width - 200) {
                    const topHeight = Math.random() * (canvas.height - PIPE_GAP - 100) + 50
                    state.pipes.push({ x: canvas.width, topHeight, scored: false })
                }

                const birdRect = { x: 50, y: state.bird.y, width: BIRD_WIDTH, height: BIRD_HEIGHT }

                for (const pipe of state.pipes) {
                    if (!pipe.scored && pipe.x + PIPE_WIDTH < 50) {
                        pipe.scored = true
                        state.score++
                        queueSound("point")
                    }

                    const topPipeRect = { x: pipe.x, y: 0, width: PIPE_WIDTH, height: pipe.topHeight }
                    const bottomPipeRect = {
                        x: pipe.x,
                        y: pipe.topHeight + PIPE_GAP,
                        width: PIPE_WIDTH,
                        height: canvas.height - pipe.topHeight - PIPE_GAP,
                    }

                    if (
                        birdRect.x < topPipeRect.x + topPipeRect.width &&
                        birdRect.x + birdRect.width > topPipeRect.x &&
                        birdRect.y < topPipeRect.y + topPipeRect.height &&
                        birdRect.y + birdRect.height > topPipeRect.y
                    ) {
                        state.gameOver = true
                        setFinalScore(state.score)
                        setIsGameOver(true)
                        queueSound("hit")
                        break
                    }

                    if (
                        birdRect.x < bottomPipeRect.x + bottomPipeRect.width &&
                        birdRect.x + birdRect.width > bottomPipeRect.x &&
                        birdRect.y < bottomPipeRect.y + bottomPipeRect.height &&
                        birdRect.y + birdRect.height > bottomPipeRect.y
                    ) {
                        state.gameOver = true
                        setFinalScore(state.score)
                        setIsGameOver(true)
                        queueSound("hit")
                        break
                    }
                }

                if (state.bird.y > canvas.height || state.bird.y < 0) {
                    state.gameOver = true
                    setFinalScore(state.score)
                    setIsGameOver(true)
                    queueSound("hit")
                }
            }

            // Draw pipes
            for (const pipe of state.pipes) {
                if (pipeImage.current) {
                    ctx.save()
                    ctx.scale(1, -1)
                    ctx.drawImage(pipeImage.current, pipe.x, -pipe.topHeight, PIPE_WIDTH, 320)
                    ctx.restore()
                    ctx.drawImage(pipeImage.current, pipe.x, pipe.topHeight + PIPE_GAP, PIPE_WIDTH, 320)
                }
            }

            // Draw bird
            ctx.save()
            ctx.translate(50 + BIRD_WIDTH / 2, state.bird.y + BIRD_HEIGHT / 2)
            ctx.rotate(Math.min(Math.PI / 4, Math.max(-Math.PI / 4, state.bird.velocity * 0.1)))
            ctx.drawImage(birdSprites.current[state.bird.frame], -BIRD_WIDTH / 2, -BIRD_HEIGHT / 2, BIRD_WIDTH, BIRD_HEIGHT)
            ctx.restore()

            // Draw score
            const scoreStr = state.score.toString()
            const dw = 24
            const tw = scoreStr.length * dw
            const sx = (canvas.width - tw) / 2
            for (let i = 0; i < scoreStr.length; i++) {
                const digitImg = numberSprites.current[parseInt(scoreStr[i])]
                if (digitImg) ctx.drawImage(digitImg, sx + i * dw, 20, dw, 36)
            }

            animationFrameId = requestAnimationFrame(gameLoop)
        }

        animationFrameId = requestAnimationFrame(gameLoop)
        return () => cancelAnimationFrame(animationFrameId)
    }, [assetsLoaded, playSoundImmediately, queueSound])

    // Fetch leaderboard on game over
    useEffect(() => {
        if (isGameOver) fetchLeaderboard()
    }, [isGameOver, fetchLeaderboard])

    const handleCanvasClick = useCallback(
        (_event: React.MouseEvent<HTMLCanvasElement>) => {
            if (gameStateRef.current.gameOver) return
            jump()
        },
        [jump]
    )

    const handleTouchStart = useCallback(
        (e: React.TouchEvent<HTMLCanvasElement>) => {
            e.preventDefault()
            e.stopPropagation()
            if (gameStateRef.current.gameOver) return
            jump()
        },
        [jump]
    )

    return (
        <div className="game-container">
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
                    <button className="btn-retry" onClick={() => window.location.reload()}>
                        Retry
                    </button>
                </div>
            )}
            {assetsLoaded && (
                <div className="canvas-wrapper">
                    <canvas
                        ref={canvasRef}
                        width={CANVAS_WIDTH}
                        height={CANVAS_HEIGHT}
                        className="game-canvas"
                        style={{
                            transform: `scale(${scale})`,
                            transformOrigin: "center center",
                            imageRendering: "pixelated",
                        }}
                        onClick={handleCanvasClick}
                        onTouchStart={handleTouchStart}
                    />
                    {!isGameStarted && (
                        <p className="hint">Tap to play or press Space to jump</p>
                    )}

                    {/* Game Over Overlay */}
                    {isGameOver && (
                        <div
                            className="overlay"
                            style={{
                                width: CANVAS_WIDTH,
                                height: CANVAS_HEIGHT,
                                transform: `scale(${scale})`,
                                transformOrigin: "center center",
                            }}
                        >
                            <div className="overlay-panel">
                                {/* Title */}
                                <div className="overlay-header">
                                    <div className="game-over-text">GAME OVER</div>
                                    <div className="final-score">{finalScore}</div>
                                    <div className="score-label">Score</div>
                                </div>

                                {/* Submit */}
                                {!hasSubmitted ? (
                                    <div className="submit-section">
                                        <input
                                            type="text"
                                            value={playerName}
                                            onChange={(e) => setPlayerName(e.target.value)}
                                            placeholder="Your name"
                                            maxLength={20}
                                            className="name-input"
                                        />
                                        <button
                                            onClick={submitScore}
                                            disabled={isSubmitting}
                                            className={`btn-submit ${isSubmitting ? "disabled" : ""}`}
                                        >
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
                                                <div
                                                    key={i}
                                                    className={`lb-row ${i === 0 ? "gold" : i < 3 ? "top3" : ""}`}
                                                >
                                                    <span className="lb-name">
                                                        {i + 1}. {entry.player_name}
                                                    </span>
                                                    <span className="lb-score">{entry.score}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Restart */}
                                <button onClick={restartGame} className="btn-restart">
                                    Restart
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
