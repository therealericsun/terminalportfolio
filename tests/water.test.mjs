import test from 'node:test';
import assert from 'node:assert/strict';
import { Terrain } from '../terrain.js';
import { Water, PHYSICS_DT, DRY_DEPTH, stepBoat, constrainBoat, placeBoat, incomingWave, MOUSE_WAVE } from '../water.js';
const sum = a => a.reduce((v, n) => v + n, 0);
const boatAt = (x, y) => ({ x, y, vx: 0, vy: 0, facing: 1, tilt: 0, tiltVelocity: 0, heave: 0, heaveVelocity: 0 });
function beach(width = 780, height = 180, extra = {}) {
  const terrain = new Terrain(width, height, { shore: 300, jagged: false });
  return new Water(Math.ceil((width - 180) / 12), Math.ceil(height / 12), 12, { terrain, originX: 180, ...extra });
}

test('lake at rest stays balanced over a slope and at the wet/dry interface', () => {
  const water = beach(), before = water.depth.slice();
  for (let n = 0; n < 600; n++) water.step();
  assert.ok(water.depth.every((h, i) => Math.abs(h - before[i]) < 1e-10));
  assert.ok(water.flowX.every(u => Math.abs(u) < 1e-10));
  assert.ok(water.flowY.every(u => Math.abs(u) < 1e-10));
});

test('shared HLL flux conserves closed-domain volume, including sloping wet/dry terrain', () => {
  const water = beach(); water.splash(340, 90, 6, 35, -20, 8);
  const volume = sum(water.depth);
  for (let n = 0; n < 1200; n++) water.step();
  assert.ok(Math.abs(sum(water.depth) - volume) < volume * 1e-11);
  assert.ok(water.depth.every(h => Number.isFinite(h) && h >= 0));
});

test('incoming waves wet beach cells and those cells dry again between crests', () => {
  const water = beach(780, 180, { boundaries: 'open' });
  const flooded = new Set(), drained = new Set(); let maxRunup = 0, maxFoam = 0;
  for (let n = 0; n < 2400; n++) {
    water.step();
    for (let i = 0; i < water.depth.length; i++) {
      assert.ok(Number.isFinite(water.depth[i]) && water.depth[i] >= 0);
      maxFoam = Math.max(maxFoam, water.foam[i]);
      if (water.bed[i] <= 0) continue;
      if (water.depth[i] > .12) { flooded.add(i); maxRunup = Math.max(maxRunup, -water.terrain.distance(water.originX + (i % water.cols + .5) * 12, (Math.floor(i / water.cols) + .5) * 12)); }
      if (flooded.has(i) && water.depth[i] < DRY_DEPTH) drained.add(i);
    }
  }
  assert.ok(flooded.size > 10); assert.ok(drained.size > 0, 'run-up must subsequently drain to a dry state');
  assert.ok(maxRunup > 24); assert.ok(maxFoam > .3);
});

test('waves enter exclusively from the right and travel toward the beach', () => {
  const water = beach(960, 180, { boundaries: 'open' });
  let rightArrival = null, leftArrival = null, entering = false;
  for (let n = 0; n < 600; n++) {
    water.step();
    const right = water.sample(water.height, 900, 90), left = water.sample(water.height, 600, 90);
    if (rightArrival === null && right > .18) rightArrival = water.time;
    if (leftArrival === null && left > .18) leftArrival = water.time;
    if (right > .4 && water.velocity(900, 90)[0] < -2) entering = true;
  }
  assert.ok(rightArrival !== null && leftArrival > rightArrival + 1);
  assert.ok(entering);
  assert.notEqual(incomingWave(20, 40), incomingWave(22.35, 40), 'crests must vary between nominal cycles');
});

test('terrain uses the text envelope with a quiet margin rather than a fixed split', () => {
  const terrain = new Terrain(1440, 1000, { profile: [{ top: 80, bottom: 300, right: 740 }, { top: 500, bottom: 660, right: 480 }] });
  assert.ok(terrain.coastline(150) > 840);
  assert.ok(terrain.coastline(800) < terrain.coastline(150) - 100);
  assert.equal(terrain.region(200, 150), 'land');
});

