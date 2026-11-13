import { tuning, type Tuning } from '../config/tuning';
import { isCarBlockingLane, projectWorldToScreen, type RoadObstacle } from '../game/rules';
import type { DrainDodgerWorld } from '../game/world';

export interface RenderExtra {
  readonly screenMode: 'title' | 'playing' | 'result';
  readonly bestScore: number;
  readonly muted: boolean;
  readonly debug: boolean;
  readonly animTimeSec: number;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawQuad(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  x4: number,
  y4: number,
  fill: string,
): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.lineTo(x4, y4);
  ctx.closePath();
  ctx.fill();
}

function drawSkyAndHorizon(
  ctx: CanvasRenderingContext2D,
  t: Tuning,
  cameraX: number,
): void {
  const { width } = t.view;
  const { horizonY } = t.camera;

  const sky = ctx.createLinearGradient(0, 0, 0, horizonY);
  sky.addColorStop(0, '#38bdf8');
  sky.addColorStop(0.65, '#bae6fd');
  sky.addColorStop(1, '#e0f2fe');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, horizonY);

  // Subtle parallax city skyline
  const shift = -cameraX * 14;
  ctx.fillStyle = '#94a3b8';
  for (let i = -1; i < 8; i++) {
    const bx = i * 62 + shift;
    const bh = 24 + ((i * 37) % 34);
    ctx.fillRect(bx, horizonY - bh, 46, bh);
  }

  // Roadside tree line on right
  ctx.fillStyle = '#4ade80';
  for (let i = 0; i < 6; i++) {
    const tx = 240 + i * 36 + shift * 0.6;
    ctx.beginPath();
    ctx.arc(tx, horizonY - 12, 18 + (i % 2) * 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPseudo3DRoad(
  ctx: CanvasRenderingContext2D,
  world: DrainDodgerWorld,
  t: Tuning,
  cameraX: number,
): void {
  const { width, height } = t.view;
  const { horizonY, drawDistanceZ, stripeLengthZ } = t.camera;

  // Base fallback fill below horizon
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, horizonY, width, height - horizonY);

  const zStart = 0.52;
  const totalStripes = Math.ceil((drawDistanceZ - zStart) / stripeLengthZ);

  for (let i = totalStripes; i >= 0; i--) {
    const zNear = zStart + i * stripeLengthZ - world.scrollZ;
    const zFar = zNear + stripeLengthZ;
    if (zFar <= 0.45 || zNear >= drawDistanceZ) continue;

    const clampedNear = Math.max(0.45, zNear);
    const clampedFar = Math.min(drawDistanceZ, zFar);
    if (clampedFar <= clampedNear) continue;

    const stripeIndex = Math.floor((zNear + world.scrollZ) / stripeLengthZ);
    const alt = Math.abs(stripeIndex) % 2 === 0;

    // Project road edges at near & far Z
    const nMotorL = projectWorldToScreen(-2.35, clampedNear, cameraX, t);
    const fMotorL = projectWorldToScreen(-2.35, clampedFar, cameraX, t);

    const nLine = projectWorldToScreen(-1.0, clampedNear, cameraX, t);
    const fLine = projectWorldToScreen(-1.0, clampedFar, cameraX, t);

    const nCurbIn = projectWorldToScreen(1.0, clampedNear, cameraX, t);
    const fCurbIn = projectWorldToScreen(1.0, clampedFar, cameraX, t);

    const nCurbOut = projectWorldToScreen(1.16, clampedNear, cameraX, t);
    const fCurbOut = projectWorldToScreen(1.16, clampedFar, cameraX, t);

    const nWalkOut = projectWorldToScreen(2.8, clampedNear, cameraX, t);
    const fWalkOut = projectWorldToScreen(2.8, clampedFar, cameraX, t);

    // 1. Motor lane asphalt (left of white line)
    drawQuad(
      ctx,
      nMotorL.x,
      nMotorL.y,
      nLine.x,
      nLine.y,
      fLine.x,
      fLine.y,
      fMotorL.x,
      fMotorL.y,
      alt ? '#1e293b' : '#263348',
    );

    // 2. Bike safe corridor asphalt (-1.0 .. +1.0)
    drawQuad(
      ctx,
      nLine.x,
      nLine.y,
      nCurbIn.x,
      nCurbIn.y,
      fCurbIn.x,
      fCurbIn.y,
      fLine.x,
      fLine.y,
      alt ? '#334155' : '#3b495e',
    );

    // 3. White motor-lane divider line
    const nLineR = projectWorldToScreen(-0.94, clampedNear, cameraX, t);
    const fLineR = projectWorldToScreen(-0.94, clampedFar, cameraX, t);
    drawQuad(
      ctx,
      nLine.x,
      nLine.y,
      nLineR.x,
      nLineR.y,
      fLineR.x,
      fLineR.y,
      fLine.x,
      fLine.y,
      '#f8fafc',
    );

    // 4. Right raised concrete curb
    drawQuad(
      ctx,
      nCurbIn.x,
      nCurbIn.y,
      nCurbOut.x,
      nCurbOut.y,
      fCurbOut.x,
      fCurbOut.y,
      fCurbIn.x,
      fCurbIn.y,
      alt ? '#cbd5e1' : '#94a3b8',
    );

    // 5. Right sidewalk
    drawQuad(
      ctx,
      nCurbOut.x,
      nCurbOut.y,
      nWalkOut.x,
      nWalkOut.y,
      fWalkOut.x,
      fWalkOut.y,
      fCurbOut.x,
      fCurbOut.y,
      alt ? '#b45309' : '#92400e',
    );
  }
}

function drawObstacle(
  ctx: CanvasRenderingContext2D,
  obs: RoadObstacle,
  cameraX: number,
  t: Tuning,
): void {
  const zNear = Math.max(0.45, obs.z - obs.lengthZ * 0.5);
  const zFar = Math.min(t.camera.drawDistanceZ, obs.z + obs.lengthZ * 0.5);
  if (zFar <= zNear) return;

  const nL = projectWorldToScreen(obs.worldX - obs.halfWidth, zNear, cameraX, t);
  const nR = projectWorldToScreen(obs.worldX + obs.halfWidth, zNear, cameraX, t);
  const fL = projectWorldToScreen(obs.worldX - obs.halfWidth, zFar, cameraX, t);
  const fR = projectWorldToScreen(obs.worldX + obs.halfWidth, zFar, cameraX, t);

  if (obs.kind === 'puddle' || obs.kind === 'puddle_hidden_grate') {
    // Translucent water puddle ellipse
    const cx = (nL.x + nR.x + fL.x + fR.x) * 0.25;
    const cy = (nL.y + fL.y) * 0.5;
    const rx = Math.max(4, (nR.x - nL.x) * 0.52);
    const ry = Math.max(2, (nL.y - fL.y) * 0.55);

    ctx.fillStyle = 'rgba(56, 189, 248, 0.55)';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(224, 242, 254, 0.7)';
    ctx.lineWidth = Math.max(1, nL.scale * 1.4);
    ctx.stroke();

    // Hidden vertical grate revealed as rider approaches (z < 8.5)
    if (obs.kind === 'puddle_hidden_grate' && obs.z < 8.5) {
      const gh = obs.halfWidth * 0.55;
      const gnL = projectWorldToScreen(obs.worldX - gh, zNear, cameraX, t);
      const gnR = projectWorldToScreen(obs.worldX + gh, zNear, cameraX, t);
      const gfL = projectWorldToScreen(obs.worldX - gh, zFar, cameraX, t);
      const gfR = projectWorldToScreen(obs.worldX + gh, zFar, cameraX, t);

      drawQuad(ctx, gnL.x, gnL.y, gnR.x, gnR.y, gfR.x, gfR.y, gfL.x, gfL.y, '#334155');
      ctx.strokeStyle = '#020617';
      ctx.lineWidth = Math.max(1.5, gnL.scale * 2.5);
      for (let s = 0.2; s <= 0.8; s += 0.3) {
        const bx1 = gnL.x + (gnR.x - gnL.x) * s;
        const bx2 = gfL.x + (gfR.x - gfL.x) * s;
        ctx.beginPath();
        ctx.moveTo(bx1, gnL.y);
        ctx.lineTo(bx2, gfL.y);
        ctx.stroke();
      }
    }
    return;
  }

  if (obs.kind === 'vertical_grate') {
    // Outer metal frame + subtle danger rim
    drawQuad(ctx, nL.x, nL.y, nR.x, nR.y, fR.x, fR.y, fL.x, fL.y, '#64748b');

    // Deep pitch-black vertical slots (||||) parallel to wheel
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = Math.max(1.8, nL.scale * 3.4);
    for (let s = 0.16; s <= 0.84; s += 0.17) {
      const bx1 = nL.x + (nR.x - nL.x) * s;
      const bx2 = fL.x + (fR.x - fL.x) * s;
      ctx.beginPath();
      ctx.moveTo(bx1, nL.y);
      ctx.lineTo(bx2, fL.y);
      ctx.stroke();
    }

    // Metallic rim highlight
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = Math.max(1, nL.scale * 1.4);
    ctx.beginPath();
    ctx.moveTo(nL.x, nL.y);
    ctx.lineTo(nR.x, nR.y);
    ctx.lineTo(fR.x, fR.y);
    ctx.lineTo(fL.x, fL.y);
    ctx.closePath();
    ctx.stroke();
    return;
  }

  // horizontal_grate (SAFE to roll over)
  drawQuad(ctx, nL.x, nL.y, nR.x, nR.y, fR.x, fR.y, fL.x, fL.y, '#475569');
  ctx.strokeStyle = '#5eead4';
  ctx.lineWidth = Math.max(1.5, nL.scale * 2.4);
  for (let s = 0.2; s <= 0.82; s += 0.2) {
    const y = nL.y + (fL.y - nL.y) * s;
    const lx = nL.x + (fL.x - nL.x) * s;
    const rx = nR.x + (fR.x - nR.x) * s;
    ctx.beginPath();
    ctx.moveTo(lx, y);
    ctx.lineTo(rx, y);
    ctx.stroke();
  }
}

function drawOvertakeCar(
  ctx: CanvasRenderingContext2D,
  world: DrainDodgerWorld,
  cameraX: number,
  t: Tuning,
  animTimeSec: number,
): void {
  if (world.car.phase === 'HORN_WARN') {
    const flash = Math.sin(animTimeSec * 24) > 0;
    ctx.fillStyle = flash ? 'rgba(239, 68, 68, 0.28)' : 'rgba(239, 68, 68, 0.1)';
    ctx.fillRect(0, t.camera.horizonY, 74, t.view.height - t.camera.horizonY);

    ctx.fillStyle = '#ef4444';
    roundRect(ctx, 12, 310, 108, 36, 10);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🚗 滴滴! 来车', 66, 328);
    return;
  }

  if (world.car.phase === 'PASSING') {
    // Highlight left motor-lane no-cross band strictly while car is in close-range danger Z window
    if (isCarBlockingLane(world.car.phase, world.car.z, t)) {
      const dNearL = projectWorldToScreen(-2.35, 0.55, cameraX, t);
      const dNearR = projectWorldToScreen(t.car.carRightEdgeX, 0.55, cameraX, t);
      const dFarL = projectWorldToScreen(-2.35, t.car.dangerMaxZ, cameraX, t);
      const dFarR = projectWorldToScreen(t.car.carRightEdgeX, t.car.dangerMaxZ, cameraX, t);
      drawQuad(
        ctx,
        dNearL.x,
        dNearL.y,
        dNearR.x,
        dNearR.y,
        dFarR.x,
        dFarR.y,
        dFarL.x,
        dFarL.y,
        'rgba(239, 68, 68, 0.24)',
      );
    }

    const zNear = Math.max(0.45, world.car.z);
    const pL = projectWorldToScreen(-2.05, zNear, cameraX, t);
    const pR = projectWorldToScreen(t.car.carRightEdgeX, zNear, cameraX, t);
    const carW = Math.max(26, pR.x - pL.x);
    const carH = carW * 0.72;

    // Car shadow
    ctx.fillStyle = 'rgba(2, 6, 23, 0.5)';
    ctx.fillRect(pL.x - 4, pR.y - 6, carW + 8, 10);

    // Car body
    ctx.fillStyle = '#dc2626';
    roundRect(ctx, pL.x, pR.y - carH, carW, carH, Math.max(4, pR.scale * 8));
    ctx.fill();

    // Rear windshield & taillights
    ctx.fillStyle = '#1e293b';
    roundRect(
      ctx,
      pL.x + carW * 0.14,
      pR.y - carH * 0.88,
      carW * 0.72,
      carH * 0.36,
      Math.max(2, pR.scale * 4),
    );
    ctx.fill();

    ctx.fillStyle = '#fde047';
    ctx.fillRect(pL.x + carW * 0.08, pR.y - carH * 0.42, carW * 0.18, carH * 0.14);
    ctx.fillRect(pL.x + carW * 0.74, pR.y - carH * 0.42, carW * 0.18, carH * 0.14);
  }
}

function drawCockpitAndShadow(
  ctx: CanvasRenderingContext2D,
  world: DrainDodgerWorld,
  t: Tuning,
  cameraX: number,
): void {
  const { height } = t.view;
  const wheelContact = projectWorldToScreen(world.bike.x, t.camera.collisionZ, cameraX, t);
  const wheelX = wheelContact.x;
  const wheelY = wheelContact.y + world.bumpOffsetY * 0.45;
  const lean = world.bike.leanRad;

  // 1. Dynamic cast shadow of cyclist on left asphalt
  ctx.save();
  ctx.fillStyle = 'rgba(2, 6, 23, 0.34)';
  ctx.beginPath();
  ctx.ellipse(
    wheelX - 42 - Math.sin(lean) * 18,
    wheelY + 26,
    24,
    56,
    -0.55 + lean * 0.6,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.restore();

  // 2. Front tire ground contact shadow & narrow road tire (25c)
  ctx.save();
  ctx.translate(wheelX, wheelY);
  ctx.rotate(lean * 0.55);

  ctx.fillStyle = 'rgba(2, 6, 23, 0.55)';
  ctx.beginPath();
  ctx.ellipse(0, 2, 10, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Narrow front tire protruding toward collisionZ
  ctx.fillStyle = '#0f172a';
  roundRect(ctx, -4.5, 0, 9, 86, 4);
  ctx.fill();
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Carbon fork & stem
  ctx.fillStyle = '#334155';
  roundRect(ctx, -6, 62, 12, 58, 4);
  ctx.fill();
  ctx.restore();

  // 3. First-person drop handlebars cockpit (bottom y = 515..640)
  ctx.save();
  const barPivotX = wheelX;
  const barPivotY = height - 48 + world.bumpOffsetY;
  ctx.translate(barPivotX, barPivotY);
  ctx.rotate(lean);

  // Main handlebar top bar + curved drops
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 18;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-112, 24);
  ctx.quadraticCurveTo(-116, -24, -78, -28);
  ctx.lineTo(78, -28);
  ctx.quadraticCurveTo(116, -24, 112, 24);
  ctx.stroke();

  // Bar tape highlight texture
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 10;
  ctx.setLineDash([6, 5]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Left & Right STI brake hoods
  for (const side of [-1, 1] as const) {
    ctx.fillStyle = '#0f172a';
    roundRect(ctx, side * 82 - 11, -50, 22, 30, 7);
    ctx.fill();
    ctx.fillStyle = '#94a3b8';
    roundRect(ctx, side * 82 - 4, -22, 8, 26, 3);
    ctx.fill();
  }

  // Stem & bike computer mount
  ctx.fillStyle = '#475569';
  roundRect(ctx, -10, -40, 20, 42, 6);
  ctx.fill();
  ctx.fillStyle = '#020617';
  roundRect(ctx, -14, -52, 28, 18, 4);
  ctx.fill();
  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`${Math.round(world.bike.speedMps * 3.6)}`, 0, -40);

  // Down tube & bottle cage corner peeking at bottom
  ctx.fillStyle = '#0ea5e9';
  roundRect(ctx, -16, 4, 32, 64, 8);
  ctx.fill();

  ctx.restore();
}

function drawParticlesAndFloats(ctx: CanvasRenderingContext2D, world: DrainDodgerWorld): void {
  for (const p of world.particles) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  for (const f of world.floats) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, f.life / f.maxLife);
    ctx.font = '900 17px sans-serif';
    ctx.textAlign = 'center';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 4;
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
    ctx.restore();
  }
}

