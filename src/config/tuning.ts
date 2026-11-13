export const tuning = {
  view: {
    width: 390,
    height: 640,
  },
  loop: {
    fixedDtMs: 1000 / 60,
    maxFrameDtMs: 50,
  },
  camera: {
    horizonY: 235,
    cameraHeight: 1.0,
    cameraDepth: 0.85,
    roadScaleY: 300,
    roadHalfWidthPx: 118,
    drawDistanceZ: 24,
    collisionZ: 0.945, // maps to screenY ≈ 505, right in front of stem/wheel
    stripeLengthZ: 0.8,
    cameraFollowRatio: 0.62,
  },
  bike: {
    tireHalfWidth: 0.055,
    hitboxForgiveness: 0.88, // 12% forgiving collision box
    nearMissMargin: 0.13,
    steerAccel: 5.8,
    steerMaxVel: 1.85,
    steerDrag: 6.2,
    puddleSteerFactor: 0.7, // 30% reduced steering sensitivity
    puddleDurationSec: 0.6,
    maxLeanDeg: 14,
    minSpeedMps: 5.5, // ~20 km/h
    maxSpeedMps: 12.6, // ~45 km/h
    speedRampDistM: 520,
    minWorldX: -1.42, // can borrow motor lane when no car is passing
    corridorLeftX: -1.0,
    corridorRightX: 1.0,
  },
  car: {
    warnSec: 1.1,
    passSec: 1.45,
    cooldownMinSec: 4.5,
    cooldownMaxSec: 8.5,
    carRightEdgeX: -0.95,
    dangerMinZ: 0.45,
    dangerMaxZ: 2.35,
  },
  spawner: {
    minGapZ: 3.4,
    maxGapZ: 5.6,
    fairWindowZ: 2.2,
    minSafeCorridorWidth: 0.28, // > 2.5x full tire width (2 * 0.055 * 2.5 = 0.275)
  },
  scoring: {
    nearMissBonus: 30,
    horizontalGrateBonus: 10,
    metersPerZ: 2.6,
  },
} as const;

export type Tuning = typeof tuning;
