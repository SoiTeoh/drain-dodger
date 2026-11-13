import './style.css';
import { tuning } from './config/tuning';
import { SoundEngine } from './game/audio';
import { DrainDodgerWorld } from './game/world';
import { drawGameFrame } from './render/painter';

const BEST_SCORE_KEY = 'drain_dodger_best_score_v1';

function readBestScore(): number {
  try {
    const raw = window.localStorage.getItem(BEST_SCORE_KEY);
    if (!raw) return 0;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

function writeBestScore(score: number): void {
  try {
    window.localStorage.setItem(BEST_SCORE_KEY, String(Math.max(0, Math.floor(score))));
  } catch {
    // Ignore storage errors in restricted contexts
  }
}

function main(): void {
  const canvasEl = document.getElementById('stage');
  if (!(canvasEl instanceof HTMLCanvasElement)) {
    throw new Error('Canvas element #stage not found');
  }
  const maybeCtx = canvasEl.getContext('2d');
  if (!maybeCtx) {
    throw new Error('2D rendering context unavailable');
  }
  const canvas: HTMLCanvasElement = canvasEl;
  const ctx: CanvasRenderingContext2D = maybeCtx;

  const params = new URLSearchParams(window.location.search);
  const debugMode = params.get('debug') === '1';

  const sound = new SoundEngine();
  let world = new DrainDodgerWorld(tuning);
  let bestScore = readBestScore();
  let screenMode: 'title' | 'playing' | 'result' = 'title';
  let crashFreezeSec = 0;
  let animTimeSec = 0;

  let steerPointerId: number | null = null;
  let steerPointerSide: -1 | 0 | 1 = 0;
  const heldKeys = new Set<string>();
  let dpr = 1;

  function resizeCanvas(): void {
    const vw = Math.max(240, window.innerWidth);
    const vh = Math.max(320, window.innerHeight);
    const aspect = tuning.view.width / tuning.view.height;

    let cssWidth = vw;
    let cssHeight = cssWidth / aspect;
    if (cssHeight > vh) {
      cssHeight = vh;
      cssWidth = cssHeight * aspect;
    }

    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.style.width = `${Math.floor(cssWidth)}px`;
    canvas.style.height = `${Math.floor(cssHeight)}px`;
    canvas.width = Math.round(tuning.view.width * dpr);
    canvas.height = Math.round(tuning.view.height * dpr);
  }

  function toLogicalCoords(clientX: number, clientY: number): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    const rx = rect.width > 0 ? (clientX - rect.left) / rect.width : 0.5;
    const ry = rect.height > 0 ? (clientY - rect.top) / rect.height : 0.5;
    return {
      x: Math.max(0, Math.min(tuning.view.width, rx * tuning.view.width)),
      y: Math.max(0, Math.min(tuning.view.height, ry * tuning.view.height)),
    };
  }

  function clearInputs(): void {
    steerPointerId = null;
    steerPointerSide = 0;
    heldKeys.clear();
  }

  function startNewGame(): void {
    sound.unlock();
    world = new DrainDodgerWorld(tuning);
    crashFreezeSec = 0;
    clearInputs();
    screenMode = 'playing';
  }

  function computeSteerDir(): -1 | 0 | 1 {
    let dir = 0;
    if (heldKeys.has('KeyA') || heldKeys.has('ArrowLeft')) dir -= 1;
    if (heldKeys.has('KeyD') || heldKeys.has('ArrowRight')) dir += 1;
    if (dir === 0 && steerPointerId !== null) {
      dir = steerPointerSide;
    }
    if (dir < 0) return -1;
    if (dir > 0) return 1;
    return 0;
  }

  function onPointerDown(e: PointerEvent): void {
    sound.unlock();
    const pt = toLogicalCoords(e.clientX, e.clientY);

    if (screenMode === 'title') {
      if (pt.x >= 64 && pt.x <= tuning.view.width - 64 && pt.y >= 424 && pt.y <= 476) {
        startNewGame();
      }
      return;
    }

    if (screenMode === 'result') {
      if (pt.x >= 64 && pt.x <= tuning.view.width - 64 && pt.y >= 446 && pt.y <= 498) {
        startNewGame();
      }
      return;
    }

    // Mute button top-right
    if (Math.hypot(pt.x - (tuning.view.width - 36), pt.y - 38) <= 20) {
      sound.muted = !sound.muted;
      return;
    }

    steerPointerId = e.pointerId;
    steerPointerSide = pt.x < tuning.view.width / 2 ? -1 : 1;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // Ignore synthetic events
    }
  }

  function onPointerMove(e: PointerEvent): void {
    if (screenMode !== 'playing' || steerPointerId !== e.pointerId) return;
    const pt = toLogicalCoords(e.clientX, e.clientY);
    steerPointerSide = pt.x < tuning.view.width / 2 ? -1 : 1;
  }

  function onPointerEnd(e: PointerEvent): void {
    if (steerPointerId !== e.pointerId) return;
    steerPointerId = null;
    steerPointerSide = 0;
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (['ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }

    if (screenMode === 'title' && (e.code === 'Space' || e.code === 'Enter')) {
      startNewGame();
      return;
    }

    if (screenMode === 'result' && (e.code === 'KeyR' || e.code === 'Enter')) {
      startNewGame();
      return;
    }

    if (screenMode !== 'playing') return;

    sound.unlock();
    if (
      e.code === 'KeyA' ||
      e.code === 'ArrowLeft' ||
      e.code === 'KeyD' ||
      e.code === 'ArrowRight'
    ) {
      heldKeys.add(e.code);
    }
  }

  function onKeyUp(e: KeyboardEvent): void {
    heldKeys.delete(e.code);
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerEnd);
  canvas.addEventListener('pointercancel', onPointerEnd);
  canvas.addEventListener('lostpointercapture', onPointerEnd);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', clearInputs);
  window.addEventListener('resize', resizeCanvas);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearInputs();
  });

  resizeCanvas();

  let lastTimeMs = performance.now();
  let accumulatorMs = 0;

  function stepSimulation(dtMs: number): void {
    const dtSec = dtMs / 1000;
    animTimeSec += dtSec;

    if (screenMode !== 'playing') return;

    const events = world.step(computeSteerDir(), dtMs);

    if (events.hitHorizontalGrate) sound.playHorizontalBump();
    if (events.hitPuddle) sound.playPuddleSplash();
    if (events.triggeredNearMiss) sound.playNearMiss();
    if (events.enteredCarWarn) sound.playCarHorn();
    if (events.enteredCarPass) sound.playCarWhoosh();
    if (events.justCrashed) {
      sound.playCrash();
      crashFreezeSec = 0.38;
    }

    if (world.bike.crashed) {
      crashFreezeSec -= dtSec;
      if (crashFreezeSec <= 0) {
        screenMode = 'result';
        clearInputs();
        if (world.bike.score > bestScore) {
          bestScore = Math.floor(world.bike.score);
          writeBestScore(bestScore);
        }
      }
    }
  }

  function frame(nowMs: number): void {
    const elapsed = Math.min(tuning.loop.maxFrameDtMs, Math.max(0, nowMs - lastTimeMs));
    lastTimeMs = nowMs;
    accumulatorMs += elapsed;

    while (accumulatorMs >= tuning.loop.fixedDtMs) {
      stepSimulation(tuning.loop.fixedDtMs);
      accumulatorMs -= tuning.loop.fixedDtMs;
    }

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawGameFrame(
      ctx,
      world,
      {
        screenMode,
        bestScore,
        muted: sound.muted,
        debug: debugMode,
        animTimeSec,
      },
      tuning,
    );
    ctx.restore();

    window.requestAnimationFrame(frame);
  }

  window.requestAnimationFrame(frame);
}

main();