function drawHud(
  ctx: CanvasRenderingContext2D,
  world: DrainDodgerWorld,
  extra: RenderExtra,
  t: Tuning,
): void {
  const { width } = t.view;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
  roundRect(ctx, 14, 14, width - 28, 48, 14);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = '800 17px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${Math.floor(world.bike.distanceM)}m`, 28, 38);

  const kmh = Math.round(world.bike.speedMps * 3.6);
  ctx.fillStyle = '#38bdf8';
  ctx.font = '700 14px sans-serif';
  ctx.fillText(`${kmh} km/h`, 96, 38);

  ctx.fillStyle = '#fde047';
  ctx.font = '800 17px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.floor(world.bike.score)}分`, width - 64, 38);

  if (world.bike.puddleSlowSec > 0) {
    ctx.fillStyle = 'rgba(56, 189, 248, 0.9)';
    roundRect(ctx, width / 2 - 48, 68, 96, 22, 11);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.font = '800 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('水洼转向变钝', width / 2, 79);
  }

  // Mute button
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.beginPath();
  ctx.arc(width - 36, 38, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '14px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(extra.muted ? '🔇' : '🔊', width - 36, 39);
}

function drawTitleOverlay(ctx: CanvasRenderingContext2D, bestScore: number, t: Tuning): void {
  const { width, height } = t.view;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.58)';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#ffffff';
  roundRect(ctx, 26, 112, width - 52, 394, 22);
  ctx.fill();

  ctx.fillStyle = '#0f172a';
  ctx.font = '900 25px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('公路车躲下水道', width / 2, 158);

  ctx.fillStyle = '#475569';
  ctx.font = '600 13px sans-serif';
  ctx.fillText('按住左/右半屏连续压弯（键盘 A/D 或 ←/→）', width / 2, 188);

  const legend = [
    ['||||  竖缝铁箅子（必躲）', '细胎卡进去直接翻车！', '#fee2e2', '#dc2626'],
    ['====  横纹格栅（可碾压）', '安全通过 +10！关键时刻是生路', '#ccfbf1', '#0f766e'],
    ['🚗 左方来车 & 右侧路肩', '闻笛别压白线，擦边竖缝 +30 好险', '#fef3c7', '#b45309'],
  ] as const;

  legend.forEach(([title, desc, bg, accent], idx) => {
    const ly = 232 + idx * 58;
    ctx.fillStyle = bg;
    roundRect(ctx, 44, ly - 16, width - 88, 48, 12);
    ctx.fill();
    ctx.fillStyle = accent;
    ctx.font = '800 13px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(title, 58, tyOffset(ly));
    ctx.fillStyle = '#334155';
    ctx.font = '500 11.5px sans-serif';
    ctx.fillText(desc, 58, ly + 18);
  });

  if (bestScore > 0) {
    ctx.fillStyle = '#d97706';
    ctx.font = '700 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`历史最高分：${Math.floor(bestScore)} 分`, width / 2, 404);
  }

  // Start button: x 64..326, y 424..476
  ctx.fillStyle = '#0ea5e9';
  roundRect(ctx, 64, 424, width - 128, 52, 16);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 18px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('上车开骑！', width / 2, 456);
}

