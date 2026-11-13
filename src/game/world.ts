import { tuning, type Tuning } from '../config/tuning';
import {
  computeCurrentSpeedMps,
  createInitialBikeState,
  evaluateObstacleInteraction,
  findWidestSafeGap,
  generateFairObstacleBatch,
  isCarBlockingLane,
  stepBikeLateral,
  type BikeState,
  type RoadObstacle,
} from './rules';

export type CarPhase = 'IDLE' | 'HORN_WARN' | 'PASSING';

export interface OvertakeCarState {
  phase: CarPhase;
  timerSec: number;
  z: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: string;
  life: number;
  maxLife: number;
}

export interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

export interface WorldStepEvents {
  readonly hitHorizontalGrate: boolean;
  readonly hitPuddle: boolean;
  readonly triggeredNearMiss: boolean;
  readonly enteredCarWarn: boolean;
  readonly enteredCarPass: boolean;
  readonly justCrashed: boolean;
}

export class DrainDodgerWorld {
  readonly t: Tuning;
  bike: BikeState;
  obstacles: RoadObstacle[] = [];
  car: OvertakeCarState;
  scrollZ = 0;
  bumpOffsetY = 0;
  bumpAnimSec = 0;
  shakeMag = 0;
  particles: Particle[] = [];
  floats: FloatingText[] = [];
  safeGapCenter = 0;
  safeGapWidth = 1.85;

  private nextObstacleId = 1;
  private nextSpawnZ = 10;

  constructor(t: Tuning = tuning) {
    this.t = t;
    this.bike = createInitialBikeState(t);
    this.car = {
      phase: 'IDLE',
      timerSec: 4.5,
      z: 0,
    };

    // Pre-populate initial road ahead
    for (let z = 9; z < t.camera.drawDistanceZ; z += 4.6) {
      const batch = generateFairObstacleBatch(z, 0, this.obstacles, this.nextObstacleId, t);
      this.nextObstacleId += batch.length;
      this.obstacles.push(...batch);
      this.nextSpawnZ = z + 4.4;
    }
  }

  private spawnSplash(x: number, y: number, color: string, count: number): void {
    for (let i = 0; i < count; i++) {
      const ang = -Math.PI + Math.random() * Math.PI;
      const spd = 65 + Math.random() * 145;
      this.particles.push({
        x: x + (Math.random() - 0.5) * 20,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 35,
        r: 2 + Math.random() * 2.5,
        color,
        life: 0.45 + Math.random() * 0.2,
        maxLife: 0.65,
      });
    }
  }

  private addFloat(x: number, y: number, text: string, color: string): void {
    this.floats.push({
      x: Math.max(66, Math.min(this.t.view.width - 66, x)),
      y,
      text,
      color,
      life: 1.0,
      maxLife: 1.0,
    });
  }