test('mouse splashes conserve volume, stay in water, and supply a fading color tracer', () => {
  const water = beach(); const volume = sum(water.depth), before = water.depth.slice();
  water.splash(200, 90); assert.deepEqual(water.depth, before);
  water.splash(480, 90, 3, 30, 20, -5);
  assert.ok(Math.abs(sum(water.depth) - volume) < 1e-8);
  assert.ok(water.disturbance.some(v => v > .5));
  for (let n = 0; n < 600; n++) water.step();
  assert.ok(water.disturbance.every(v => v < .01));
});

test('a water disturbance actually accelerates and displaces a floating boat', () => {
  const water = beach(), quiet = beach(), boat = boatAt(550, 80), control = boatAt(550, 80);
  water.splash(530, 100, 3, 30, 35, 0);
  for (let n = 0; n < 180; n++) { water.step(); quiet.step(); stepBoat(boat, water, PHYSICS_DT); stepBoat(control, quiet, PHYSICS_DT); }
  assert.ok(Math.hypot(boat.x - control.x, boat.y - control.y) > 2);
  assert.ok(Math.abs(boat.heave) + Math.abs(boat.heaveVelocity) > .001);
});

test('hull clearance prevents grounding, including a shoreward impulse', () => {
  const water = beach(), boat = boatAt(298, 70); boat.vx = -100;
  constrainBoat(boat, water);
  for (let n = 0; n < 600; n++) { water.step(); stepBoat(boat, water, PHYSICS_DT);
    for (const dx of [-26, 0, 26]) assert.ok(water.terrain.bed(boat.x + dx * Math.cos(boat.tilt), boat.y + 12 + dx * Math.sin(boat.tilt)) <= -6.99);
  }
});

test('surf starts with waves and previously wet sand already present', () => {
  const water = beach(780, 180, { boundaries: 'open' }); water.initializeSurf();
  assert.ok(water.height.some((eta, i) => water.bed[i] < -10 && Math.abs(eta) > .5));
  assert.ok(water.depth.some((h, i) => water.terrain.distance(water.originX + (i % water.cols + .5) * 12, (Math.floor(i / water.cols) + .5) * 12) < 0 && h > .12));
  assert.ok(water.wetSand.some(v => v > .5));
});

test('two minutes of coupled surf, vortex, hull loading and pointer impulses stays stable', () => {
  const terrain = new Terrain(1200, 540, { shore: 560 });
  const water = new Water(65, 45, 12, { terrain, originX: 420, boundaries: 'open' });
  water.initializeSurf(); const start = water.time;
  const vortex = { x: 965, y: 315, core: 100, reach: 230, strength: 1 };
  const boat = boatAt(1000, 180); let movement = 0, maxSpeed = 0;
  for (let n = 0; n < 7200; n++) {
    if (n % 480 === 0) water.splash(boat.x - 35, boat.y + 12, MOUSE_WAVE.maxAmplitude, MOUSE_WAVE.radius, -6*MOUSE_WAVE.momentum, 3*MOUSE_WAVE.momentum);
    water.step(PHYSICS_DT, vortex); stepBoat(boat, water, PHYSICS_DT);
    if (n % 60 === 0) {
      assert.ok(water.depth.every(h => Number.isFinite(h) && h >= 0 && h < 35));
      assert.ok(Object.values(boat).every(Number.isFinite));
      assert.ok(water.terrain.hullSafe(boat.x, boat.y, 6.9));
      movement = Math.max(movement, Math.hypot(boat.x - 1000, boat.y - 180)); maxSpeed = Math.max(maxSpeed, Math.hypot(boat.vx, boat.vy));
    }
  }
  assert.ok(movement > 10); assert.ok(maxSpeed < 220); assert.ok(Math.abs(water.time - start - 120) < 1e-6);
});


