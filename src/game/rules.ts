import { tuning, type Tuning } from '../config/tuning';

export type ObstacleKind =
  | 'vertical_grate'
  | 'horizontal_grate'
  | 'puddle'
  | 'puddle_hidden_grate';

export type CrashReason = 'none' | 'vertical_grate' | 'curb' | 'overtake_car';

export interface ProjectedPoint {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

export interface BikeState {
  readonly x: number;
  readonly vx: number;
  readonly leanRad: number;
  readonly puddleSlowSec: number;
  readonly speedMps: number;
  readonly distanceM: number;
  readonly score: number;
  readonly nearMissCount: number;
  readonly horizontalPassCount: number;
  readonly crashed: boolean;
  readonly crashReason: CrashReason;
}

export interface RoadObstacle {
  readonly id: number;
  readonly kind: ObstacleKind;
  readonly worldX: number;
  readonly halfWidth: number;
  readonly z: number;
  readonly lengthZ: number;
  readonly triggered: boolean;
  readonly nearMissAwarded: boolean;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * 只有当超车红车实际处于骑行者贴身 Z 轴区间（dangerMinZ ~ dangerMaxZ）时，
 * 越过白线才会触发碰撞，避免红车驶向远方地平线后仍发生隐形撞车。
 */
export function isCarBlockingLane(
  carPhase: 'IDLE' | 'HORN_WARN' | 'PASSING',
  carZ: number,
  t: Tuning = tuning,
): boolean {
  return carPhase === 'PASSING' && carZ >= t.car.dangerMinZ && carZ <= t.car.dangerMaxZ;
}

/**
 * 经典 OutRun / javascript-racer 伪 3D 透视投影纯函数：
 * scale = cameraDepth / dz，保证随 dz 增大严格单调缩小并收敛于 horizonY。
 */
export function projectWorldToScreen(
  worldX: number,
  dz: number,
  cameraX: number,
  t: Tuning = tuning,
): ProjectedPoint {
  const safeDz = Math.max(0.05, dz);
  const scale = t.camera.cameraDepth / safeDz;
  const x = t.view.width * 0.5 + (worldX - cameraX) * t.camera.roadHalfWidthPx * scale;
  const y = t.camera.horizonY + t.camera.cameraHeight * scale * t.camera.roadScaleY;
  return { x, y, scale };
}

export function computeCurrentSpeedMps(distanceM: number, t: Tuning = tuning): number {
  const ratio = clamp(distanceM / t.bike.speedRampDistM, 0, 1);
  return t.bike.minSpeedMps + (t.bike.maxSpeedMps - t.bike.minSpeedMps) * ratio;
}

export function createInitialBikeState(t: Tuning = tuning): BikeState {
  return {
    x: 0.1,
    vx: 0,
    leanRad: 0,
    puddleSlowSec: 0,
    speedMps: t.bike.minSpeedMps,
    distanceM: 0,
    score: 0,
    nearMissCount: 0,
    horizontalPassCount: 0,
    crashed: false,
    crashReason: 'none',
  };
}

export function stepBikeLateral(
  prev: BikeState,
  steerDir: -1 | 0 | 1,
  dtSec: number,
  carPassing: boolean,
  t: Tuning = tuning,
): BikeState {
  if (prev.crashed) return prev;

  const puddleSlowSec = Math.max(0, prev.puddleSlowSec - dtSec);
  const steerFactor = puddleSlowSec > 0 ? t.bike.puddleSteerFactor : 1;

  let vx = prev.vx;
  if (steerDir !== 0) {
    vx += steerDir * t.bike.steerAccel * steerFactor * dtSec;
  } else {
    vx -= vx * Math.min(1, t.bike.steerDrag * dtSec);
  }
  vx = clamp(vx, -t.bike.steerMaxVel * steerFactor, t.bike.steerMaxVel * steerFactor);

  let x = prev.x + vx * dtSec;
  const maxLeanRad = (t.bike.maxLeanDeg * Math.PI) / 180;
  const targetLean = (vx / t.bike.steerMaxVel) * maxLeanRad;
  const leanRad = prev.leanRad + (targetLean - prev.leanRad) * Math.min(1, 14 * dtSec);

  const effectiveHalf = t.bike.tireHalfWidth * t.bike.hitboxForgiveness;

  if (x + effectiveHalf > t.bike.corridorRightX) {
    return {
      ...prev,
      x: t.bike.corridorRightX - effectiveHalf,
      vx: 0,
      leanRad,
      puddleSlowSec,
      crashed: true,
      crashReason: 'curb',
    };
  }

  if (carPassing && x - effectiveHalf < t.car.carRightEdgeX) {
    return {
      ...prev,
      x: t.car.carRightEdgeX + effectiveHalf,
      vx: 0,
      leanRad,
      puddleSlowSec,
      crashed: true,
      crashReason: 'overtake_car',
    };
  }

  x = Math.max(t.bike.minWorldX, x);

  return {
    ...prev,
    x,
    vx,
    leanRad,
    puddleSlowSec,
  };
}

export interface ObstacleHitResult {
  readonly obstacle: RoadObstacle;
  readonly crashedGrate: boolean;
  readonly hitHorizontalGrate: boolean;
  readonly hitPuddle: boolean;
  readonly triggeredNearMiss: boolean;
}

export function evaluateObstacleInteraction(
  bikeX: number,
  obs: RoadObstacle,
  t: Tuning = tuning,
): ObstacleHitResult {
  const effectiveHalf = t.bike.tireHalfWidth * t.bike.hitboxForgiveness;
  const cz = t.camera.collisionZ;
  const zMin = obs.z - obs.lengthZ * 0.5;
  const zMax = obs.z + obs.lengthZ * 0.5;
  const inZ = cz >= zMin && cz <= zMax;

  // Fatal grate interval (for puddle_hidden_grate, the hidden grate sits in its inner 55% width)
  const fatalHalfWidth =
    obs.kind === 'puddle_hidden_grate' ? obs.halfWidth * 0.55 : obs.halfWidth;
  const dx = Math.abs(bikeX - obs.worldX);

  if (inZ) {
    if (obs.kind === 'vertical_grate' || obs.kind === 'puddle_hidden_grate') {
      if (dx <= fatalHalfWidth + effectiveHalf) {
        return {
          obstacle: { ...obs, triggered: true },
          crashedGrate: true,
          hitHorizontalGrate: false,
          hitPuddle: false,
          triggeredNearMiss: false,
        };
      }
      if (
        !obs.triggered &&
        obs.kind === 'puddle_hidden_grate' &&
        dx <= obs.halfWidth + effectiveHalf
      ) {
        return {
          obstacle: { ...obs, triggered: true },
          crashedGrate: false,
          hitHorizontalGrate: false,
          hitPuddle: true,
          triggeredNearMiss: false,
        };
      }
    } else if (obs.kind === 'horizontal_grate' && !obs.triggered) {
      if (dx <= obs.halfWidth + effectiveHalf) {
        return {
          obstacle: { ...obs, triggered: true },
          crashedGrate: false,
          hitHorizontalGrate: true,
          hitPuddle: false,
          triggeredNearMiss: false,
        };
      }
    } else if (obs.kind === 'puddle' && !obs.triggered) {
      if (dx <= obs.halfWidth + effectiveHalf) {
        return {
          obstacle: { ...obs, triggered: true },
          crashedGrate: false,
          hitHorizontalGrate: false,
          hitPuddle: true,
          triggeredNearMiss: false,
        };
      }
    }
  }

  // Near miss check right after passing the vertical grate
  if (
    zMax < cz &&
    !obs.nearMissAwarded &&
    !obs.triggered &&
    (obs.kind === 'vertical_grate' || obs.kind === 'puddle_hidden_grate')
  ) {
    const safeClearance = fatalHalfWidth + effectiveHalf + t.bike.nearMissMargin;
    if (dx <= safeClearance) {
      return {
        obstacle: { ...obs, nearMissAwarded: true },
        crashedGrate: false,
        hitHorizontalGrate: false,
        hitPuddle: false,
        triggeredNearMiss: true,
      };
    }
    return {
      obstacle: { ...obs, nearMissAwarded: true },
      crashedGrate: false,
      hitHorizontalGrate: false,
      hitPuddle: false,
      triggeredNearMiss: false,
    };
  }

  return {
    obstacle: obs,
    crashedGrate: false,
    hitHorizontalGrate: false,
    hitPuddle: false,
    triggeredNearMiss: false,
  };
}

export interface SafeGap {
  readonly width: number;
  readonly centerX: number;
}

/**
 * 计算在 [-0.90, +0.95] 核心骑行走廊内不被致命竖缝阻挡的最宽连续安全通道。
 */
export function findWidestSafeGap(obstaclesInWindow: readonly RoadObstacle[]): SafeGap {
  const minX = -0.9;
  const maxX = 0.95;

  const blocked: Array<[number, number]> = [];
  for (const o of obstaclesInWindow) {
    if (o.kind !== 'vertical_grate' && o.kind !== 'puddle_hidden_grate') continue;
    const hw = o.kind === 'puddle_hidden_grate' ? o.halfWidth * 0.55 : o.halfWidth;
    blocked.push([clamp(o.worldX - hw, minX, maxX), clamp(o.worldX + hw, minX, maxX)]);
  }

  if (blocked.length === 0) {
    return { width: maxX - minX, centerX: (minX + maxX) * 0.5 };
  }

  blocked.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const seg of blocked) {
    if (seg[1] <= seg[0]) continue;
    const last = merged[merged.length - 1];
    if (!last || seg[0] > last[1]) {
      merged.push([seg[0], seg[1]]);
    } else {
      last[1] = Math.max(last[1], seg[1]);
    }
  }

