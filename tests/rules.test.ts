import { describe, expect, it } from 'vitest';
import { tuning } from '../src/config/tuning';
import {
  computeCurrentSpeedMps,
  createInitialBikeState,
  evaluateObstacleInteraction,
  findWidestSafeGap,
  generateFairObstacleBatch,
  isCarBlockingLane,
  projectWorldToScreen,
  stepBikeLateral,
  type RoadObstacle,
} from '../src/game/rules';

describe('projectWorldToScreen', () => {
  it('scales down monotonically as dz increases and converges toward horizonY', () => {
    const near = projectWorldToScreen(0, 1.0, 0, tuning);
    const mid = projectWorldToScreen(0, 4.0, 0, tuning);
    const far = projectWorldToScreen(0, 16.0, 0, tuning);

    expect(near.scale).toBeGreaterThan(mid.scale);
    expect(mid.scale).toBeGreaterThan(far.scale);
    expect(near.y).toBeGreaterThan(mid.y);
    expect(mid.y).toBeGreaterThan(far.y);
    expect(far.y).toBeGreaterThan(tuning.camera.horizonY);
  });

  it('clamps dz <= 0 safely without producing NaN or Infinity', () => {
    const p = projectWorldToScreen(0.5, -2, 0, tuning);
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.y)).toBe(true);
    expect(Number.isFinite(p.scale)).toBe(true);
  });
});

describe('computeCurrentSpeedMps', () => {
  it('ramps smoothly from minSpeedMps to maxSpeedMps', () => {
    expect(computeCurrentSpeedMps(0, tuning)).toBe(tuning.bike.minSpeedMps);
    expect(computeCurrentSpeedMps(tuning.bike.speedRampDistM / 2, tuning)).toBeGreaterThan(
      tuning.bike.minSpeedMps,
    );
    expect(computeCurrentSpeedMps(tuning.bike.speedRampDistM * 2, tuning)).toBe(
      tuning.bike.maxSpeedMps,
    );
  });
});

describe('stepBikeLateral', () => {
  it('steers left and right smoothly and applies drag when released', () => {
    let bike = createInitialBikeState(tuning);
    bike = stepBikeLateral(bike, 1, 0.2, false, tuning);
    expect(bike.vx).toBeGreaterThan(0);
    expect(bike.leanRad).toBeGreaterThan(0);

    const prevVx = bike.vx;
    bike = stepBikeLateral(bike, 0, 0.2, false, tuning);
    expect(bike.vx).toBeLessThan(prevVx);
  });

  it('reduces steering sensitivity by 30% while puddleSlowSec > 0', () => {
    const normal = stepBikeLateral(createInitialBikeState(tuning), 1, 0.1, false, tuning);
    const wet = stepBikeLateral(
      { ...createInitialBikeState(tuning), puddleSlowSec: 0.5 },
      1,
      0.1,
      false,
      tuning,
    );
    expect(wet.vx).toBeCloseTo(normal.vx * tuning.bike.puddleSteerFactor, 4);
  });

  it('crashes on right curb when exceeding corridorRightX', () => {
    const nearCurb = { ...createInitialBikeState(tuning), x: 0.99, vx: 1.5 };
    const next = stepBikeLateral(nearCurb, 1, 0.1, false, tuning);
    expect(next.crashed).toBe(true);
    expect(next.crashReason).toBe('curb');
  });

  it('allows borrowing left of white line when no car is passing, but crashes if car is passing in close Z window', () => {
    const leftBike = { ...createInitialBikeState(tuning), x: -1.15 };
    const safeBorrow = stepBikeLateral(leftBike, 0, 0.05, false, tuning);
    expect(safeBorrow.crashed).toBe(false);

    const hitCar = stepBikeLateral(leftBike, 0, 0.05, true, tuning);
    expect(hitCar.crashed).toBe(true);
    expect(hitCar.crashReason).toBe('overtake_car');
  });

  it('aligns overtaking car danger strictly with close-range Z window', () => {
    expect(isCarBlockingLane('IDLE', 1.0, tuning)).toBe(false);
    expect(isCarBlockingLane('HORN_WARN', 1.0, tuning)).toBe(false);
    expect(isCarBlockingLane('PASSING', 1.1, tuning)).toBe(true);
    expect(isCarBlockingLane('PASSING', tuning.car.dangerMaxZ + 0.5, tuning)).toBe(false);
  });
});

