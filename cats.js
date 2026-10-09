// Pixel cats that follow the cursor, then sit, groom, lie down and nap. Desktop only: on phones and
// tablets (touch-first or narrow screens) nothing is created at all.
// They live on the page, not the screen: scroll away and they walk (or sprint) to catch up.
// All positions are page coordinates (document pixels from the top-left of the page).
// A cat door fixed in the bottom-left corner lets them out and calls them back in.
// Sprite sheets in images/cats/ are 4 columns x 8 rows of 100x84 cells:
//   0 walk down · 1 walk right · 2 walk up (also Momo's "moon") · 3 walk left · 4 sit · 5 groom · 6 lie down · 7 sleep (0-1) / roll (2-3)

(() => {
  // Keep in sync with the matching media query in styles.css
  if (window.matchMedia('(pointer: coarse), (max-width: 640px)').matches) return;

  const CELL_W = 100;
  const CELL_H = 84;
  const SCALE = 0.7;     // on-screen size of a 13 lb cat relative to the sheet cell
  const BASE_LBS = 13;
  // Size is proportional to weight: a 15 lb cat is drawn 15/13 the size of a 13 lb one
  const scaleFor = (lbs) => SCALE * (lbs / BASE_LBS);

  const anims = {
    down:  { row: 0, frames: [0, 1, 2, 3], fps: 8 },
    right: { row: 1, frames: [0, 1, 2, 3], fps: 8 },
    up:    { row: 2, frames: [0, 1, 2, 3], fps: 8 },
    left:  { row: 3, frames: [0, 1, 2, 3], fps: 8 },
    sit:   { row: 4, frames: [0, 0, 0, 0, 1, 1, 0, 0, 0, 3, 3, 3], fps: 3 },
    groom: { row: 5, frames: [0, 1, 2, 3, 2, 1], fps: 5 },
    lie:   { row: 6, frames: [0, 1, 2, 3], fps: 5, once: true },
    rise:  { row: 6, frames: [3, 2, 1, 0], fps: 8, once: true },
    sleep: { row: 7, frames: [0, 1], fps: 0.8 },
    roll:  { row: 7, frames: [2, 3], fps: 3 },
    moon:  { row: 2, frames: [0, 1, 1, 1, 1, 3, 1, 1], fps: 2 }, // back to you, tail up
  };

  // Where each cat likes to hang out relative to the cursor, so they gather around it instead of stacking.
  // `poses` weights what a cat does when it gets bored of sitting (groom / roll / lie down / moon).
  // `playful` is the chance a bored cat starts a game of chase instead.
  // `eagerness` is the chance a follower bothers to come when you move away, and `reaction` how many
  // seconds it takes to get going, so they trail after you in ones and twos rather than all at once.
  const catDefs = [
    // Soba (grey tabby, girl, the eldest): aloof, mostly does her own thing and only comes over now and then.
    // Can't stand Momo: if Momo gets too close, Soba storms off in a huff.
    { name: 'soba', lbs: 12, offset: [-70, 30], speed: 150, aloof: true, playful: 0.05, grumpyAt: 'momo' },
    // Moka (black cat, boy, the youngest): the playful one; he starts the most games of chase
    { name: 'moka', lbs: 13, offset: [60, 40],  speed: 170, eagerness: 0.4, reaction: [0.1, 0.9],
      playful: 0.4, poses: { groom: 0.2, roll: 0.5, lie: 0.3 } },
    // Kino (brown tabby, boy): the most devoted follower, he almost always comes, but at an easy amble.
    // Rarely plays alone (rolling about); he'd rather groom or lie down.
    { name: 'kino', lbs: 15, offset: [-5, 85],  speed: 115, eagerness: 0.85, reaction: [0.2, 0.8],
      poses: { groom: 0.5, roll: 0.05, lie: 0.45 } },
    // Momo (orange tabby, girl): grooms more than anyone, takes her time getting anywhere,
    // and is forever turning round to show you her bum
    { name: 'momo', lbs: 11, offset: [85, 100], speed: 105, eagerness: 0.3, reaction: [1, 2.8],
      poses: { groom: 0.55, moon: 0.3, roll: 0.05, lie: 0.1 } },
  ];

  const START_WALK = 70; // px from its spot before a resting cat gets up
  const ARRIVED = 10;    // px from its spot to count as "there"
  const ALOOF_FOLLOW_CHANCE = 0.1;
  const DEFAULT_POSES = { groom: 0.45, roll: 0.2, lie: 0.35 };
  const DEFAULT_PLAYFUL = 0.12;
  const MAX_PLAYERS = 3; // games of chase are 2 or 3 cats, never all 4
  const TAG_DISTANCE = 28;
  const ANNOY_DISTANCE = 60; // how close a cat's nemesis can get before it runs off angry

  // Cat door: the cats start inside and come out when it's clicked. Its sprite strip is 4 frames:
  // 0 closed · 1 fully open · 2 flap starting to swing · 3 flap mostly up
  const START_INSIDE = true;
  const EXIT_ORDER = ['moka', 'kino', 'momo', 'soba']; // youngest bursts out first, Soba saunters out last
  const DOOR_OPEN = [0, 2, 3, 1];
  const DOOR_CLOSE = [1, 3, 2, 0, 2, 0]; // swings shut with a little bounce
  const DOOR_FPS = 14;
  const DOOR_HOLE = { l: 0.244, t: 0.294, r: 0.756, b: 0.76 }; // the opening, as fractions of the door graphic
  const STEP_OUT = 0.55; // how far (in cat heights) below the sill a cat steps before it's clear of the door

  // Cats keep their bodies off anything clickable and walk around it instead
  const CLICKABLE = 'a[href], button, input, select, textarea, label, summary, [role="button"], [tabindex]:not([tabindex="-1"])';
  const BODY_HALF_W = 26; // half the cat's on-screen body width
  const BODY_H = 52;      // body height above its feet

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const rand = (min, max) => min + Math.random() * (max - min);

  const layer = document.createElement('div');
  layer.className = 'cat-layer';
  layer.setAttribute('aria-hidden', 'true');
  document.body.append(layer);

  // Page dimensions, measured once a frame (reading them can force a layout)
  let page = { w: 0, h: 0 };
  const measurePage = () => {
    page = { w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight };
  };
  measurePage();

  // The cursor (or last tap) in page coordinates
  const target = { x: window.scrollX + window.innerWidth * 0.15, y: window.scrollY + window.innerHeight - 40 };
  let lastMouse = null; // the mouse in screen coordinates, so scrolling can move the target under it

  const cats = catDefs.map((def, i) => {
    const el = document.createElement('div');
    el.className = 'cat';
    el.dataset.cat = def.name;
    el.style.backgroundImage = `url(images/cats/${def.name}.webp)`;
    const scale = scaleFor(def.lbs);
    el.style.width = `${CELL_W * scale}px`;
    el.style.height = `${CELL_H * scale}px`;
    el.style.backgroundSize = `${CELL_W * 4 * scale}px ${CELL_H * 8 * scale}px`;
    layer.append(el);
    const cat = {
      poses: DEFAULT_POSES,
      playful: DEFAULT_PLAYFUL,
      eagerness: 0.5,
      reaction: [0.3, 1.5],
      ...def,
      scale: scaleFor(def.lbs),
      el,
      x: target.x + def.offset[0],
      y: target.y + def.offset[1] * 0.3 - 20,
      state: START_INSIDE ? 'inside' : 'sleep',
      hidden: START_INSIDE, // behind the cat door
      anim: null,
      frame: 0,
      clock: 0,
      idle: 0,
      nextIdle: 0,
      fpsScale: 1,
      following: !def.aloof,
      home: null, // where an aloof cat is headed when it isn't following
      delay: 0, // short reaction time so the cats don't all start walking in lockstep
      turning: 0,  // how long it has wanted to face a new way
      stalled: 0,  // how long a walk has made no headway
      lastDist: Infinity,
      lastGoal: null,
      settledFor: null, // a spot it couldn't reach and settled down short of
      going: null,      // decided to follow: { left } seconds until it gets up
      ignoring: null,   // decided not to: { x, y, left } the spot it's ignoring and for how long
      pace: 1,          // this trip's speed, varied a little each time
      angry: 0,         // seconds left showing the anger mark
      huffy: false,     // just stormed off; grooms to calm down once settled
      phase: null,      // step within going out of / into the cat door
      clipDoor: false,  // only show the part of the cat inside the door's opening
      runTo: null, // where it's dashing to during a game of chase
      pause: 0,    // seconds left rolling around after being tagged
    };
    cat.home = { x: cat.x, y: cat.y };
    cat.nextIdle = rand(8, 15);
    play(cat, 'sleep');
    cat.clock = i * 0.4;
    return cat;
  });

  function play(cat, name) {
    if (cat.anim === anims[name]) return;
    cat.anim = anims[name];
    cat.frame = 0;
    cat.clock = 0;
  }

  function setState(cat, state) {
    cat.state = state;
    cat.stalled = 0;
    cat.lastDist = Infinity;
    cat.idle = 0;
    if (state === 'sit') cat.nextIdle = rand(3, 6);
    if (state === 'groom' || state === 'roll' || state === 'moon') cat.nextIdle = rand(2.5, 4.5);
    if (state === 'sleep') cat.nextIdle = cat.aloof ? rand(15, 30) : rand(20, 45);
    if (state === 'walk') cat.pace = rand(0.8, 1.25);
    if (anims[state]) play(cat, state);
  }

  function spot(cat) {
    return freeSpot(cat.following ? { x: target.x + cat.offset[0], y: target.y + cat.offset[1] } : cat.home);
  }

  // Is any other cat currently heading for the cursor?
  const othersChasing = (cat) =>
    cats.some((other) => other !== cat && other.following && ['walk', 'wait', 'rise'].includes(other.state));

  const willFollow = (cat) => !othersChasing(cat) && Math.random() < ALOOF_FOLLOW_CHANCE;

  // Stop following and stay (or head) somewhere of its own choosing
  function goOwnWay(cat, place = { x: cat.x, y: cat.y }) {
    cat.following = false;
    cat.home = place;
  }

  // A random spot on screen to wander to, keeping its distance from the cursor
  function wanderPoint() {
    let p;
    for (let i = 0; i < 10; i++) {
      p = { x: window.scrollX + rand(40, window.innerWidth - 40), y: window.scrollY + rand(120, window.innerHeight - 10) };
      if (Math.hypot(p.x - target.x, p.y - target.y) > 200) break;
    }
    return freeSpot(p);
  }

  // --- Obstacles: clickable elements, as boxes the cat's feet must stay out of ---
  // Each box is the element padded by the cat's body (feet are at the bottom centre of the sprite),
  // and overlapping boxes are merged so cats go around a whole row of links rather than between them.
  let obstacles = [];
  let obstaclesAge = Infinity;

  function refreshObstacles() {
    const sx = window.scrollX;
    const sy = window.scrollY;
    let boxes = [];
    for (const el of document.querySelectorAll(CLICKABLE)) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      boxes.push({ l: r.left + sx - BODY_HALF_W, r: r.right + sx + BODY_HALF_W, t: r.top + sy - 4, b: r.bottom + sy + BODY_H });
    }
    for (let merged = true; merged; ) {
      merged = false;
      for (let i = 0; i < boxes.length && !merged; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i], b = boxes[j];
          if (a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b) {
            boxes[i] = { l: Math.min(a.l, b.l), r: Math.max(a.r, b.r), t: Math.min(a.t, b.t), b: Math.max(a.b, b.b) };
            boxes.splice(j, 1);
            merged = true;
            break;
          }
        }
      }
    }
    obstacles = boxes;
    obstaclesAge = 0;
  }

  const inside = (x, y, o) => x > o.l && x < o.r && y > o.t && y < o.b;
  const obstacleAt = (x, y) => obstacles.find((o) => inside(x, y, o));
  const clampToPage = (p) => {
    const { w, h } = page;
    return { x: Math.min(w - 30, Math.max(30, p.x)), y: Math.min(h - 6, Math.max(60, p.y)) };
  };

  // The closest point just outside the box that's still on the page
  function exitPoint(x, y, o) {
    const m = 3;
    const options = [{ x: o.l - m, y }, { x: o.r + m, y }, { x, y: o.t - m }, { x, y: o.b + m }]
      .map(clampToPage)
      .filter((p) => !obstacleAt(p.x, p.y));
    if (!options.length) return clampToPage({ x, y: o.b + m }); // boxed in: below is the safest bet
    return options.reduce((a, b) => (Math.hypot(a.x - x, a.y - y) < Math.hypot(b.x - x, b.y - y) ? a : b));
  }

  // Move a resting spot out of any clickable area
  function freeSpot(p) {
    p = clampToPage(p);
    const o = obstacleAt(p.x, p.y);
    return o ? exitPoint(p.x, p.y, o) : p;
  }

  // Where along the segment (0..1) it first enters the box, or null if it misses (Liang–Barsky)
  function segmentHit(x0, y0, x1, y1, o) {
    let t0 = 0, t1 = 1;
    const dx = x1 - x0, dy = y1 - y0;
    for (const [p, q] of [[-dx, x0 - o.l], [dx, o.r - x0], [-dy, y0 - o.t], [dy, o.b - y0]]) {
      if (p === 0) { if (q <= 0) return null; continue; }
      const t = q / p;
      if (p < 0) { if (t > t1) return null; if (t > t0) t0 = t; }
      else { if (t < t0) return null; if (t < t1) t1 = t; }
    }
    return t0;
  }

  // Next point to head for on the way to (gx, gy): straight there, or around the corner of whatever is in the way
  // A box that contains the goal itself (the cat door, when heading inside) is walked into, not around.
  function steer(cat, gx, gy) {
    const stuck = obstacleAt(cat.x, cat.y);
    if (stuck && !inside(gx, gy, stuck)) return exitPoint(cat.x, cat.y, stuck);
    let hit = null;
    let first = Infinity;
    for (const o of obstacles) {
      if (inside(gx, gy, o)) continue;
      const t = segmentHit(cat.x, cat.y, gx, gy, o);
      if (t !== null && t < first) { first = t; hit = o; }
    }
    if (!hit) return { x: gx, y: gy };
    const m = 4;
    let best = null;
    let cost = Infinity;
    for (const c of [{ x: hit.l - m, y: hit.t - m }, { x: hit.r + m, y: hit.t - m }, { x: hit.l - m, y: hit.b + m }, { x: hit.r + m, y: hit.b + m }]) {
      const toCorner = Math.hypot(c.x - cat.x, c.y - cat.y);
      const { w, h } = page;
      const offPage = c.x < 10 || c.x > w - 10 || c.y < 40 || c.y > h;
      if (offPage || toCorner < 6 || segmentHit(cat.x, cat.y, c.x, c.y, hit) !== null) continue;
      const total = toCorner + Math.hypot(gx - c.x, gy - c.y);
      if (total < cost) { cost = total; best = c; }
    }
    return best || { x: gx, y: gy };
  }

  // You've moved away from a resting follower: does it come, and when? Returns true once it's time to get up.
  // A cat that can't be bothered ignores you for a few seconds, or until you've gone somewhere new.
  function readyToFollow(cat, goal, dt) {
    if (cat.aloof) return true; // the aloof cat already decided in update()
    if (cat.going) {
      if ((cat.going.left -= dt) > 0) return false;
      cat.going = null;
      return true;
    }
    if (cat.ignoring) {
      const movedOn = Math.hypot(goal.x - cat.ignoring.x, goal.y - cat.ignoring.y) > 150;
      if (!movedOn && (cat.ignoring.left -= dt) > 0) return false;
      cat.ignoring = null;
    }
    // Left far behind (you scrolled away): much more likely to come looking for you
    const eagerness = Math.hypot(goal.x - cat.x, goal.y - cat.y) > 900 ? cat.eagerness + 0.3 : cat.eagerness;
    if (Math.random() < eagerness) cat.going = { left: rand(...cat.reaction) };
    else cat.ignoring = { x: goal.x, y: goal.y, left: rand(3, 8) };
    return false;
  }

  // Chase: now and then a few idle cats play tag. Only one game at a time, so at most 3 cats ever play.
  let game = null; // { players, it, left, center }

  const canPlay = (cat) => ['sit', 'groom', 'roll', 'moon', 'lie'].includes(cat.state); // awake and hanging about
  const joinChance = (cat) => (cat.aloof ? 0.25 : Math.min(0.95, 0.5 + cat.playful));

  function tryStartGame(starter) {
    if (game) return false;
    const size = Math.random() < 0.5 ? 2 : MAX_PLAYERS;
    const players = [starter];
    for (const c of cats.filter((c) => c !== starter && canPlay(c)).sort(() => Math.random() - 0.5)) {
      if (players.length >= size) break;
      if (players.some((p) => clash(p, c)) || Math.random() >= joinChance(c)) continue;
      players.push(c);
    }
    if (players.length < 2) return false;
    const center = {
      x: players.reduce((sum, c) => sum + c.x, 0) / players.length,
      y: players.reduce((sum, c) => sum + c.y, 0) / players.length,
    };
    game = { players, it: starter, left: rand(6, 11), center };
    players.forEach((c) => {
      c.state = 'play';
      c.pause = 0;
      c.runTo = playPoint();
    });
    return true;
  }

  const clash = (a, b) => a.grumpyAt === b.name || b.grumpyAt === a.name;

  function leaveGame(cat) {
    if (!game || !game.players.includes(cat)) return;
    game.players = game.players.filter((c) => c !== cat);
    if (game.players.length < 2) endGame();
    else if (game.it === cat) game.it = game.players[0];
  }

  // Too close to its nemesis: run off the other way (or sideways if backed against an edge), angry
  function checkTempers() {
    for (const cat of cats) {
      if (!cat.grumpyAt || cat.hidden || ['flee', 'exit', 'enter'].includes(cat.state)) continue;
      const nemesis = cats.find((c) => c.name === cat.grumpyAt);
      if (nemesis.hidden) continue;
      if (Math.hypot(nemesis.x - cat.x, (nemesis.y - cat.y) * 1.6) < ANNOY_DISTANCE) stormOff(cat, nemesis);
    }
  }

  function stormOff(cat, from) {
    leaveGame(cat);
    const dx = cat.x - from.x;
    const dy = cat.y - from.y;
    const d = Math.hypot(dx, dy) || 1;
    const run = rand(220, 320);
    let to = freeSpot({ x: cat.x + (dx / d) * run, y: cat.y + (dy / d) * run });
    if (Math.hypot(to.x - cat.x, to.y - cat.y) < 120) to = freeSpot({ x: cat.x - (dy / d) * run, y: cat.y + (dx / d) * run });
    goOwnWay(cat, to);
    cat.angry = 3;
    cat.huffy = true;
    setState(cat, 'flee');
  }

  function endGame() {
    game.players.forEach((c) => {
      if (c.aloof) goOwnWay(c);
      setState(c, c.playful > 0.3 ? 'roll' : 'sit');
    });
    game = null;
  }

  // Somewhere to dash to, near where the game started
  function playPoint() {
    return freeSpot({ x: game.center.x + rand(-180, 180), y: Math.max(120, game.center.y + rand(-100, 100)) });
  }

  // Step toward a point (going around clickable things) using the matching walk cycle; returns how far is left
  function moveToward(cat, x, y, speed, fpsScale, dt, direct = false) {
    const via = direct ? { x, y } : steer(cat, x, y);
    const dx = via.x - cat.x;
    const dy = via.y - cat.y;
    const dist = Math.hypot(dx, dy);
    const rest = Math.hypot(x - via.x, y - via.y);
    if (dist < 0.5) return rest;
    const step = Math.min(dist, speed * dt);
    cat.x += (dx / dist) * step;
    cat.y += (dy / dist) * step;
    cat.fpsScale = fpsScale * (cat.speed / 150); // slower cats take slower steps, so feet don't slide
    face(cat, Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'), dt);
    return dist - step + rest;
  }

  // Turn to a new walking direction only once it has held for a moment, so small wobbles don't flicker the sprite
  function face(cat, dir, dt) {
    const walking = ['up', 'down', 'left', 'right'].some((d) => cat.anim === anims[d]);
    if (!walking || cat.anim === anims[dir]) {
      cat.turning = 0;
      play(cat, dir);
    } else if ((cat.turning += dt) > 0.15) {
      cat.turning = 0;
      play(cat, dir);
    }
  }

  function updatePlay(cat, dt) {
    if (cat.pause > 0) {
      // Just got tagged: roll around for a moment before giving chase
      cat.pause -= dt;
      cat.fpsScale = 1;
      play(cat, 'roll');
    } else if (cat === game.it) {
      const prey = game.players
        .filter((c) => c !== cat)
        .reduce((a, b) => (Math.hypot(a.x - cat.x, a.y - cat.y) < Math.hypot(b.x - cat.x, b.y - cat.y) ? a : b));
      if (moveToward(cat, prey.x, prey.y, cat.speed * 1.6, 1.6, dt) < TAG_DISTANCE) {
        game.it = prey;
        prey.pause = 0.8;
        cat.runTo = playPoint();
      }
    } else if (moveToward(cat, cat.runTo.x, cat.runTo.y, cat.speed * 1.4, 1.5, dt) < ARRIVED) {
      cat.runTo = playPoint();
    }
  }

  function update(cat, dt) {
    if (cat.hidden) return;
    if (cat.state === 'exit' || cat.state === 'enter') {
      updateDoorway(cat, dt);
      animate(cat, dt);
      return;
    }
    let goal = spot(cat);
    // When the cursor moves off, the aloof cat usually can't be bothered to get up
    if (cat.aloof && cat.following && !['walk', 'wait', 'rise', 'play'].includes(cat.state) &&
        Math.hypot(goal.x - cat.x, goal.y - cat.y) > START_WALK && !willFollow(cat)) {
      goOwnWay(cat);
      goal = spot(cat);
    }
    // ...and it gives up halfway if the others start chasing too
    if (cat.aloof && cat.following && cat.state === 'walk' && othersChasing(cat)) {
      goOwnWay(cat);
      goal = spot(cat);
    }
    const dx = goal.x - cat.x;
    const dy = goal.y - cat.y;
    const dist = Math.hypot(dx, dy);
    const inTheWay = !!obstacleAt(cat.x, cat.y); // e.g. a button scrolled under it
    const gaveUp = cat.settledFor && Math.hypot(goal.x - cat.settledFor.x, goal.y - cat.settledFor.y) < 20;
    if (!gaveUp) cat.settledFor = null;
    const farFrom = (limit) => dist > limit && !gaveUp;
    const shouldGo = (limit) => {
      if (!farFrom(limit)) { cat.going = null; return false; } // you came back
      return readyToFollow(cat, goal, dt);
    };
    cat.idle += dt;
    if (cat.angry > 0) cat.angry -= dt;

    switch (cat.state) {
      case 'walk': {
        if (dist < ARRIVED && !inTheWay) { setState(cat, 'sit'); break; }
        // Crowded out of its spot (another cat or the screen edge is in the way): close enough, sit down
        const goalMoved = !cat.lastGoal || Math.hypot(goal.x - cat.lastGoal.x, goal.y - cat.lastGoal.y) > 1;
        cat.stalled = !goalMoved && dist > cat.lastDist - 0.5 ? cat.stalled + dt : 0;
        cat.lastDist = dist;
        cat.lastGoal = goal;
        if (cat.stalled > 0.6 && !inTheWay) {
          cat.settledFor = goal; // gave up on this spot; don't try again until it moves
          setState(cat, 'sit');
          break;
        }
        // Trot when behind, sprint when you've scrolled far away; wandering is a stroll
        const pace = (!cat.following ? 0.6 : dist > 900 ? 2.8 : dist > 300 ? 1.8 : 1) * cat.pace;
        moveToward(cat, goal.x, goal.y, cat.speed * pace, !cat.following ? 0.75 : Math.min(2.2, 0.4 + pace * 0.65), dt);
        break;
      }
      case 'sit':
      case 'groom':
      case 'roll':
      case 'moon':
        if (shouldGo(START_WALK) || inTheWay) { startWalking(cat); break; }
        if (cat.idle > cat.nextIdle) {
          if (cat.state !== 'sit') setState(cat, 'sit');
          else if (cat.huffy) {
            cat.huffy = false; // ...then an indignant groom
            setState(cat, 'groom');
          } else if (Math.random() < cat.playful && tryStartGame(cat)) {
            // off to play
          } else if (cat.aloof && !cat.following && willFollow(cat)) {
            cat.following = true;
            startWalking(cat);
          } else if (cat.aloof && Math.random() < 0.4) {
            goOwnWay(cat, wanderPoint());
            startWalking(cat);
          } else {
            setState(cat, pickPose(cat.poses));
          }
        }
        break;
      case 'lie':
        if (shouldGo(START_WALK) || inTheWay) { setState(cat, 'rise'); break; }
        if (cat.done) setState(cat, 'sleep');
        break;
      case 'sleep':
        // Sleeping cats are slow to notice you left
        if (shouldGo(START_WALK * 1.5) || inTheWay) setState(cat, 'rise');
        // Naps end on their own; the aloof cat then wanders off to do something else
        else if (cat.idle > cat.nextIdle) {
          if (cat.aloof) goOwnWay(cat, wanderPoint());
          setState(cat, 'rise');
        }
        break;
      case 'rise':
        if (cat.done) startWalking(cat);
        break;
      case 'wait':
        cat.delay -= dt;
        if (cat.delay <= 0) setState(cat, 'walk');
        break;
      case 'play':
        if (game) updatePlay(cat, dt);
        else setState(cat, 'sit');
        break;
      case 'flee':
        if (moveToward(cat, goal.x, goal.y, cat.speed * 2.2, 2, dt) < ARRIVED || cat.idle > 4) {
          setState(cat, 'sit');
          cat.nextIdle = rand(1, 2); // fume for a moment...
        }
        break;
    }

    animate(cat, dt);
  }

  // Advance the animation frame
  function animate(cat, dt) {
    const anim = cat.anim;
    cat.clock += dt * anim.fps * (['walk', 'play', 'flee', 'exit', 'enter'].includes(cat.state) ? cat.fpsScale : 1);
    const step = Math.floor(cat.clock);
    cat.done = anim.once && step >= anim.frames.length - 1;
    cat.frame = anim.frames[anim.once ? Math.min(step, anim.frames.length - 1) : step % anim.frames.length];
  }

  // Stepping out of the door to its landing spot, or running back in through it
  // Coming out: step down out of the opening toward you (clipped to the hole), then walk off.
  // Going in: run to the step below the door, then walk up into the opening and vanish.
  function updateDoorway(cat, dt) {
    const { sill, step } = doorSpots(cat);
    if (cat.state === 'exit') {
      if (cat.phase === 'emerge') {
        if (moveToward(cat, step.x, step.y, cat.speed * 0.7, 0.9, dt, true) < 1) {
          cat.phase = 'away';
          cat.clipDoor = false;
        }
      } else if (moveToward(cat, cat.landing.x, cat.landing.y, cat.speed * 1.3, 1.3, dt, true) < 2) {
        setState(cat, 'sit');
      }
    } else if (cat.phase === 'approach') {
      if (moveToward(cat, step.x, step.y, cat.speed * 2.4, 2, dt) < 4) {
        cat.phase = 'duck';
        cat.clipDoor = true;
      }
    } else if (moveToward(cat, sill.x, sill.y, cat.speed * 0.8, 1, dt, true) < 1) {
      cat.hidden = true;
      cat.clipDoor = false;
      cat.state = 'inside';
    }
  }

  function pickPose(poses) {
    let r = Math.random();
    for (const [pose, weight] of Object.entries(poses)) {
      if ((r -= weight) < 0) return pose;
    }
    return 'lie';
  }

  function startWalking(cat) {
    cat.state = 'wait';
    cat.delay = rand(0.05, 0.35);
  }

  // Gently push cats apart so they don't overlap while walking
  function separate() {
    for (let i = 0; i < cats.length; i++) {
      for (let j = i + 1; j < cats.length; j++) {
        const a = cats[i], b = cats[j];
        if (a.hidden || b.hidden) continue;
        const dx = b.x - a.x, dy = (b.y - a.y) * 1.6;
        const d = Math.hypot(dx, dy) || 1;
        const min = 48;
        if (d < min && (a.state === 'walk' || b.state === 'walk')) {
          // Only walking cats get nudged (a sitting cat holds its ground), and never onto a link or off the page
          const push = (min - d) * (a.state === 'walk' && b.state === 'walk' ? 0.5 : 1);
          if (a.state === 'walk') nudge(a, (-dx / d) * push, (-dy / d) * push * 0.6);
          if (b.state === 'walk') nudge(b, (dx / d) * push, (dy / d) * push * 0.6);
        }
      }
    }
  }

  function nudge(cat, dx, dy) {
    const len = Math.hypot(dx, dy);
    if (len > 4) { dx *= 4 / len; dy *= 4 / len; } // ease apart, don't jump
    const p = clampToPage({ x: cat.x + dx, y: cat.y + dy });
    if (!obstacleAt(p.x, p.y)) Object.assign(cat, p);
  }

  // While a cat is in the doorway, only the part inside the opening or below its sill shows,
  // so it looks like it's stepping through the hole rather than out from behind the door
  function doorClip(cat, w, h) {
    const hole = doorHole();
    const left = cat.x - w / 2;
    const top = cat.y - h;
    const [l, t, r, b] = [hole.l - left, hole.t - top, hole.r - left, hole.b - top].map((v) => `${v.toFixed(1)}px`);
    const far = '9999px';
    return `polygon(${l} ${t}, ${r} ${t}, ${r} ${b}, ${far} ${b}, ${far} ${far}, -${far} ${far}, -${far} ${b}, ${l} ${b})`;
  }

  // The layer scrolls with the page; this is where its top-left sits in page coordinates
  let origin = { x: 0, y: 0 };
  function measureOrigin() {
    const r = layer.getBoundingClientRect();
    origin = { x: r.left + window.scrollX, y: r.top + window.scrollY };
  }

  function draw(cat) {
    cat.el.style.display = cat.hidden ? 'none' : '';
    if (cat.hidden) return;
    const w = CELL_W * cat.scale;
    const h = CELL_H * cat.scale;
    cat.el.style.clipPath = cat.clipDoor ? doorClip(cat, w, h) : '';
    cat.el.style.transform = `translate(${Math.round(cat.x - origin.x - w / 2)}px, ${Math.round(cat.y - origin.y - h)}px)`;
    cat.el.style.backgroundPosition = `${-cat.frame * w}px ${-cat.anim.row * h}px`;
    cat.el.style.zIndex = Math.round(cat.y); // lower on screen = in front
    cat.el.classList.toggle('is-angry', cat.angry > 0);
  }

  let last = performance.now();
  function tick(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    measurePage();
    if ((obstaclesAge += dt) > 0.25) { refreshObstacles(); measureOrigin(); }
    if (game && (game.left -= dt) <= 0) endGame();
    cats.forEach((cat) => update(cat, dt));
    checkTempers();
    separate();
    cats.forEach(draw);
    if (!reduceMotion.matches) requestAnimationFrame(tick);
  }

  function follow(e) {
    if (e.target.closest && e.target.closest('.cat-door')) return; // clicking the door isn't a place to go
    target.x = e.clientX + window.scrollX;
    target.y = e.clientY + window.scrollY;
    lastMouse = e.pointerType === 'mouse' ? { x: e.clientX, y: e.clientY } : null;
  }

  // Mouse: follow the pointer as it moves. Touch: walk over to where you tap.
  window.addEventListener('pointermove', (e) => e.pointerType === 'mouse' && follow(e), { passive: true });
  window.addEventListener('pointerdown', follow, { passive: true });
  window.addEventListener('resize', () => { refreshObstacles(); measureOrigin(); cats.forEach(draw); });
  // Scrolling carries the page (and the cats) away under a still mouse, so the spot to follow moves too
  window.addEventListener('scroll', () => {
    obstaclesAge = Infinity; // fixed things like the cat door move across the page as it scrolls
    if (!lastMouse) return;
    target.x = lastMouse.x + window.scrollX;
    target.y = lastMouse.y + window.scrollY;
  }, { passive: true });

  // --- The cat door ---
  const door = document.createElement('button');
  door.type = 'button';
  door.className = 'cat-door';
  door.innerHTML = '<span class="cat-door-sprite" aria-hidden="true"></span>';
  document.body.append(door);
  let catsOut = !START_INSIDE;
  let doorBusy = false;

  function labelDoor() {
    const label = catsOut ? 'Call the cats back in' : 'Let the cats out';
    door.setAttribute('aria-label', label);
    door.title = label;
  }

  function setDoorFrame(frame) {
    door.style.setProperty('--frame', frame);
  }

  function swingDoor(frames) {
    if (reduceMotion.matches) {
      setDoorFrame(frames[frames.length - 1]);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      frames.forEach((f, i) => setTimeout(() => setDoorFrame(f), (i * 1000) / DOOR_FPS));
      setTimeout(resolve, (frames.length * 1000) / DOOR_FPS);
    });
  }

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Resolves once check() is true (or after `limit` ms, so a stuck cat can't jam the door)
  function waitUntil(check, limit) {
    return new Promise((resolve) => {
      const began = performance.now();
      const poll = setInterval(() => {
        if (check() || performance.now() - began > limit) {
          clearInterval(poll);
          resolve();
        }
      }, 100);
    });
  }

  // Where a cat stands in the doorway, in page coordinates (the door is fixed, so this moves as you scroll)
  // The door's opening in page coordinates (the door is fixed, so this moves as you scroll)
  function doorHole() {
    const r = door.getBoundingClientRect();
    return {
      l: r.left + r.width * DOOR_HOLE.l + window.scrollX,
      t: r.top + r.height * DOOR_HOLE.t + window.scrollY,
      r: r.left + r.width * DOOR_HOLE.r + window.scrollX,
      b: r.top + r.height * DOOR_HOLE.b + window.scrollY,
    };
  }

  // Where a cat's feet go: just inside the opening (sill), and on the step out in front of it
  function doorSpots(cat) {
    const hole = doorHole();
    const x = (hole.l + hole.r) / 2;
    return { sill: { x, y: hole.b - 2 }, step: { x, y: hole.b + CELL_H * cat.scale * STEP_OUT } };
  }

  async function letCatsOut() {
    const r = door.getBoundingClientRect();
    const order = EXIT_ORDER.map((name) => cats.find((c) => c.name === name));
    order.forEach((cat, i) => {
      const landing = freeSpot({
        x: r.right + 45 + i * 55 + window.scrollX,
        y: r.top + r.height * 0.84 - (i % 2) * 30 + window.scrollY,
      });
      setTimeout(() => {
        Object.assign(cat, doorSpots(cat).sill);
        cat.phase = 'emerge';
        cat.clipDoor = true;
        play(cat, 'down');
        cat.landing = landing;
        cat.hidden = false;
        cat.following = !cat.aloof;
        if (cat.aloof) goOwnWay(cat, landing);
        cat.going = cat.ignoring = cat.settledFor = null;
        if (reduceMotion.matches) {
          Object.assign(cat, landing);
          setState(cat, 'sit');
          draw(cat);
        } else {
          setState(cat, 'exit');
        }
      }, reduceMotion.matches ? 0 : i * 450);
    });
    await wait(reduceMotion.matches ? 0 : order.length * 450);
    await waitUntil(() => cats.every((c) => c.state !== 'exit'), 4000);
  }

  async function callCatsIn() {
    if (game) endGame();
    const top = window.scrollY;
    const bottom = top + window.innerHeight;
    for (const cat of cats.filter((c) => !c.hidden)) {
      // Cats you scrolled far away from pop up just off the edge of the screen and run from there
      if (cat.y < top - 100) cat.y = top - 10;
      if (cat.y > bottom + 100) cat.y = bottom + 60;
      cat.angry = 0;
      if (reduceMotion.matches) {
        cat.hidden = true;
        cat.state = 'inside';
        draw(cat);
      } else {
        setState(cat, 'enter');
        cat.phase = 'approach';
      }
    }
    await waitUntil(() => cats.every((c) => c.hidden), 7000);
    cats.forEach((cat) => { cat.hidden = true; cat.state = 'inside'; }); // any stragglers slip in
  }

  door.addEventListener('click', async () => {
    if (doorBusy) return;
    doorBusy = true;
    door.setAttribute('aria-busy', 'true');
    await swingDoor(DOOR_OPEN);
    if (catsOut) await callCatsIn();
    else await letCatsOut();
    await swingDoor(DOOR_CLOSE);
    catsOut = !catsOut;
    labelDoor();
    door.removeAttribute('aria-busy');
    doorBusy = false;
  });

  labelDoor();
  setDoorFrame(0);

  function start() {
    if (reduceMotion.matches) {
      // No wandering: the cats just nap in the corner
      refreshObstacles();
      measureOrigin();
      cats.forEach((cat) => {
        Object.assign(cat, freeSpot(cat));
        play(cat, 'sleep');
        draw(cat);
      });
      setDoorFrame(0);
      return;
    }
    measureOrigin();
    last = performance.now();
    requestAnimationFrame(tick);
  }

  reduceMotion.addEventListener('change', start);
  start();
})();