test('boat follows the rotating water current in the expected direction', () => {
  const water = new Water(70, 50, 12), vortex = { x: 420, y: 300, core: 90, reach: 220, strength: 1 };
  for (let n = 0; n < 480; n++) water.step(PHYSICS_DT, vortex);
  const boat = boatAt(420, 175); [boat.vx, boat.vy] = water.velocity(boat.x, boat.y + 12);
  let minRadius = Infinity, maxRadius = 0;
  const quadrants = new Set();
  for (let n = 0; n < 1200; n++) {
    water.step(PHYSICS_DT, vortex); stepBoat(boat, water, PHYSICS_DT);
    if (n % 30 === 0 && n > 60) {
      const [u,v] = water.velocity(boat.x, boat.y + 12), speed = Math.hypot(u,v);
      const alignment = (u * boat.vx + v * boat.vy) / (speed * Math.hypot(boat.vx, boat.vy));
      assert.ok(alignment > .97, `hull must follow current direction: ${alignment}`);
      assert.ok(Math.hypot(u - boat.vx, v - boat.vy) < 6);
      const radius = Math.hypot(boat.x - vortex.x, boat.y + 12 - vortex.y);
      minRadius = Math.min(minRadius, radius); maxRadius = Math.max(maxRadius, radius);
      quadrants.add(`${boat.x >= vortex.x},${boat.y + 12 >= vortex.y}`);
    }
  }
  assert.equal(quadrants.size,4); assert.ok(maxRadius - minRadius < 18, 'circulation must not throw the hull outward');
});

test('resting boat remains still at arbitrary grid offsets', () => {
  const water = new Water(60,30,12), boat = boatAt(362.7,177.3), start = [boat.x,boat.y];
  for(let n=0;n<600;n++){water.step();stepBoat(boat,water,PHYSICS_DT);}
  assert.ok(Math.hypot(boat.x-start[0],boat.y-start[1]) < 1);
  assert.ok(Math.hypot(boat.vx,boat.vy) < .1);
});


test('viewport edges reflect the boat inward instead of stopping it at the bottom', () => {
  const water = beach(), bounds = { minX: 32, maxX: 748, minY: 36, maxY: 120 };
  for (const [x,y,vx,vy,axis,sign] of [[750,80,40,0,'vx',-1],[550,122,0,40,'vy',-1],[550,34,0,-40,'vy',1]]) {
    const boat=boatAt(x,y);boat.vx=vx;boat.vy=vy;constrainBoat(boat,water,bounds);
    assert.ok(boat[axis]*sign>15);assert.ok(boat.y>=36&&boat.y<=120);assert.ok(boat.x<=748);
  }
  const boat=boatAt(550,121);boat.vy=40;constrainBoat(boat,water,bounds);
  for(let n=0;n<24;n++){water.step();stepBoat(boat,water,PHYSICS_DT,bounds);}
  assert.ok(boat.y<115,'bounce must move the hull clear of the boundary');
});

test('shore contact bounces seaward and keeps the complete hull afloat', () => {
  const water=beach(),boat=boatAt(348,80);boat.vx=-45;constrainBoat(boat,water);
  assert.ok(boat.vx>20);assert.ok(water.terrain.hullSafe(boat.x,boat.y,6.9));
});

test('boat dragging accepts deep ocean positions and rejects sand and shallow hull positions', () => {
  const water=beach(),boat=boatAt(550,80);
  assert.equal(placeBoat(boat,water,480,95),true);assert.equal(boat.x,480);assert.equal(boat.vx,0);
  for(const [x,y] of [[260,95],[310,95],[330,95],[480,3],[900,95]]) {
    assert.equal(placeBoat(boat,water,x,y),false);assert.equal(boat.x,480);assert.equal(boat.y,95);
  }
});

test('the boat loses excess momentum quickly and follows a reversing current', () => {
  const water=beach(),boat=boatAt(550,80);boat.vx=60;
  for(let n=0;n<18;n++){water.step();stepBoat(boat,water,PHYSICS_DT);}
  assert.ok(Math.abs(boat.vx)<8,'old launch momentum should settle in under a third of a second');
  // A broad prescribed current change, rather than a force applied to the hull.
  for(let i=0;i<water.depth.length;i++)water.mx[i]=-20*water.depth[i];water.refresh();
  for(let n=0;n<18;n++){water.step();stepBoat(boat,water,PHYSICS_DT);}
  assert.ok(boat.vx<-12,'hull must quickly follow the new current direction');
});


test('vortex forcing is gentler near its core and negligible outside its compact reach', () => {
  const water=beach(),vortex={x:550,y:90,core:70,reach:180,strength:1};
  const near=water.vortexForce(620,90,0,0,vortex),far=water.vortexForce(910,90,0,0,vortex);
  assert.ok(Math.hypot(...near)>80&&Math.hypot(...near)<100);assert.ok(Math.hypot(...far)<.01);
});