function tyOffset(y: number): number {
  return y;
}

function drawResultOverlay(
  ctx: CanvasRenderingContext2D,
  world: DrainDodgerWorld,
  bestScore: number,
  t: Tuning,
): void {
  const { width, height } = t.view;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.66)';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#ffffff';
  roundRect(ctx, 28, 124, width - 56, 396, 22);
  ctx.fill();

  const reasonText =
    world.bike.crashReason === 'vertical_grate'
      ? '前轮卡进竖缝下水道！'
      : world.bike.crashReason === 'curb'
        ? '擦撞右侧路缘石翻车！'
        : '越过白线蹭到超车车辆！';

  ctx.fillStyle = '#dc2626';
  ctx.font = '900 22px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(reasonText, width / 2, 168);

  ctx.fillStyle = '#0f172a';
  ctx.font = '900 34px sans-serif';
  ctx.fillText(`${Math.floor(world.bike.score)} 分`, width / 2, 218);

  const rows = [
    ['骑行总里程', `${Math.floor(world.bike.distanceM)} 米`],
    ['擦肩而过 (+30)', `${world.bike.nearMissCount} 次`],
    ['稳健碾压横盖 (+10)', `${world.bike.horizontalPassCount} 次`],
    ['本机最高纪录', `${Math.floor(Math.max(bestScore, world.bike.score))} 分`],
  ];
  rows.forEach(([label, val], idx) => {
    const ry = 270 + idx * 38;
    ctx.fillStyle = '#f8fafc';
    roundRect(ctx, 50, ry - 18, width - 100, 30, 8);
    ctx.fill();
    ctx.fillStyle = '#475569';
    ctx.font = '600 13px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(label, 62, ry);
    ctx.fillStyle = '#0f172a';
    ctx.font = '800 14px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(val, width - 62, ry);
  });

  // Restart button: x 64..326, y 446..498
  ctx.fillStyle = '#10b981';
  roundRect(ctx, 64, 446, width - 128, 52, 16);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 17px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('再来一趟 (R)', width / 2, 478);
}