describe('evaluateObstacleInteraction', () => {
  const cz = tuning.camera.collisionZ;

  it('crashes when tire overlaps a vertical_grate', () => {
    const obs: RoadObstacle = {
      id: 1,
      kind: 'vertical_grate',
      worldX: 0.5,
      halfWidth: 0.17,
      z: cz,
      lengthZ: 0.85,
      triggered: false,
      nearMissAwarded: false,
    };
    const res = evaluateObstacleInteraction(0.45, obs, tuning);
    expect(res.crashedGrate).toBe(true);
  });

  it('safely rolls over horizontal_grate and triggers bonus once', () => {
    const obs: RoadObstacle = {
      id: 2,
      kind: 'horizontal_grate',
      worldX: 0.2,
      halfWidth: 0.24,
      z: cz,
      lengthZ: 0.78,
      triggered: false,
      nearMissAwarded: false,
    };
    const first = evaluateObstacleInteraction(0.22, obs, tuning);
    expect(first.crashedGrate).toBe(false);
    expect(first.hitHorizontalGrate).toBe(true);

    const second = evaluateObstacleInteraction(0.22, first.obstacle, tuning);
    expect(second.hitHorizontalGrate).toBe(false);
  });

  it('triggers puddle slow effect without crashing on plain puddle', () => {
    const obs: RoadObstacle = {
      id: 3,
      kind: 'puddle',
      worldX: 0.0,
      halfWidth: 0.28,
      z: cz,
      lengthZ: 0.95,
      triggered: false,
      nearMissAwarded: false,
    };
    const res = evaluateObstacleInteraction(0.1, obs, tuning);
    expect(res.crashedGrate).toBe(false);
    expect(res.hitPuddle).toBe(true);
  });

  it('crashes on inner hidden grate of puddle_hidden_grate, but only splashes outer edge', () => {
    const obs: RoadObstacle = {
      id: 4,
      kind: 'puddle_hidden_grate',
      worldX: 0.3,
      halfWidth: 0.28,
      z: cz,
      lengthZ: 0.95,
      triggered: false,
      nearMissAwarded: false,
    };
    const outerHit = evaluateObstacleInteraction(0.56, obs, tuning);
    expect(outerHit.crashedGrate).toBe(false);
    expect(outerHit.hitPuddle).toBe(true);

    const innerHit = evaluateObstacleInteraction(0.32, obs, tuning);
    expect(innerHit.crashedGrate).toBe(true);
  });

  it('awards Near Miss once when passing close to vertical_grate without colliding', () => {
    const passedObs: RoadObstacle = {
      id: 5,
      kind: 'vertical_grate',
      worldX: 0.5,
      halfWidth: 0.17,
      z: cz - 0.6, // zMax = cz - 0.175 < cz
      lengthZ: 0.85,
      triggered: false,
      nearMissAwarded: false,
    };
    const nearRes = evaluateObstacleInteraction(0.25, passedObs, tuning);
    expect(nearRes.triggeredNearMiss).toBe(true);

    // Does not repeat on subsequent frames
    const repeatRes = evaluateObstacleInteraction(0.25, nearRes.obstacle, tuning);
    expect(repeatRes.triggeredNearMiss).toBe(false);
  });

  it('does not award Near Miss when passing far away from vertical_grate', () => {
    const passedObs: RoadObstacle = {
      id: 6,
      kind: 'vertical_grate',
      worldX: 0.7,
      halfWidth: 0.17,
      z: cz - 0.6,
      lengthZ: 0.85,
      triggered: false,
      nearMissAwarded: false,
    };
    const farRes = evaluateObstacleInteraction(-0.4, passedObs, tuning);
    expect(farRes.triggeredNearMiss).toBe(false);
  });
});

describe('Fair Obstacle Spawner', () => {
  it('finds widest safe gap correctly when multiple vertical grates exist', () => {
    const gap = findWidestSafeGap([
      {
        id: 1,
        kind: 'vertical_grate',
        worldX: -0.4,
        halfWidth: 0.2,
        z: 10,
        lengthZ: 0.85,
        triggered: false,
        nearMissAwarded: false,
      },
      {
        id: 2,
        kind: 'vertical_grate',
        worldX: 0.6,
        halfWidth: 0.2,
        z: 10,
        lengthZ: 0.85,
        triggered: false,
        nearMissAwarded: false,
      },
    ]);
    // [-0.2, +0.4] => width 0.6
    expect(gap.width).toBeCloseTo(0.6, 3);
    expect(gap.centerX).toBeCloseTo(0.1, 3);
  });

  it('never generates an impassable wall across 200 consecutive waves', () => {
    let allObs: RoadObstacle[] = [];
    let nextId = 1;
    let seed = 42;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    for (let wave = 0; wave < 200; wave++) {
      const z = 10 + wave * 3.5;
      const batch = generateFairObstacleBatch(z, wave * 10, allObs, nextId, tuning, rng);
      nextId += batch.length;
      allObs = [...allObs.filter((o) => Math.abs(o.z - z) <= 6), ...batch];

      const windowObs = allObs.filter((o) => Math.abs(o.z - z) <= tuning.spawner.fairWindowZ);
      const gap = findWidestSafeGap(windowObs);
      expect(gap.width).toBeGreaterThanOrEqual(tuning.spawner.minSafeCorridorWidth);
    }
  });

  it('ignores horizontal_grate and puddle when measuring safe corridor width', () => {
    const gap = findWidestSafeGap([
      {
        id: 1,
        kind: 'horizontal_grate',
        worldX: 0,
        halfWidth: 0.9,
        z: 10,
        lengthZ: 0.8,
        triggered: false,
        nearMissAwarded: false,
      },
      {
        id: 2,
        kind: 'puddle',
        worldX: 0.4,
        halfWidth: 0.5,
        z: 10,
        lengthZ: 0.9,
        triggered: false,
        nearMissAwarded: false,
      },
    ]);
    expect(gap.width).toBeCloseTo(1.85, 3);
  });

  it('ignores obstacle collisions when obstacle is still far ahead of collisionZ', () => {
    const farObs: RoadObstacle = {
      id: 99,
      kind: 'vertical_grate',
      worldX: 0.1,
      halfWidth: 0.2,
      z: tuning.camera.collisionZ + 4.0,
      lengthZ: 0.85,
      triggered: false,
      nearMissAwarded: false,
    };
    const res = evaluateObstacleInteraction(0.1, farObs, tuning);
    expect(res.crashedGrate).toBe(false);
    expect(res.triggeredNearMiss).toBe(false);
  });

  it('initializes bike state inside corridor with minSpeedMps and zero crashes', () => {
    const init = createInitialBikeState(tuning);
    expect(init.crashed).toBe(false);
    expect(init.crashReason).toBe('none');
    expect(init.speedMps).toBe(tuning.bike.minSpeedMps);
    expect(init.x).toBeGreaterThan(-1);
    expect(init.x).toBeLessThan(1);
  });
});