test('offshore depressions and residual vortex troughs are not solid boat obstacles', () => {
  const water=beach(), boat=boatAt(550,80);
  // A deep seabed remains clear even while a moved vortex's surface trough
  // passes under the hull. The former depth<5 check displaced it 40px/frame.
  for(let i=0;i<water.depth.length;i++) {
    const x=water.originX+(i%water.cols+.5)*water.cell;
    if(Math.abs(x-550)<70)water.depth[i]=3;
  }
  water.refresh();boat.vx=-20;
  constrainBoat(boat,water);
  assert.equal(boat.x,550);assert.equal(boat.y,80);assert.equal(boat.vx,-20);
  assert.equal(boat.bounceTime,undefined);
  assert.equal(placeBoat(boat,water,550,80),true,'a wet offshore trough remains draggable');
});

test('natural incoming crests stay gentle while retaining wavefront variation', () => {
  let peak=0;
  for(let t=5;t<100;t+=.2)for(let y=0;y<900;y+=60)peak=Math.max(peak,Math.abs(incomingWave(t,y)));
  assert.ok(peak>1&&peak<1.26,`natural crest amplitude: ${peak}`);
  assert.notEqual(incomingWave(20,40),incomingWave(20,300));
});


test('later gentle swells repeatedly wash the foreshore and leave damp sand', () => {
  const terrain=new Terrain(1440,180,{shore:800,jagged:false,mobile:false});
  const water=new Water(64,15,12,{terrain,originX:672,boundaries:'open'});water.initializeSurf();
  const wetCells=new Set(),renewed=new Set();let minWet=Infinity,maxWet=0,maxLateRunup=0;
  for(let n=0;n<5400;n++) {
    water.step();if(n<1800)continue;
    let wet=0;
    for(let i=0;i<water.depth.length;i++) {
      const x=water.originX+(i%water.cols+.5)*12,y=(Math.floor(i/water.cols)+.5)*12,d=terrain.distance(x,y);
      if(d>=0||d<-80)continue;
      if(water.depth[i]>.28) {wet++;maxLateRunup=Math.max(maxLateRunup,-d);if(wetCells.has(i))renewed.add(i);}
      else if(water.depth[i]<.08)wetCells.add(i);
    }
    minWet=Math.min(minWet,wet);maxWet=Math.max(maxWet,wet);
  }
  assert.ok(renewed.size>=15,'fresh water must return after recession long after startup');
  assert.ok(maxWet-minWet>=15,'the wash edge must keep moving');
  assert.ok(maxLateRunup>=35,'gentle swells should still wash visibly across sand');
  assert.ok(water.wetSand.some((wet,i)=>water.bed[i]>0&&wet>.5),'sand should remain damp between washes');
});


test('wet-sand tracking includes the submerged foreshore', () => {
  const water=beach();water.step();
  const i=7*water.cols+9,x=water.originX+(9+.5)*12;
  assert.ok(water.terrain.distance(x,90)<0&&water.bed[i]<0);
  assert.ok(water.wetSand[i]>.99,'submerged beach sand must retain its wet state');
});


test('a gentle mouse wave travels to the wet foreshore and breaks', () => {
  const terrain=new Terrain(780,240,{shore:300,jagged:false,mobile:false});
  const water=new Water(50,20,12,{terrain,originX:180,boundaries:'open',waves:false});
  const volume=sum(water.depth);water.splash(400,120,MOUSE_WAVE.maxAmplitude,MOUSE_WAVE.radius);
  assert.ok(Math.abs(sum(water.depth)-volume)<1e-8);
  assert.ok(water.depth.every((h,i)=>water.bed[i]<=0||h===0),'the source must not paint water directly onto dry sand');
  let maxRunup=0,maxFoam=0,arrival=null;const washed=new Set();
  for(let n=0;n<600;n++) {
    water.step();
    for(let i=0;i<water.depth.length;i++) {
      assert.ok(Number.isFinite(water.depth[i])&&water.depth[i]>=0);
      const px=water.originX+(i%water.cols+.5)*12;
      if(terrain.distance(px,120)>=0||water.depth[i]<.05||water.foam[i]<.12)continue;
      if(arrival===null)arrival=water.time;
      const x=water.originX+(i%water.cols+.5)*12,y=(Math.floor(i/water.cols)+.5)*12;
      washed.add(i);maxRunup=Math.max(maxRunup,-terrain.distance(x,y));maxFoam=Math.max(maxFoam,water.foam[i]);
    }
  }
  assert.ok(arrival>.25,'wave must travel to the shore');
  assert.ok(washed.size>=10&&maxRunup>=12,'the moving ripple must break on the wet foreshore');
  assert.ok(maxFoam>.3,'gentle mouse-driven breaking must produce visible foam');
});