  let bestWidth = 0;
  let bestCenter = 0;
  let cursor = minX;

  for (const [bStart, bEnd] of merged) {
    const gapW = bStart - cursor;
    if (gapW > bestWidth) {
      bestWidth = gapW;
      bestCenter = (cursor + bStart) * 0.5;
    }
    cursor = Math.max(cursor, bEnd);
  }

  const tailW = maxX - cursor;
  if (tailW > bestWidth) {
    bestWidth = tailW;
    bestCenter = (cursor + maxX) * 0.5;
  }

  return { width: bestWidth, centerX: bestCenter };
}

/**
 * 公平障碍物波次生成器：
 * 结合已有滑入窗口的障碍物，强制校验每次生成后骑行走廊内仍保留 >= minSafeCorridorWidth 的可通行路径。
 */
export function generateFairObstacleBatch(
  spawnZ: number,
  distanceM: number,
  existingObstacles: readonly RoadObstacle[],
  startId: number,
  t: Tuning = tuning,
  rng: () => number = Math.random,
): RoadObstacle[] {
  const windowObs = existingObstacles.filter(
    (o) => Math.abs(o.z - spawnZ) <= t.spawner.fairWindowZ,
  );
  const candidates: RoadObstacle[] = [];
  let nextId = startId;

  const roll = rng();
  if (roll < 0.42) {
    // Classic right-side vertical drain grate
    const worldX = 0.58 + rng() * 0.24;
    candidates.push({
      id: nextId++,
      kind: 'vertical_grate',
      worldX,
      halfWidth: 0.17,
      z: spawnZ,
      lengthZ: 0.85,
      triggered: false,
      nearMissAwarded: false,
    });
  } else if (roll < 0.7) {
    // Mid-corridor vertical grate + safe horizontal grate combo (forces texture reading!)
    const vertLeft = rng() < 0.5;
    candidates.push({
      id: nextId++,
      kind: 'vertical_grate',
      worldX: vertLeft ? -0.32 : 0.48,
      halfWidth: 0.19,
      z: spawnZ,
      lengthZ: 0.85,
      triggered: false,
      nearMissAwarded: false,
    });
    candidates.push({
      id: nextId++,
      kind: 'horizontal_grate',
      worldX: vertLeft ? 0.45 : -0.35,
      halfWidth: 0.24,
      z: spawnZ,
      lengthZ: 0.78,
      triggered: false,
      nearMissAwarded: false,
    });
  } else if (roll < 0.88) {
    // Horizontal safe grate or puddle
    const isPuddle = rng() < 0.48;
    candidates.push({
      id: nextId++,
      kind: isPuddle ? 'puddle' : 'horizontal_grate',
      worldX: -0.45 + rng() * 0.95,
      halfWidth: isPuddle ? 0.28 : 0.25,
      z: spawnZ,
      lengthZ: isPuddle ? 0.95 : 0.78,
      triggered: false,
      nearMissAwarded: false,
    });
  } else {
    // Mid/late game: puddle with hidden grate inside, or wide road hazard
    const useHidden = distanceM >= 80;
    candidates.push({
      id: nextId++,
      kind: useHidden ? 'puddle_hidden_grate' : 'vertical_grate',
      worldX: -0.15 + rng() * 0.72,
      halfWidth: useHidden ? 0.28 : 0.19,
      z: spawnZ,
      lengthZ: useHidden ? 0.95 : 0.85,
      triggered: false,
      nearMissAwarded: false,
    });
  }

  // Enforce fairness invariant: must leave >= minSafeCorridorWidth passable gap
  const accepted: RoadObstacle[] = [];
  for (const cand of candidates) {
    const gap = findWidestSafeGap([...windowObs, ...accepted, cand]);
    if (gap.width >= t.spawner.minSafeCorridorWidth) {
      accepted.push(cand);
    } else if (cand.kind === 'vertical_grate' || cand.kind === 'puddle_hidden_grate') {
      // Downgrade to safe horizontal grate so rhythm stays lively without creating an impossible wall
      accepted.push({
        ...cand,
        kind: 'horizontal_grate',
        halfWidth: 0.23,
      });
    }
  }

  return accepted;
}