function drawDebugOverlay(
  ctx: CanvasRenderingContext2D,
  world: DrainDodgerWorld,
  cameraX: number,
  t: Tuning,
): void {
  const cz = t.camera.collisionZ;
  const lineL = projectWorldToScreen(-1.0, cz, cameraX, t);
  const lineR = projectWorldToScreen(1.0, cz, cameraX, t);

  // Collision Z line
  ctx.strokeStyle = '#22d3ee';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(lineL.x, lineL.y);
  ctx.lineTo(lineR.x, lineR.y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Effective tire collision half-width bracket
  const effHalf = t.bike.tireHalfWidth * t.bike.hitboxForgiveness;
  const tL = projectWorldToScreen(world.bike.x - effHalf, cz, cameraX, t);
  const tR = projectWorldToScreen(world.bike.x + effHalf, cz, cameraX, t);
  ctx.fillStyle = 'rgba(34, 211, 238, 0.35)';
  ctx.fillRect(tL.x, tL.y - 8, Math.max(4, tR.x - tL.x), 16);

  // Safe corridor highlight
  const gL = projectWorldToScreen(world.safeGapCenter - world.safeGapWidth * 0.5, cz, cameraX, t);
  const gR = projectWorldToScreen(world.safeGapCenter + world.safeGapWidth * 0.5, cz, cameraX, t);
  ctx.strokeStyle = '#34d399';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(gL.x, gL.y - 12, Math.max(4, gR.x - gL.x), 24);

  // Obstacle bounding boxes & Near Miss outer margins
  for (const obs of world.obstacles) {
    if (obs.z > 10 || obs.z < 0.5) continue;
    const hw = obs.kind === 'puddle_hidden_grate' ? obs.halfWidth * 0.55 : obs.halfWidth;
    const oL = projectWorldToScreen(obs.worldX - hw, obs.z, cameraX, t);
    const oR = projectWorldToScreen(obs.worldX + hw, obs.z, cameraX, t);
    ctx.strokeStyle =
      obs.kind === 'vertical_grate' || obs.kind === 'puddle_hidden_grate'
        ? '#f43f5e'
        : '#2dd4bf';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(oL.x, oL.y - 6, Math.max(4, oR.x - oL.x), 12);

    if (obs.kind === 'vertical_grate') {
      const nmL = projectWorldToScreen(obs.worldX - hw - t.bike.nearMissMargin, obs.z, cameraX, t);
      const nmR = projectWorldToScreen(obs.worldX + hw + t.bike.nearMissMargin, obs.z, cameraX, t);
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.6)';
      ctx.strokeRect(nmL.x, nmL.y - 8, Math.max(4, nmR.x - nmL.x), 16);
    }
  }

  ctx.fillStyle = 'rgba(2, 6, 23, 0.8)';
  ctx.fillRect(10, 70, 238, 44);
  ctx.fillStyle = '#22d3ee';
  ctx.font = '11px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`bikeX=${world.bike.x.toFixed(2)} safeGap=${world.safeGapWidth.toFixed(2)}`, 16, 86);
  ctx.fillText(`car=${world.car.phase} obs=${world.obstacles.length}`, 16, 102);
}