test('mouse strokes carry the boat in all four input directions', () => {
  for(const [nx,ny] of [[1,0],[-1,0],[0,1],[0,-1]]) {
    const terrain=new Terrain(900,360,{shore:220,jagged:false,mobile:false});
    const water=new Water(65,30,12,{terrain,originX:120,boundaries:'open',waves:false}),boat=boatAt(620,168);
    water.splash(boat.x-nx*32,boat.y+12-ny*32,MOUSE_WAVE.maxAmplitude,MOUSE_WAVE.radius,nx*6*MOUSE_WAVE.momentum,ny*6*MOUSE_WAVE.momentum);
    let firstVelocity=0,travel=0;
    for(let n=0;n<240;n++) {
      water.step();stepBoat(boat,water,PHYSICS_DT);
      if(n===15)firstVelocity=boat.vx*nx+boat.vy*ny;
      travel=Math.max(travel,(boat.x-620)*nx+(boat.y-168)*ny);
    }
    assert.ok(firstVelocity>2&&firstVelocity<15,`boat must promptly follow input ${nx},${ny}: ${firstVelocity}`);
    assert.ok(travel>2&&travel<20,`stroke must move the boat visibly ${nx},${ny}: ${travel}`);
  }
});

test('stationary mouse splashes visibly push and bob the boat away from the source', () => {
  for(const nx of [-1,1]) {
    const terrain=new Terrain(900,360,{shore:220,jagged:false,mobile:false});
    const water=new Water(65,30,12,{terrain,originX:120,boundaries:'open',waves:false}),boat=boatAt(620,168);
    water.splash(boat.x-nx*32,boat.y+12,MOUSE_WAVE.maxAmplitude,MOUSE_WAVE.radius);
    let travel=0,bob=0;
    for(let n=0;n<180;n++) {
      water.step();stepBoat(boat,water,PHYSICS_DT);
      if(n===15)assert.ok(boat.vx*nx>1,'a click must initially push the boat away from the splash');
      travel=Math.max(travel,(boat.x-620)*nx);bob=Math.max(bob,Math.abs(boat.heave));
    }
    assert.ok(travel>.25&&travel<3&&bob>1&&bob<4,`click response must be visible: travel ${travel}, bob ${bob}`);
  }
});


test('a small ripple can produce shoreline foam and spray', () => {
  const terrain=new Terrain(780,240,{shore:300,jagged:false,mobile:false});
  const water=new Water(50,20,12,{terrain,originX:180,boundaries:'open',waves:false});
  water.splash(350,120,.5,MOUSE_WAVE.radius);let breaker=0;
  for(let n=0;n<360;n++) {
    water.step();
    for(let i=0;i<water.depth.length;i++) {
      const x=water.originX+(i%water.cols+.5)*12;
      if(terrain.distance(x,120)<0&&water.depth[i]>.05)breaker=Math.max(breaker,water.breaking[i]);
    }
  }
  assert.ok(breaker>.2,'even a ripple at less than half of click strength should splash on the beach');
});


test('a compact vortex circulates gently without excavating a dead basin', () => {
  const water=new Water(70,45,12),vortex={x:420,y:270,core:75,reach:180,strength:1};
  for(let n=0;n<1200;n++)water.step(PHYSICS_DT,vortex);
  assert.ok(Math.min(...water.depth)>15,'rotation must not carve the former deep, flat glyph basin');
  assert.ok(Math.hypot(...water.velocity(495,270))>40&&Math.hypot(...water.velocity(495,270))<65,'circulation must remain visible without the former overpowering current');
});
