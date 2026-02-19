"use client"

import type React from "react"
import { useEffect, useRef, useState, useCallback } from "react"

// Recalibrated constants for time-based physics
const GRAVITY = 0.3
const JUMP_STRENGTH = 7.5
const PIPE_WIDTH = 52
const PIPE_GAP = 150
const PIPE_SPEED = 2
const BIRD_WIDTH = 34
const BIRD_HEIGHT = 24
const TARGET_FPS = 60
const MAX_DELTA_TIME = 1 // Clamp delta time to prevent huge jumps
const JUMP_COOLDOWN = 200 // milliseconds between jumps

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

  const lastFrameTimeRef = useRef<number>(0)
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioBuffersRef = useRef<{
    point?: AudioBuffer
    hit?: AudioBuffer
    wing?: AudioBuffer
  }>({})

  const lastJumpTimeRef = useRef<number>(0)
  const pendingSoundsRef = useRef<Set<"point" | "hit" | "wing">>(new Set())

  // Use refs for game state to avoid re-renders
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

  // Calculate scale for mobile to fill screen while maintaining aspect ratio
  useEffect(() => {
    const updateScale = () => {
      if (window.innerWidth < 768) {
        // Mobile view - scale to fit screen
        const scaleX = window.innerWidth / CANVAS_WIDTH
        const scaleY = window.innerHeight / CANVAS_HEIGHT
        // Use the larger scale to ensure full coverage
        setScale(Math.max(scaleX, scaleY))
      } else {
        // Desktop view - no scaling
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
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
      const audioContext = audioContextRef.current || new AudioContextClass()
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
        "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/point-SdTORahWMlxujnLCoDbujDLHI6KFeC.wav",
      ).then((buffer) => {
        audioBuffersRef.current.point = buffer
        return buffer
      }),
      loadAudioBuffer(
        "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/hit-YVMFYQJEgZASG6O3xPWiyiqPtOLygb.wav",
      ).then((buffer) => {
        audioBuffersRef.current.hit = buffer
        return buffer
      }),
      loadAudioBuffer(
        "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/wing-oOSsspXpVMDc0enrWj4WWLaHVqs6Hk.wav",
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

  const playSoundImmediately = useCallback((bufferKey: "point" | "hit" | "wing") => {
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
  }, [])

  const queueSound = useCallback((bufferKey: "point" | "hit" | "wing") => {
    pendingSoundsRef.current.add(bufferKey)
  }, [])

  const jump = useCallback(() => {
    const state = gameStateRef.current
    const now = Date.now()

    // Prevent rapid-fire jumps
    if (now - lastJumpTimeRef.current < JUMP_COOLDOWN) {
      return
    }
    lastJumpTimeRef.current = now

    // Initialize and resume AudioContext on user interaction (required for Safari)
    if (!audioContextRef.current) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
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
    lastFrameTimeRef.current = 0
  }, [])

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

  useEffect(() => {
    if (!assetsLoaded) return

    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d", {
      alpha: false,
      desynchronized: true,
    })
    if (!canvas || !ctx) return

    let animationFrameId: number

    const gameLoop = (currentTime: number) => {
      const state = gameStateRef.current

      // Play any pending sounds
      if (pendingSoundsRef.current.size > 0) {
        pendingSoundsRef.current.forEach((sound) => {
          playSoundImmediately(sound)
        })
        pendingSoundsRef.current.clear()
      }

      // Calculate delta time and clamp it
      if (lastFrameTimeRef.current === 0) {
        lastFrameTimeRef.current = currentTime
      }
      let deltaTime = (currentTime - lastFrameTimeRef.current) / (1000 / TARGET_FPS)
      // Clamp delta time to prevent huge jumps from frame drops or tab switching
      deltaTime = Math.min(deltaTime, MAX_DELTA_TIME)
      lastFrameTimeRef.current = currentTime

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Draw background
      if (backgroundImage.current) {
        ctx.drawImage(backgroundImage.current, 0, 0, canvas.width, canvas.height)
      }

      if (!state.gameStarted) {
        // Draw message
        if (messageImage.current) {
          const messageWidth = 184
          const messageHeight = 267
          const messageX = (canvas.width - messageWidth) / 2
          const messageY = (canvas.height - messageHeight) / 2
          ctx.drawImage(messageImage.current, messageX, messageY, messageWidth, messageHeight)
        }
        animationFrameId = requestAnimationFrame(gameLoop)
        return
      }

      if (!state.gameOver) {
        // Update bird position and animation frame with delta time
        state.bird.velocity += GRAVITY * deltaTime
        state.bird.y += state.bird.velocity * deltaTime

        state.frameCount++
        if (state.frameCount % 5 === 0) {
          state.bird.frame = (state.bird.frame + 1) % 3
        }

        // Move pipes with delta time
        const pipesToRemove: number[] = []
        for (let i = 0; i < state.pipes.length; i++) {
          const pipe = state.pipes[i]
          pipe.x -= PIPE_SPEED * deltaTime

          // Mark for removal if off-screen
          if (pipe.x + PIPE_WIDTH <= 0) {
            pipesToRemove.push(i)
          }
        }

        // Remove off-screen pipes (in reverse to avoid index issues)
        for (let i = pipesToRemove.length - 1; i >= 0; i--) {
          state.pipes.splice(pipesToRemove[i], 1)
        }

        // Generate new pipes
        if (state.pipes.length === 0 || state.pipes[state.pipes.length - 1].x < canvas.width - 200) {
          const topHeight = Math.random() * (canvas.height - PIPE_GAP - 100) + 50
          state.pipes.push({ x: canvas.width, topHeight, scored: false })
        }

        // Check collisions and scoring in a single loop
        const birdRect = { x: 50, y: state.bird.y, width: BIRD_WIDTH, height: BIRD_HEIGHT }

        for (const pipe of state.pipes) {
          // Scoring check
          if (!pipe.scored && pipe.x + PIPE_WIDTH < 50) {
            pipe.scored = true
            state.score++
            queueSound("point")
          }

          // Collision detection
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
            setIsGameOver(true)
            queueSound("hit")
            break
          }
        }

        // Boundary check
        if (state.bird.y > canvas.height || state.bird.y < 0) {
          state.gameOver = true
          setIsGameOver(true)
          queueSound("hit")
        }
      }

      // Draw pipes
      for (const pipe of state.pipes) {
        if (pipeImage.current) {
          // Draw top pipe (flipped vertically)
          ctx.save()
          ctx.scale(1, -1)
          ctx.drawImage(pipeImage.current, pipe.x, -pipe.topHeight, PIPE_WIDTH, 320)
          ctx.restore()

          // Draw bottom pipe
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
      const scoreString = state.score.toString()
      const digitWidth = 24
      const totalWidth = scoreString.length * digitWidth
      const startX = (canvas.width - totalWidth) / 2
      for (let i = 0; i < scoreString.length; i++) {
        const digitImage = numberSprites.current[Number.parseInt(scoreString[i])]
        if (digitImage) {
          ctx.drawImage(digitImage, startX + i * digitWidth, 20, digitWidth, 36)
        }
      }

      if (state.gameOver) {
        if (gameOverImage.current) {
          const gameOverWidth = 192
          const gameOverHeight = 42
          const gameOverX = (canvas.width - gameOverWidth) / 2
          const gameOverY = (canvas.height - gameOverHeight) / 2
          ctx.drawImage(gameOverImage.current, gameOverX, gameOverY, gameOverWidth, gameOverHeight)

          // Draw Restart button
          ctx.fillStyle = "rgba(0, 0, 0, 0.5)"
          ctx.fillRect(canvas.width / 2 - 50, canvas.height / 2 + 50, 100, 40)
          ctx.fillStyle = "white"
          ctx.font = "20px Arial"
          ctx.fillText("Restart", canvas.width / 2 - 30, canvas.height / 2 + 75)
        }
      }

      animationFrameId = requestAnimationFrame(gameLoop)
    }

    animationFrameId = requestAnimationFrame(gameLoop)

    return () => cancelAnimationFrame(animationFrameId)
  }, [assetsLoaded, playSoundImmediately, queueSound])

  const handleCanvasClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      const x = (event.clientX - rect.left) * (CANVAS_WIDTH / rect.width)
      const y = (event.clientY - rect.top) * (CANVAS_HEIGHT / rect.height)

      const state = gameStateRef.current

      if (state.gameOver) {
        // Check if click is within Restart button area
        if (
          x >= CANVAS_WIDTH / 2 - 50 &&
          x <= CANVAS_WIDTH / 2 + 50 &&
          y >= CANVAS_HEIGHT / 2 + 50 &&
          y <= CANVAS_HEIGHT / 2 + 90
        ) {
          restartGame()
          return // Exit early to prevent jump
        }
      }

      // Only jump if we didn't restart
      jump()
    },
    [jump, restartGame],
  )

  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      e.preventDefault()
      e.stopPropagation()

      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      const touch = e.touches[0]
      const x = (touch.clientX - rect.left) * (CANVAS_WIDTH / rect.width)
      const y = (touch.clientY - rect.top) * (CANVAS_HEIGHT / rect.height)

      const state = gameStateRef.current

      if (state.gameOver) {
        // Check if touch is within Restart button area
        if (
          x >= CANVAS_WIDTH / 2 - 50 &&
          x <= CANVAS_WIDTH / 2 + 50 &&
          y >= CANVAS_HEIGHT / 2 + 50 &&
          y <= CANVAS_HEIGHT / 2 + 90
        ) {
          restartGame()
          return // Exit early to prevent jump
        }
      }

      // Only jump if we didn't restart
      jump()
    },
    [jump, restartGame],
  )

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 overflow-hidden">
      {!assetsLoaded && !loadingError && (
        <div className="text-center">
          <div className="text-2xl font-bold mb-4">Loading Flappy Bird...</div>
          <div className="animate-pulse text-gray-600">Please wait</div>
        </div>
      )}
      {loadingError && (
        <div className="text-center p-4 max-w-md">
          <div className="text-2xl font-bold mb-4 text-red-600">Loading Error</div>
          <div className="text-gray-700 mb-4">{loadingError}</div>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Retry
          </button>
        </div>
      )}
      {assetsLoaded && (
        <>
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="border border-gray-300 touch-none md:border"
            style={{
              transform: `scale(${scale})`,
              transformOrigin: "center center",
              imageRendering: "pixelated",
            }}
            onClick={handleCanvasClick}
            onTouchStart={handleTouchStart}
          />
          <p className="hidden md:block mt-4 text-lg text-center px-4">Tap to play or press Space to jump</p>
        </>
      )}
    </div>
  )
}
