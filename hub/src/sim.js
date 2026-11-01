// Simulated drivers so features can be tested solo.
// Positions are in game-world meters (x east, z south), like ETS2 telemetry.

const ROUTES = [
  // A big loop the local player drives when there is no telemetry.
  [[0, 0], [6000, 0], [9000, 3000], [9000, 9000], [4000, 11000], [-2000, 8000], [-3000, 3000]],
  // A loop that crosses route A, so bots pass in and out of range.
  [[2000, -4000], [7000, -1000], [8000, 6000], [3000, 9000], [-1000, 4000]],
  // A long outer loop for far-away drivers.
  [[-12000, -10000], [15000, -9000], [18000, 14000], [-10000, 16000]]
];

const BOTS = [
  { name: 'Ollie_Haulage', truck: 'Scania S', cargo: 'Frozen food' },
  { name: 'BigRigBecky', truck: 'Volvo FH', cargo: 'Steel coils' },
  { name: 'NightOwlTom', truck: 'DAF XG+', cargo: 'Furniture' },
  { name: 'Kasia_PL', truck: 'MAN TGX', cargo: 'Fresh produce' },
  { name: 'Dutchie_Rens', truck: 'Renault T', cargo: 'Chemicals' },
  { name: 'GearGrinderGaz', truck: 'Iveco S-Way', cargo: 'Timber' },
  { name: 'Mo_Moves', truck: 'Mercedes Actros', cargo: 'Electronics' },
  { name: 'LisboaLu', truck: 'Volvo FH16', cargo: 'Cork' }
];

const CHAT_LINES = [
  'Evening all', 'Anyone heading north?', 'Traffic is heavy near the toll',
  'Just dropped off, grabbing a new job', 'Fuel prices are wild today', 'gg everyone',
  'Taking a break at the services', 'Who wants to convoy to the coast?'
];

const CB_LINES = [
  'Breaker breaker, slow traffic ahead', 'Coming up on your left, mind the gap',
  'Police on the bridge, keep it legal', 'Nice paint job, driver', 'Roadworks next junction',
  'Thanks for letting me in', 'Weigh station is open', 'Watch out, accident on the hard shoulder'
];

const pick = arr => arr[Math.floor(Math.random() * arr.length)];

function routeLength(route) {
  let len = 0;
  for (let i = 0; i < route.length; i++) {
    const [ax, az] = route[i];
    const [bx, bz] = route[(i + 1) % route.length];
    len += Math.hypot(bx - ax, bz - az);
  }
  return len;
}

// Returns position and heading (radians, 0 = north) at a distance along a looped route.
function pointAlong(route, dist) {
  dist = ((dist % routeLength(route)) + routeLength(route)) % routeLength(route);
  for (let i = 0; i < route.length; i++) {
    const [ax, az] = route[i];
    const [bx, bz] = route[(i + 1) % route.length];
    const seg = Math.hypot(bx - ax, bz - az);
    if (dist <= seg) {
      const t = dist / seg;
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, heading: Math.atan2(bx - ax, -(bz - az)) };
    }
    dist -= seg;
  }
  return { x: route[0][0], z: route[0][1], heading: 0 };
}

class Driver {
  constructor({ id, name, truck, cargo, route, offset, kmh, reverse }) {
    Object.assign(this, { id, name, truck, cargo, route, kmh, reverse });
    this.dist = offset;
    this.isBot = true;
    this.update(0);
  }

  update(dtSec, origin = { x: 0, z: 0 }) {
    const kmh = this.kmh * (0.85 + Math.random() * 0.3);
    this.dist += (this.reverse ? -1 : 1) * (kmh / 3.6) * dtSec;
    const p = pointAlong(this.route, this.dist);
    this.x = origin.x + p.x;
    this.z = origin.z + p.z;
    this.heading = this.reverse ? p.heading + Math.PI : p.heading;
    this.speedKmh = Math.round(kmh);
  }
}

export function createSimulation({ bots, onChat, onCb }) {
  const drivers = BOTS.slice(0, bots).map((b, i) => {
    const route = ROUTES[i % ROUTES.length];
    return new Driver({
      id: `bot-${i}`, ...b, route,
      offset: (routeLength(route) / bots) * (i + 0.5),
      kmh: 60 + Math.random() * 30,
      reverse: i % 2 === 1
    });
  });

  // Simulated local player, used until real telemetry arrives.
  const self = new Driver({ id: 'self-sim', name: 'You', truck: 'Scania R', cargo: 'Test load', route: ROUTES[0], offset: 0, kmh: 80, reverse: false });
  self.isBot = false;

  // Bots drive around this point. It moves to wherever the real player is, so they stay nearby.
  const origin = { x: 0, z: 0 };

  let last = Date.now();
  const tick = () => {
    const now = Date.now();
    const dt = (now - last) / 1000;
    last = now;
    drivers.forEach(d => d.update(dt, origin));
    self.update(dt, origin);
  };

  const followPlayer = (x, z) => {
    if (Math.hypot(x - origin.x - 3000, z - origin.z - 4000) > 15000) {
      origin.x = x - 3000;
      origin.z = z - 4000;
    }
  };

  const chatter = () => {
    if (!drivers.length) return;
    const d = pick(drivers);
    if (Math.random() < 0.5) onChat(d, pick(CHAT_LINES));
    else onCb(d, pick(CB_LINES));
  };

  const timers = [setInterval(tick, 1000), setInterval(chatter, 12000)];
  const replyTo = name => pick([
    `Copy that, ${name}`, `Loud and clear, ${name}`, `Roger, ${name}, see you down the road`, `10-4, ${name}`
  ]);

  return { drivers, self, replyTo, followPlayer, stop: () => timers.forEach(clearInterval) };
}