export function drawGameFrame(
  ctx: CanvasRenderingContext2D,
  world: DrainDodgerWorld,
  extra: RenderExtra,
  t: Tuning = tuning,
): void {
  const cameraX = world.bike.x * t.camera.cameraFollowRatio;
  const shakeX = world.shakeMag > 0.2 ? (Math.random() - 0.5) * world.shakeMag * 2 : 0;
  const shakeY = world.shakeMag > 0.2 ? (Math.random() - 0.5) * world.shakeMag * 2 : 0;

  ctx.save();
  ctx.translate(shakeX, shakeY);

  drawSkyAndHorizon(ctx, t, cameraX);
  drawPseudo3DRoad(ctx, world, t, cameraX);

  // Sort obstacles back-to-front by z
  const sorted = [...world.obstacles].sort((a, b) => b.z - a.z);
  for (const obs of sorted) {
    drawObstacle(ctx, obs, cameraX, t);
  }

  drawOvertakeCar(ctx, world, cameraX, t, extra.animTimeSec);
  drawCockpitAndShadow(ctx, world, t, cameraX);
  drawParticlesAndFloats(ctx, world);
  ctx.restore();

  drawHud(ctx, world, extra, t);

  if (extra.debug) {
    drawDebugOverlay(ctx, world, cameraX, t);
  }

  if (extra.screenMode === 'title') {
    drawTitleOverlay(ctx, extra.bestScore, t);
  } else if (extra.screenMode === 'result') {
    drawResultOverlay(ctx, world, extra.bestScore, t);
  }
}