  step(steerDir: -1 | 0 | 1, dtMs: number): WorldStepEvents {
    const dtSec = Math.min(this.t.loop.maxFrameDtMs, Math.max(0, dtMs)) / 1000;

    // Always animate particles & floats even on crash freeze
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dtSec;
      p.vy += 380 * dtSec;
      p.x += p.vx * dtSec;
      p.y += p.vy * dtSec;
      if (p.life <= 0) this.particles.splice(i, 1);
    }

    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.life -= dtSec;
      f.y -= 36 * dtSec;
      if (f.life <= 0) this.floats.splice(i, 1);
    }

    this.shakeMag = Math.max(0, this.shakeMag - 26 * dtSec);

    if (this.bumpAnimSec > 0) {
      this.bumpAnimSec = Math.max(0, this.bumpAnimSec - dtSec);
      // Double-bump "咯噔-咯噔" profile
      this.bumpOffsetY = Math.sin(this.bumpAnimSec * Math.PI * 14) * 5.5;
    } else {
      this.bumpOffsetY = 0;
    }

    if (this.bike.crashed) {
      return {
        hitHorizontalGrate: false,
        hitPuddle: false,
        triggeredNearMiss: false,
        enteredCarWarn: false,
        enteredCarPass: false,
        justCrashed: false,
      };
    }

    // Advance overtaking car state machine
    let enteredCarWarn = false;
    let enteredCarPass = false;
    this.car.timerSec -= dtSec;
    if (this.car.phase === 'IDLE' && this.car.timerSec <= 0) {
      this.car.phase = 'HORN_WARN';
      this.car.timerSec = this.t.car.warnSec;
      enteredCarWarn = true;
    } else if (this.car.phase === 'HORN_WARN' && this.car.timerSec <= 0) {
      this.car.phase = 'PASSING';
      this.car.timerSec = this.t.car.passSec;
      this.car.z = 0.65;
      enteredCarPass = true;
    } else if (this.car.phase === 'PASSING') {
      this.car.z += 11.5 * dtSec;
      if (this.car.timerSec <= 0) {
        this.car.phase = 'IDLE';
        const ramp = Math.min(1, this.bike.distanceM / 450);
        const minCd = this.t.car.cooldownMinSec;
        const maxCd = this.t.car.cooldownMaxSec - ramp * 2.6;
        this.car.timerSec = minCd + Math.random() * Math.max(0.5, maxCd - minCd);
      }
    }

    // Step forward speed & distance
    const speedMps = computeCurrentSpeedMps(this.bike.distanceM, this.t);
    const deltaM = speedMps * dtSec;
    const deltaZ = deltaM / this.t.scoring.metersPerZ;
    this.scrollZ = (this.scrollZ + deltaZ) % (this.t.camera.stripeLengthZ * 2);

    this.bike = {
      ...this.bike,
      speedMps,
      distanceM: this.bike.distanceM + deltaM,
      score: this.bike.score + deltaM,
    };

    // Lateral steering & curb/car check (only while red car is actually beside/near rider)
    this.bike = stepBikeLateral(
      this.bike,
      steerDir,
      dtSec,
      isCarBlockingLane(this.car.phase, this.car.z, this.t),
      this.t,
    );

    if (this.bike.crashed) {
      this.shakeMag = 11;
      this.spawnSplash(this.t.view.width * 0.5, 495, '#f97316', 16);
      return {
        hitHorizontalGrate: false,
        hitPuddle: false,
        triggeredNearMiss: false,
        enteredCarWarn,
        enteredCarPass,
        justCrashed: true,
      };
    }

    // Move obstacles toward camera & evaluate collisions
    let hitHorizontalGrate = false;
    let hitPuddle = false;
    let triggeredNearMiss = false;
    let justCrashed = false;

    const updated: RoadObstacle[] = [];
    for (const raw of this.obstacles) {
      let obs: RoadObstacle = { ...raw, z: raw.z - deltaZ };
      if (obs.z + obs.lengthZ < 0.35) continue;

      const hit = evaluateObstacleInteraction(this.bike.x, obs, this.t);
      obs = hit.obstacle;

      if (hit.crashedGrate) {
        this.bike = {
          ...this.bike,
          crashed: true,
          crashReason: 'vertical_grate',
        };
        this.shakeMag = 12;
        this.spawnSplash(this.t.view.width * 0.5, 500, '#ef4444', 18);
        justCrashed = true;
      } else if (hit.hitHorizontalGrate) {
        hitHorizontalGrate = true;
        this.bumpAnimSec = 0.28;
        this.shakeMag = Math.max(this.shakeMag, 3.5);
        this.bike = {
          ...this.bike,
          horizontalPassCount: this.bike.horizontalPassCount + 1,
          score: this.bike.score + this.t.scoring.horizontalGrateBonus,
        };
        this.addFloat(
          this.t.view.width * 0.5,
          455,
          `稳健碾压 +${this.t.scoring.horizontalGrateBonus}`,
          '#34d399',
        );
      } else if (hit.hitPuddle) {
        hitPuddle = true;
        this.bike = {
          ...this.bike,
          puddleSlowSec: this.t.bike.puddleDurationSec,
        };
        this.spawnSplash(this.t.view.width * 0.5, 502, '#7dd3fc', 12);
        this.addFloat(this.t.view.width * 0.5, 468, '水洼打滑!', '#38bdf8');
      }

      if (hit.triggeredNearMiss) {
        triggeredNearMiss = true;
        this.bike = {
          ...this.bike,
          nearMissCount: this.bike.nearMissCount + 1,
          score: this.bike.score + this.t.scoring.nearMissBonus,
        };
        this.addFloat(
          this.t.view.width * 0.5,
          432,
          `好险！+${this.t.scoring.nearMissBonus}`,
          '#fde047',
        );
      }

      updated.push(obs);
    }

    this.obstacles = updated;

    // Spawn new fair obstacle waves ahead
    this.nextSpawnZ -= deltaZ;
    while (this.nextSpawnZ < this.t.camera.drawDistanceZ) {
      const batch = generateFairObstacleBatch(
        this.nextSpawnZ,
        this.bike.distanceM,
        this.obstacles,
        this.nextObstacleId,
        this.t,
      );
      this.nextObstacleId += batch.length;
      this.obstacles.push(...batch);
      const gap =
        this.t.spawner.minGapZ +
        Math.random() * (this.t.spawner.maxGapZ - this.t.spawner.minGapZ);
      this.nextSpawnZ += gap;
    }

    // Track current safe gap near collisionZ for ?debug=1 overlay
    const nearWindow = this.obstacles.filter(
      (o) => Math.abs(o.z - this.t.camera.collisionZ) <= this.t.spawner.fairWindowZ,
    );
    const safeGap = findWidestSafeGap(nearWindow);
    this.safeGapCenter = safeGap.centerX;
    this.safeGapWidth = safeGap.width;

    return {
      hitHorizontalGrate,
      hitPuddle,
      triggeredNearMiss,
      enteredCarWarn,
      enteredCarPass,
      justCrashed,
    };
  }
}
