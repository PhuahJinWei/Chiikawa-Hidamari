// The furniture, as actual geometry.
//
// Everything else that stands on a surface in this app is a card, and that is
// the right answer for everything else. It is the wrong answer here, and the
// reason is specific: a billboard turns to face you, so a table you walk around
// turns with you. Measured by circling one at two metres — the drawing came out
// pixel-identical across an 86 degree arc while the room behind it slid past.
// Nothing about that reads as a table; it reads as a sticker on the lens.
//
// The rule the app actually follows, once you have somewhere to walk around
// things in, is: CARDS FOR WHAT YOU LOOK AT, GEOMETRY FOR WHAT YOU MOVE AROUND.
// The planet is geometry because you stand on it. The room's shell is geometry
// because you stand inside it. The house stays a card because you only ever see
// it from across a field, among sixty other cards, and one solid thing among
// them would make every one of them look flat. A table in a small room is the
// one thing here you genuinely orbit, so it is the one prop that has to be
// real.
//
// The cast STAYS cards. Paper actors in a real room is the arrangement this
// whole app already is, and it is a look rather than a compromise.
//
// ---------------------------------------------------------------- the line
//
// What makes these read as drawn rather than as models is the heavy ink line,
// and it is not a texture — it is a second copy of each shape, fractionally
// fatter, with its faces turned inside out. Only the inside of that shell is
// drawn, so it survives exactly where it pokes out past the real one and is
// hidden everywhere else, which is a silhouette. It costs one extra draw per
// part and no shader.
//
// Each outline is built at its OWN size rather than by scaling the mesh up.
// Scaling is the usual trick and it is wrong for anything long and thin: a leg
// scaled by six percent grows six percent in LENGTH too, so it sinks through
// the floor and pokes up through the tabletop it is holding. Generating the
// shape twice costs nothing here — this file is making the geometry anyway.

import * as THREE from 'three';
import { CONFIG, PAL } from './config.js';

// How fat the ink shell is, in world units. Constant rather than proportional,
// because a drawn line has one weight whatever it is drawing round — a thicker
// line on the table than on the stool would read as the table being nearer.
const INK = 0.016;

// ...with one exception, and it is a real one rather than a fudge.
//
// "One weight whatever it is drawing round" was written for the table and the
// stool, which are the same order of size. It stops holding when the sizes
// stop being comparable. Chiikawa's bear is a fifth of the table across, so the
// room's pen lands at nearly a tenth of its whole width — measured on a render
// at 7.7% — and it comes out as a black lump with some fur showing through.
// The reference draws its own line at about 2.4% of the bear, which is what a
// line is: a proportion of the thing it describes, and the constant is only a
// good approximation of that while everything is one size.
//
// So: still one PEN — same material, same colour, same shared draw — held a
// little finer for the one thing in here small enough to need it. It reads as
// slightly further off than the table, which for a toy sat on a bed across the
// room is not a lie.
const INK_SMALL = 0.007;

// Shared: nothing about the ink varies per part, so one material serves the
// whole room and three.js can batch them.
let inkMat = null;
function ink() {
  if (!inkMat) {
    inkMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(PAL.furnitureInk),
      side: THREE.BackSide,
    });
  }
  return inkMat;
}

// UNLIT, like everything else standing in this world. These were Lambert while
// the room was a separate scene with its own lights aimed in through the
// windows; on the planet there is one fixed sun and the house stands across
// the terminator from it, so a lit table indoors would render in shadow all
// day — the exact trap the house shell already documented and dodged. The ink
// outline carries the shape; the hour's colour comes from the interior tint.
function fillMat(colour) {
  const m = new THREE.MeshBasicMaterial({
    color: new THREE.Color(colour),
  });
  // The colour it is, kept aside from the colour it is currently WEARING.
  //
  // Everything else the interior tints carries its own colour in a texture, so
  // the material's `color` is free to be the tint and the tinting simply
  // writes it. These have no texture — the colour IS the material — so being
  // written to turns a pink table white the first time the hour is applied.
  // Recorded here so the tint can multiply instead of overwrite.
  m.userData.baseColor = new THREE.Color(colour);
  return m;
}

// A part and its outline, added together so they can never come apart. `make`
// is called twice — once at true size and once fattened — which is why it takes
// the padding rather than the caller building two geometries by hand.
function part(group, make, mat, place, weight) {
  const fill = new THREE.Mesh(make(0), mat);
  const line = new THREE.Mesh(make(weight || INK), ink());
  if (place) { place(fill); place(line); }
  group.add(line);
  group.add(fill);
  return fill;
}

// A leg: a tapered cylinder leaning out from where it meets the top. Splayed by
// rotating the whole leg about its attachment, so the join stays put and only
// the foot travels — which is what makes them look like they are holding
// something up rather than like they were posted through it.
// Legs are drawn in the ink rather than in the piece's own colour, and that is
// how the reference has them: the top is a shape and the legs are strokes. A
// leg painted the same pink as the table above it reads as a pink stick holding
// up a pink disc — correct, and nothing like a drawing. Nearly-black also means
// the outline shell around a leg does no work, which is why they can be as thin
// as they are without turning into a smudge.
let legMatCache = null;
function legMat() {
  if (!legMatCache) legMatCache = fillMat(PAL.furnitureInk);
  return legMatCache;
}

function leg(group, x, z, len, rTop, rBot, splay, mat) {
  const pivot = new THREE.Group();
  // At the TOP, where the leg meets what it is holding — not on the floor.
  // The leg hangs downward from here, so a pivot at y=0 puts the whole leg
  // underneath the room: measured at -0.659 to +0.026 against a floor at 0,
  // which is why the table looked like a floating disc with no legs at all.
  pivot.position.set(x, len, z);

  // YXZ so the tilt happens in the leg's OWN frame and the bearing swings it
  // afterwards. Under the default XYZ the bearing is applied first and the
  // tilt then leans the leg about a world axis, which splays every leg
  // sideways around the table instead of outwards from it.
  const out = Math.atan2(x, z);
  pivot.rotation.order = 'YXZ';
  pivot.rotation.set(-splay, out, 0);
  group.add(pivot);

  // Lengthened by the lean, so a splayed leg still reaches the floor rather
  // than stopping short of it by a cosine.
  const L = len / Math.cos(splay);
  part(pivot, (pad) => new THREE.CylinderGeometry(rTop + pad, rBot + pad, L + pad * 2, 7),
    legMat(), (m) => { m.position.y = -L / 2; });
  return pivot;
}

// The oval top of a table or a stool: a cylinder squashed on one axis. Padding
// has to be added to the RADIUS before the squash and to the height after, or
// the ink comes out thicker along the wide axis than the narrow one.
function ovalTop(group, rx, rz, thick, y, mat) {
  return part(group, (pad) => {
    const g = new THREE.CylinderGeometry(1, 0.97, thick + pad * 2, 26);
    g.scale(rx + pad, 1, rz + pad);
    return g;
  }, mat, (m) => { m.position.y = y + thick / 2; });
}

// --------------------------------------------------------------- the pieces
//
// `h` is the height in world units and everything else follows from it, so a
// table and a doll's table are the same numbers at two scales.

export function buildTable(h) {
  const g = new THREE.Group();
  const topPink = fillMat(PAL.furniturePink);
  const rimPink = fillMat(
    new THREE.Color(PAL.furniturePink).multiplyScalar(0.82),
  );
  const white = fillMat(PAL.furniturePaper);
  const rx = h * 1.22;
  const rz = h * 0.78;
  const rimH = h * 0.14;
  const legTop = h - rimH;

  // Four thin white wire legs. Each is one continuous tube: it drops almost
  // straight from the underside, bends outward along the floor, then curls
  // upward at the tip. Separate cylinders cannot make the little J-shaped
  // feet that distinguish this table in the anime.
  const legR = h * 0.030;
  for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    const x = sx * rx * 0.61;
    const z = sz * rz * 0.57;
    const outward = new THREE.Vector2(x, z).normalize();
    const hook = h * 0.12;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x, legTop + h * 0.010, z),
      new THREE.Vector3(
        x + outward.x * h * 0.012, h * 0.27,
        z + outward.y * h * 0.012,
      ),
      new THREE.Vector3(
        x + outward.x * h * 0.030, h * 0.075,
        z + outward.y * h * 0.030,
      ),
      new THREE.Vector3(
        x + outward.x * hook * 0.55, h * 0.025,
        z + outward.y * hook * 0.55,
      ),
      new THREE.Vector3(
        x + outward.x * hook, h * 0.055,
        z + outward.y * hook,
      ),
      new THREE.Vector3(
        x + outward.x * hook * 1.10, h * 0.125,
        z + outward.y * hook * 1.10,
      ),
    ]);
    part(g, (pad) => new THREE.TubeGeometry(
      curve, 28, legR + pad, 9, false,
    ), white, null, INK_SMALL);
  }

  // The darker oval is the visible edge band. A shallow, slightly smaller
  // ellipsoid rises through it to make the pale top gently padded instead of
  // looking like a flat cylinder.
  ovalTop(g, rx, rz, rimH, legTop, rimPink);
  const capRise = h * 0.050;
  part(g, (pad) => {
    const s = new THREE.SphereGeometry(1, 34, 18);
    s.scale(rx * 0.965 + pad, capRise + pad, rz * 0.965 + pad);
    return s;
  }, topPink, (m) => {
    m.position.y = h - capRise * 0.20;
  });

  // The leg material is shared across every piece, so it is registered once by
  // whoever is built first — handing it back from each of them would have the
  // room tint it three times over on every hour change.
  return {
    group: g,
    fills: [topPink, rimPink, white, legMat()],
    top: h + capRise * 0.80,
    rx,
    rz,
  };
}

// ----------------------------------------------------------- the open book
//
// A book left OPEN rather than a closed box with a line painted down it. Each
// cover and page half is its own curved slab: the gutter sits low, the paper
// rises gently through the middle, and the outer corners pull inward. The ink
// drawings are real tubes laid over that surface, so they remain visible after
// the book is picked up and viewed from another angle.
export function buildOpenBook(h) {
  const g = new THREE.Group();
  const cover = fillMat(PAL.openBookCover);
  const paper = fillMat(PAL.openBookPaper);
  const edge = fillMat(PAL.openBookEdge);
  const dark = legMat();

  const halfW = h * 1.18;
  const halfD = h * 0.79;
  const gutter = h * 0.025;
  const coverThick = h * 0.040;
  const pageThick = h * 0.070;
  const pageBase = h * 0.045;

  const arch = (u, zNorm, pages) => {
    const crown = Math.sin(Math.min(1, u) * Math.PI * 0.95);
    const edgeCurl = zNorm * zNorm;
    if (pages) {
      return h * (0.016 + crown * 0.090 + u * 0.016 + edgeCurl * 0.010);
    }
    return h * (crown * 0.050 + u * 0.012 + edgeCurl * 0.006);
  };

  const halfGeometry = (side, pages, pad) => {
    const outer = halfW * (pages ? 0.965 : 1.02) + pad;
    const inner = Math.max(0.001, gutter - pad);
    const depth = halfD * (pages ? 0.965 : 1.03) + pad;
    const thick = (pages ? pageThick : coverThick) + pad * 2;
    const base = pages ? pageBase : 0;
    const width = outer - inner;
    const centre = side * (inner + width / 2);
    const geo = new THREE.BoxGeometry(width, thick, depth * 2, 12, 1, 10);
    geo.translate(centre, base + (pages ? pageThick : coverThick) / 2, 0);

    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const u = Math.max(0, Math.min(1, (Math.abs(x) - inner) / width));
      const zNorm = Math.max(-1, Math.min(1, z / depth));
      // Pull only the outer corners inward, leaving the gutter straight.
      const cornerT = Math.max(0, (Math.abs(zNorm) - 0.72) / 0.28);
      const corner = h * 0.060 * cornerT * cornerT * u * u * u;
      p.setX(i, x - side * corner);
      p.setY(i, p.getY(i) + arch(u, zNorm, pages));
    }
    geo.computeVertexNormals();
    return geo;
  };

  for (const side of [-1, 1]) {
    part(g, (pad) => halfGeometry(side, false, pad), cover, null, INK_SMALL);
    part(g, (pad) => halfGeometry(side, true, pad), paper, null, INK_SMALL);
  }

  const pageTop = (x, z) => {
    const u = Math.max(0, Math.min(
      1, (Math.abs(x) - gutter) / (halfW * 0.965 - gutter),
    ));
    return pageBase + pageThick
      + arch(u, z / (halfD * 0.965), true)
      + h * 0.004;
  };

  const stroke = (pairs, material = dark, radius = h * 0.011) => {
    const points = pairs.map(([x, z]) => (
      new THREE.Vector3(x, pageTop(x, z), z)
    ));
    const curve = new THREE.CatmullRomCurve3(points);
    g.add(new THREE.Mesh(
      new THREE.TubeGeometry(curve, Math.max(5, pairs.length * 3), radius, 6, false),
      material,
    ));
  };

  // A jointed pen stroke for pointed diagrams. Catmull-Rom is right for
  // handwriting, but it rounds the three weed tips into soft leaves; straight
  // segments keep those tips crisp while the tube itself keeps the ink round.
  const polyStroke = (pairs, radius = h * 0.011) => {
    const points = pairs.map(([x, z]) => (
      new THREE.Vector3(x, pageTop(x, z), z)
    ));
    const path = new THREE.CurvePath();
    for (let i = 1; i < points.length; i++) {
      path.add(new THREE.LineCurve3(points[i - 1], points[i]));
    }
    g.add(new THREE.Mesh(
      new THREE.TubeGeometry(path, Math.max(8, pairs.length * 3), radius, 7, false),
      dark,
    ));
  };

  // The warm stack lines along the front edges: enough to say "many pages"
  // without striping the whole book.
  for (const side of [-1, 1]) {
    for (const inset of [0.00, 0.025]) {
      const pairs = [];
      for (let i = 0; i <= 7; i++) {
        const u = i / 7;
        const x = side * (gutter + u * (halfW * 0.94 - gutter));
        const z = -halfD * (0.925 - inset);
        pairs.push([x, z]);
      }
      stroke(pairs, edge, h * 0.007);
    }
  }

  // Centre crease.
  stroke([
    [-h * 0.004, -halfD * 0.76],
    [0, 0],
    [h * 0.004, halfD * 0.76],
  ], edge, h * 0.008);

  // Wavy writing lines, deliberately abstract: the drawings are the page's
  // subject and these only need to read as notes beside them.
  const writing = (cx, cz, width) => stroke([
    [cx - width / 2, cz - h * 0.006],
    [cx - width * 0.18, cz + h * 0.005],
    [cx + width * 0.12, cz - h * 0.004],
    [cx + width / 2, cz + h * 0.004],
  ], dark, h * 0.0085);

  writing(-halfW * 0.36, -halfD * 0.55, halfW * 0.34);
  writing(-halfW * 0.34, -halfD * 0.34, halfW * 0.29);
  writing(-halfW * 0.66, halfD * 0.15, halfW * 0.30);
  writing(-halfW * 0.35, halfD * 0.58, halfW * 0.34);
  writing(halfW * 0.67, -halfD * 0.50, halfW * 0.31);
  writing(halfW * 0.68, -halfD * 0.27, halfW * 0.27);
  writing(halfW * 0.34, halfD * 0.10, halfW * 0.29);
  writing(halfW * 0.62, halfD * 0.58, halfW * 0.32);

  // The reference's defining symbol: a rounded weed base with three separate
  // triangular tips. It is a closed outline, not three stems, so it still
  // reads as the same icon at the book's small in-room scale.
  const weed = (cx, cz, width, depth) => {
    const p = [
      [-0.34, 0.32], [-0.52, 0.10], [-0.50, -0.40],
      [-0.18, -0.07], [0.00, -0.56], [0.16, -0.06],
      [0.50, -0.38], [0.47, 0.12], [0.30, 0.37],
      [0.00, 0.48], [-0.30, 0.38], [-0.34, 0.32],
    ];
    polyStroke(p.map(([x, z]) => [cx + x * width, cz + z * depth]), h * 0.011);
  };

  weed(-halfW * 0.72, -halfD * 0.46, h * 0.30, h * 0.28);
  weed(-halfW * 0.39, halfD * 0.26, h * 0.34, h * 0.32);
  weed(halfW * 0.39, -halfD * 0.38, h * 0.37, h * 0.35);
  weed(halfW * 0.70, halfD * 0.32, h * 0.30, h * 0.28);

  // Small bent arrows pointing back toward two specimens.
  polyStroke([
    [-halfW * 0.67, halfD * 0.42],
    [-halfW * 0.58, halfD * 0.34],
    [-halfW * 0.66, halfD * 0.30],
  ], h * 0.009);
  polyStroke([
    [halfW * 0.65, -halfD * 0.58],
    [halfW * 0.54, -halfD * 0.48],
    [halfW * 0.63, -halfD * 0.44],
  ], h * 0.009);

  return {
    group: g,
    // `dark` is the shared furniture pen and the table already registers it.
    fills: [cover, paper, edge],
    top: pageTop(halfW * 0.54, 0),
    rx: halfW * 1.02,
    rz: halfD * 1.03,
  };
}

export function buildStool(h) {
  const g = new THREE.Group();
  const mat = fillMat(PAL.furnitureBlue);
  const r = h * 0.46;
  const thick = h * 0.10;
  const legLen = h - thick;

  for (const a of [0.4, 2.5, 4.6]) {
    leg(g, Math.sin(a) * r * 0.86, Math.cos(a) * r * 0.86,
      legLen, h * 0.042, h * 0.032, 0.30, mat);
  }
  ovalTop(g, r, r * 0.92, thick, legLen, mat);
  return { group: g, fills: [mat], top: legLen + thick, rx: r, rz: r * 0.92 };
}

// ----------------------------------------------------------------- fluff
//
// A puffy slab: one closed surface, rounded-rectangular in plan, with soft
// bumps pushed out around its rim.
//
// ONE SURFACE PER LAYER, and it has to be, because of the ink. The line here
// is an inverted hull — a second copy of each MESH, turned inside out. Build a
// single duvet out of six overlapping balls and you have six meshes, so six
// outlines, and the outline round a ball half-buried in the next one is still
// drawn across the buried part: nothing about a hull knows what is in front of
// it. Every seam comes out inked, and what should read as one soft mass reads
// as a bag of balls with the construction lines left on. So the bumps are made
// in the SURFACE instead, and a layer has exactly one silhouette.
//
// Across layers the opposite is true, and that is why the futon is three
// meshes rather than one: the reference draws a full line between them, and
// those are separate objects. The rule is not "never overlap meshes", it is:
// one mesh per thing you would draw a line around.
//
// AND THEN THEY MUST NOT TOUCH, which is the part that is not obvious and cost
// this piece two rebuilds. An inverted hull draws a SILHOUETTE, not an
// intersection. The shell is only ever visible in the thin ring outside where a
// surface turns away from you; everywhere else it is inside its own mesh and
// depth-tested away. So where two of these interpenetrate, neither one is at a
// silhouette — both are facing you, the depth buffer simply picks the nearer,
// and the boundary between them comes out as a bare seam between two whites
// with NO LINE ON IT AT ALL. The pillow's shell there is buried in the
// comforter and the comforter's is buried in the pillow.
//
// Nothing about the geometry of either layer can fix that, and raising one of
// them only moves where they merge. A post pass over the depth buffer would,
// and there is no post pass in this app and no reason to grow one for a futon.
// What fixes it is separation: hold the layers clear of each other and each has
// a real silhouette against whatever is behind it, so each gets its whole line.
// The arrangement below is built around that constraint rather than around what
// looks right in plan — see the note on the comforter.
//
// Built by hand rather than from SphereGeometry, and only because of the seam.
// A UV sphere duplicates its whole first column of vertices to give the two
// sides of the wrap different texture coordinates, and the ink shell is pushed
// out along VERTEX NORMALS — which are averaged per vertex, so a duplicated
// pair averages different neighbours and pushes two slightly different ways.
// That is a hairline split up the side of the outline. There is no texture on
// any of this, so there is nothing the seam was buying: the ring simply wraps
// with a modulo and the split cannot happen.
//
// Normals rather than radius for the padding, unlike every other piece here.
// Radial padding is right for a shape that is round about its own middle and
// wrong for these twice over: a slab is squashed, so a radial step comes out
// fat along the long axis and thin across it — the same error `ovalTop`
// documents — and on the flank of a bump the radius points along the surface
// rather than out of it, which thins the line exactly where the shape is most
// interesting. The normal is the direction "out of the surface" by definition,
// and it costs one pass over the vertices.

// How boxy the plan is. A duvet folded on a floor is a rounded RECTANGLE seen
// from above, not an oval, and an oval was the first thing built here: it read
// as a pouffe. The exponent is only in x and z — vertically these stay
// elliptical, because a slab with a flat top and a hard shoulder needs rings
// concentrated at the shoulder to render, and the sphere's own parametrisation
// puts them at the poles instead. Rounded in section, rectangular in plan.
function superRadius(dx, dy, dz, rx, ry, rz, box) {
  const ax = Math.pow(Math.abs(dx) / rx, box);
  const az = Math.pow(Math.abs(dz) / rz, box);
  const ay = dy / ry;
  return 1 / Math.sqrt(Math.pow(ax + az, 2 / box) + ay * ay);
}

// Deterministic irregularity. Bedding is somebody's, dumped, and different
// every time you look at it; evenly spaced bumps of one size read as a machined
// thing — a gear, a flower. Random would do it, but this is built once at load
// and a shape that differs between two runs cannot be judged against a
// drawing, so the wobble is a fixed table read at coprime strides. It is long
// enough and the strides are odd enough that no rim of fifteen-odd bumps ever
// shows the repeat.
const WOBBLE = [1.00, 0.82, 1.14, 0.91, 1.06, 0.78, 1.20, 0.95, 1.09, 0.86, 1.16, 0.99];
const wob = (k, stride) => WOBBLE[(k * stride) % WOBBLE.length];

// ---------------------------------------------------------------- the ticks
//
// The little pen scuffs everything in this world wears — a pair of short
// strokes, tilted, here and there on a surface. The house's walls and floor
// have had them since they were drawn (markCluster in art.js); this is the same
// mark for things that are BUILT rather than painted, and it follows that
// painter deliberately: one to three strokes, stacked, tilted about a tenth of
// a radian, soft rather than ink-weight. Two marks in one world should be one
// mark.
//
// GEOMETRY, because there is nowhere else to put them. Everything painted gets
// its marks in its texture; nothing built here has a texture, or even texture
// COORDINATES — `fluff` drops the UV seam on purpose so the ink shell has no
// hairline split up its side. So a tick is four vertices lying just off the
// surface, and all of a piece's ticks are merged into one geometry: one mesh,
// one draw, however many marks it wears.
//
// Placed by sampling the piece's OWN triangles, which is what makes this work
// on anything. It needs no knowledge of what it is marking — a box's flat faces
// and a futon's lumpy rim are both just triangles with normals — so a new piece
// gets its scuffs with one line and no per-shape thinking.

// How much darker a mark is than the thing it is on.
//
// A FRACTION, not a colour, and that is the whole reason this works across the
// room: the same mark has to sit on cardboard, on white bedding and on a pink
// table without being picked three times. The wall painter gets the same effect
// with alpha over a fixed grey; opaque geometry cannot, so it multiplies.
//
// AND IT MULTIPLIES IN LINEAR LIGHT, NOT IN THE NUMBERS YOU TYPE. three.js
// converts a hex through sRGB on the way in and back on the way out, so a
// scalar here does not do what it looks like it does: this read 0.80 first and
// measured out as 0.90 of the colour on screen, a tenth where the wall's own
// marks are a fifth. The two are related by roughly the 2.2 gamma — a screen
// ratio of r wants r^2.2 here — and 0.62 is 0.80 of the surface once it lands.
//
// EVERY OTHER SHADE IN THIS FILE HAS THE SAME BEND IN IT, and they were all
// chosen by eye against a render rather than by arithmetic, so they are what
// they look like and should be left alone. It is only worth knowing when a
// number here has to agree with a number somewhere else — as this one does,
// with markCluster in art.js.
const MARK = 0.62;

// A repeatable scatter.
//
// WOBBLE is a hand-authored table of twelve, and it is the right thing where it
// is used: a rim of lobes wants a designer's irregularity, not noise. It is the
// wrong thing for throwing marks at a surface. Twelve values indexed at a
// stride sharing a factor with twelve collapses to FOUR — which is how two of
// eighteen scuffs on the box came out at the same point to the millimetre.
//
// Still fully repeatable, which is the property that actually matters: the same
// piece must come out the same every run or it cannot be judged against a
// drawing twice.
//
// Math.imul and the final unsigned shift are both load-bearing. `*` on two
// 32-bit numbers overflows the 53 bits a double can hold exactly, and `^` in
// this language hands back a SIGNED int — so the obvious spelling of this
// returns roughly -0.5 to 0.5. It did, and the damage was not subtle: every
// roll took its lowest branch, and negative barycentric coordinates put marks
// outside the triangles that were meant to carry them. Measured at 0.22 of a
// world unit off the side of the box, hanging in the air.
function hash01(i) {
  let x = Math.imul(i, 2654435761) >>> 0;
  x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0;
  x ^= x >>> 13; x = Math.imul(x, 3266489917) >>> 0;
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

function markMat(base) {
  return fillMat(new THREE.Color().copy(base).multiplyScalar(MARK));
}

const _AXIS_X = new THREE.Vector3(1, 0, 0);
const _AXIS_Z = new THREE.Vector3(0, 0, 1);

function scuffs(geo, opts) {
  const up = opts.up || new THREE.Vector3(0, 1, 0);
  const minUp = opts.minUp !== undefined ? opts.minUp : -0.15;
  const count = opts.count || 12;
  const len = opts.len;
  const weight = opts.weight;
  const lift = opts.lift !== undefined ? opts.lift : 0.0016;
  const seed = opts.seed || 0;

  const P = geo.attributes.position;
  const I = geo.index ? geo.index.array : null;
  const nTri = I ? I.length / 3 : P.count / 3;

  // Candidate triangles: everything turned far enough toward the room to be
  // seen. `minUp` is against the piece's own up, so a piece that is laid down
  // later — the bear — hands in the axis it was MODELLED against and gets its
  // marks on the faces that will end up showing.
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), n = new THREE.Vector3();
  const cand = [];
  let total = 0;
  for (let t = 0; t < nTri; t++) {
    const ia = I ? I[t * 3] : t * 3;
    const ib = I ? I[t * 3 + 1] : t * 3 + 1;
    const ic = I ? I[t * 3 + 2] : t * 3 + 2;
    A.fromBufferAttribute(P, ia); B.fromBufferAttribute(P, ib); C.fromBufferAttribute(P, ic);
    e1.subVectors(B, A); e2.subVectors(C, A);
    n.crossVectors(e1, e2);
    const area2 = n.length();
    if (area2 < 1e-12) continue;
    n.divideScalar(area2);
    if (n.dot(up) < minUp) continue;
    total += area2;
    cand.push({ a: A.clone(), e1: e1.clone(), e2: e2.clone(), n: n.clone(), run: total });
  }
  if (!cand.length) return null;

  // BY AREA, not one per triangle. A box is twelve triangles and a futon layer
  // is five thousand: picking triangles round-robin would put every mark on a
  // box at the middle of a face, and would bunch a futon's marks wherever its
  // mesh happens to be dense. Walking the accumulated area instead spreads them
  // over the surface itself, whatever it is made of.
  const pos = [], idx = [];
  const vUp = new THREE.Vector3(), vRt = new THREE.Vector3();
  const dir = new THREE.Vector3(), per = new THREE.Vector3(), at = new THREE.Vector3();
  const push = (v) => { pos.push(v.x, v.y, v.z); };

  for (let k = 0; k < count; k++) {
    const want = total * ((k + 0.5) / count);
    let lo = 0, hi = cand.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (cand[m].run < want) lo = m + 1; else hi = m; }
    const s = cand[lo];

    // A point inside that triangle, pulled toward its middle so a mark can
    // never hang off an edge into the air.
    // Clamped as well as folded. Barycentric coordinates that leave [0,1] put
    // a mark somewhere its triangle is not, and the whole point of sampling the
    // piece's own mesh is that a mark cannot end up off the piece.
    let u = Math.min(1, Math.max(0, hash01(k * 3 + seed * 977 + 1)));
    let v = Math.min(1, Math.max(0, hash01(k * 3 + seed * 977 + 2)));
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    u = 1 / 3 + (u - 1 / 3) * 0.78;
    v = 1 / 3 + (v - 1 / 3) * 0.78;
    at.copy(s.a).addScaledVector(s.e1, u).addScaledVector(s.e2, v).addScaledVector(s.n, lift);

    // A frame lying in the surface: up along it, across it. On a face turned at
    // the sky there is no "up along it" to be had, so any tangent will do —
    // nothing about a tick cares which way round it is, only that its own
    // strokes agree with each other.
    //
    // The fallback has to work for EVERY normal, which the obvious one does
    // not: (n.z, 0, -n.x) is itself zero for a face pointing straight up, and a
    // zero tangent makes zero-area quads. That is invisible rather than wrong-
    // looking, so it cost nothing to spot and everything to miss — the lid of
    // the box, the face you look at most, was carrying ten marks with no area.
    // Crossing against whichever world axis the normal is least like cannot
    // degenerate.
    vUp.copy(up).addScaledVector(s.n, -up.dot(s.n));
    if (vUp.lengthSq() < 0.02) {
      vUp.crossVectors(s.n, Math.abs(s.n.x) < 0.9 ? _AXIS_X : _AXIS_Z);
    }
    vUp.normalize();
    vRt.crossVectors(vUp, s.n).normalize();

    // One to three, weighted the way the wall painter weights them.
    const roll = hash01(k * 3 + seed * 977 + 3);
    const strokes = roll < 0.20 ? 1 : roll < 0.72 ? 2 : 3;
    for (let i = 0; i < strokes; i++) {
      const r = (j) => hash01((k * 8 + i) * 7 + seed * 977 + j);
      const L = len * (0.70 + 0.55 * r(4));
      const tilt = (r(5) - 0.5) * 0.20;
      const ct = Math.cos(tilt), st = Math.sin(tilt);
      dir.copy(vRt).multiplyScalar(ct).addScaledVector(vUp, st);
      per.copy(vRt).multiplyScalar(-st).addScaledVector(vUp, ct);
      const oy = (i - (strokes - 1) / 2) * len * 0.34;
      const ox = (r(6) - 0.5) * len * 0.34;
      const base = pos.length / 3;
      const c0 = at.clone().addScaledVector(vUp, oy).addScaledVector(vRt, ox);
      push(c0.clone().addScaledVector(dir, -L / 2).addScaledVector(per, -weight / 2));
      push(c0.clone().addScaledVector(dir, L / 2).addScaledVector(per, -weight / 2));
      push(c0.clone().addScaledVector(dir, L / 2).addScaledVector(per, weight / 2));
      push(c0.clone().addScaledVector(dir, -L / 2).addScaledVector(per, weight / 2));
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setIndex(idx);
  return out;
}

// The bumps, spaced evenly along the RIM rather than evenly in angle.
//
// They are not the same thing on a shape half again as long as it is wide, and
// the difference is the whole reason this walks the outline instead of stepping
// a bearing. Equal angles put a bump every 0.25 of rim along the sides and
// every 0.62 at the ends — two and a half to one — so the scallops merge into
// a smooth edge in one place and gape into scoops in another. Walking it costs
// a loop at load and nothing at all afterwards.
//
// Sized and placed in WORLD units, not in angles, for the same reason: a bump
// is a bump, and the one on the end of the futon should be the size of the one
// on the side. Amplitudes measured in angle come out proportional to the local
// radius, which on this shape is half again bigger at the ends.
function rimBumps(n, rx, rz, box, amp) {
  // One lap, finely, measuring as it goes.
  const S = 720;
  const p = [];
  for (let i = 0; i <= S; i++) {
    const t = (i / S) * Math.PI * 2;
    const s = superRadius(Math.sin(t), 0, Math.cos(t), rx, 1, rz, box);
    p.push([Math.sin(t) * s, Math.cos(t) * s]);
  }
  const run = [0];
  for (let i = 1; i <= S; i++) {
    run.push(run[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
  }

  const step = run[S] / n;
  const out = [];
  let i = 0;
  for (let k = 0; k < n; k++) {
    const want = (k + 0.35 * (wob(k, 11) - 1)) * step;
    while (i < S && run[i + 1] < want) i++;
    // Reach, against the gap to the next one, and the ONE number that must not
    // drift below a half: the bumps are combined with a max rather than a sum,
    // so their circles have to overlap or the rim drops back to bare wall
    // between them with a vertical cliff on either side. 0.56 keeps a clear
    // margin over that while still leaving the notch between two bumps deep.
    // The wobble is deliberately weak here for the same reason and does its
    // work on the amplitude instead.
    const r = step * (0.56 + 0.10 * (wob(k, 7) - 1));
    out.push({
      x: p[i][0],
      z: p[i][1],
      // Riding a little up and down the rim rather than all on one line, which
      // is the difference between bedding and a cog.
      y: (wob(k, 3) - 1) * r * 0.6,
      r,
      // As a FRACTION of the bump's own reach, so a lobe is always about as
      // deep as it is wide however many of them are asked for. It was an
      // absolute length and that made the lobe count and the lobe shape two
      // knobs that had to be turned together to keep either right.
      a: r * amp * wob(k, 5),
    });
  }
  return out;
}

// A bump is measured as a distance in the plan and pushes the surface
// SIDEWAYS, which makes it a vertical scallop running the height of the rim
// rather than a ball stuck on the edge. Measured as a plain 3D distance it
// would round over the top too, and the reference is emphatic that these
// layers are flat on top and fluffy only at the edge. `TALL` is how much
// further a bump reaches vertically than horizontally, and at this value one
// covers the full height of any of the three layers.
const TALL = 0.42;

function fluff(spec, pad) {
  // Resolution is set by the bumps, not by taste: the narrowest of them spans
  // about eight columns here, which is the point where the ink line round a
  // scallop stops looking chipped. It was 104 while the bumps were shallower
  // and that read as a chipped edge the moment they were deepened, which is
  // the giveaway that this number is downstream of `amp` and `n` rather than
  // free. Three layers at this density is some 23k vertices for the whole
  // piece — the only geometry in an app that is otherwise cards, and it is
  // spent on the one thing in the room you can walk all the way around.
  // Per-spec, defaulting to what a futon layer needs. A bear's ear is a
  // twentieth of the size with no bumps on it at all and would be four
  // thousand vertices of perfectly smooth sphere at the futon's density.
  const RINGS = spec.rings || 30;
  const COLS = spec.cols || 160;
  const { rx, ry, rz, box, flat, cx, cy, cz } = spec;
  const bumps = spec.bumps || [];
  const pos = [];
  const idx = [];

  const put = (ph, th) => {
    const dx = Math.sin(ph) * Math.sin(th);
    const dy = Math.cos(ph);
    const dz = Math.sin(ph) * Math.cos(th);
    const s = superRadius(dx, dy, dz, rx, ry, rz, box);
    let x = dx * s;
    let z = dz * s;
    // The underside pressed, and only the underside. Half of a slab is a half
    // nobody can see, and pressing it also means the layer meets what is below
    // it over a patch rather than along a line — which is what makes it look
    // like it has weight on it.
    let y = dy * s;
    if (y < 0) y *= flat;

    // THE UNION OF THE BUMPS, not their sum, and this is what makes the edge
    // read as drawn rather than as quilted.
    //
    // A cloud outline is a row of overlapping CIRCLES: each lobe is most of a
    // disc, and where two of them cross the line comes to a notch. Added
    // together with a soft falloff — which is what this did first — the lobes
    // blend into one continuous swell and the rim comes out as a ripple, wavy
    // but nowhere scalloped. Taking the largest instead gives exactly the union
    // of the circles, notches and all, and a circular profile rather than a
    // bell gives each lobe a round face instead of a soft shoulder.
    //
    // The notches are creases, and creases are usually a thing to avoid. Not
    // here: nothing under this roof is lit, so a crease cannot shade wrong, and
    // the only place it shows is the silhouette — which is the one place it is
    // wanted.
    let push = 0;
    for (const b of bumps) {
      const ex = x - b.x;
      const ez = z - b.z;
      const ey = (y - b.y) * TALL;
      const t = (ex * ex + ez * ez + ey * ey) / (b.r * b.r);
      if (t < 1) {
        const v = b.a * Math.sqrt(1 - t);
        if (v > push) push = v;
      }
    }
    if (push) {
      // Outward in the plan only. At the very top of the layer this direction
      // does not exist, and nor does it need to: the crown is further from
      // every bump than any of them reaches.
      const h = Math.hypot(x, z);
      if (h > 1e-6) { x += (x / h) * push; z += (z / h) * push; }
    }
    pos.push(cx + x, cy + y, cz + z);
  };

  // Poles are single vertices rather than a collapsed ring: a ring of
  // co-located points is a fan of zero-area triangles, and a zero-area
  // triangle has no normal to contribute, so the ink shell would have nothing
  // to push the crown out along.
  put(0, 0);
  for (let i = 1; i < RINGS; i++) {
    for (let j = 0; j < COLS; j++) {
      put((i / RINGS) * Math.PI, (j / COLS) * Math.PI * 2);
    }
  }
  put(Math.PI, 0);

  const ring = (i) => 1 + (i - 1) * COLS;
  const bot = 1 + (RINGS - 1) * COLS;
  for (let j = 0; j < COLS; j++) {
    const k = (j + 1) % COLS;
    idx.push(0, ring(1) + j, ring(1) + k);
    idx.push(bot, ring(RINGS - 1) + k, ring(RINGS - 1) + j);
  }
  for (let i = 1; i < RINGS - 1; i++) {
    for (let j = 0; j < COLS; j++) {
      const k = (j + 1) % COLS;
      const a = ring(i) + j;
      const b = ring(i) + k;
      const c = ring(i + 1) + k;
      const e = ring(i + 1) + j;
      idx.push(a, e, c, a, c, b);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (pad) {
    const P = g.attributes.position;
    const N = g.attributes.normal;
    for (let i = 0; i < P.count; i++) {
      P.setXYZ(i,
        P.getX(i) + N.getX(i) * pad,
        P.getY(i) + N.getY(i) * pad,
        P.getZ(i) + N.getZ(i) * pad);
    }
  }
  return g;
}

// The futon: somebody's bedding, left where they got out of it.
//
// THREE LAYERS, from the reference — a base to lie on, a comforter thrown over
// most of it, and a pillow at one end. It was one mound first and that was the
// thing wrong with it: a single heap reads as a beanbag, and what makes a pile
// of bedding legible as bedding is that you can count the pieces. Each layer
// only has to clear the one under it by enough to draw a line, and the line
// does the rest.
//
// Everything is measured against the base's own footprint rather than against
// `h` directly, so the three stay in their arrangement if the piece is resized
// or the base is redrawn. The offsets are the arrangement: the comforter is
// pulled toward the foot and toward the front, the pillow sits at the head and
// toward the back, and what is left over is the rim of base you see all the way
// round — widest at the back, where the comforter has been pulled away from it.
export function buildFuton(h) {
  const g = new THREE.Group();
  // The plan, and the number every other measurement here is taken against.
  //
  // Pulled in hard from a first pass at 1.78 by 1.23. Nothing was wrong with
  // those as a footprint — they were a good futon — but a layer's thickness is
  // read against its own width, and three slabs each a fifth as thick as they
  // were wide came out as a stack of PLATES. The fix is not to thicken them
  // until the piece is a mattress you would need a step for; it is to make the
  // footprint smaller, so the same modest height reads as bedding. It is also
  // the honest size: these are small round characters and one curled up on this
  // is about a metre and a half of futon, not two.
  // The base's own footprint, and it is set by ARITHMETIC now rather than by
  // eye: the comforter and the pillow may not overlap, so the base has to be
  // long enough to seat both of them end to end with a gap between and a rim
  // left over at each end. At 1.292 it was not, and that is the whole reason
  // they were touching.
  const RX = h * 1.38;
  const RZ = h * 0.960;

  // ONE WHITE, and one material carrying it for all three layers.
  //
  // They were a few percent apart — pile darkest, pillow brightest — from when
  // the three overlapped and a line alone was a thin thing to hang three stacked
  // shapes on. They do not overlap any more: there is a real gap between the
  // comforter and the pillow and a rim of base showing all the way round, so
  // every layer meets its neighbour at a genuine silhouette and gets a genuine
  // ink line. The ramp had nothing left to do, and one material for three meshes
  // is one material.
  const white = fillMat(PAL.furnitureFuton);

  // How ROUND a lobe is, as a fraction of its own reach — near enough to one
  // that each is most of a disc, which is how the reference draws them. Below
  // about a half they flatten back into a wavy line. This is dimensionless, so
  // it holds whatever size the piece is built at and whatever lobe count a
  // layer asks for; the counts below are the only thing setting how BIG the
  // lobes are.
  const BUMP = 0.85;

  const LAYERS = [
    {
      // The base. Lowest, largest and thinnest, and the only one that touches
      // the floor — so the only one that is pressed hard underneath and sunk a
      // little into it, for the reason the cushion is sunk: a soft thing
      // resting exactly on the ground reads as hard. It also swallows the gap a
      // flat base leaves on a curved floor, the room's own being a cap of a
      // sphere of radius 8.
      //
      // `ry` against `rx` is the number that decides whether ANY of this reads
      // as bedding, and it is the one that has been wrong twice. The section
      // through a layer is an ellipse — `box` only rounds the corners in plan —
      // so a layer a fifth as thick as it is wide domes by a fifth of nothing
      // and comes out as a PLATE. Each of these is now nearer a third, and the
      // three of them stack into something with a shape rather than a stack of
      // outlines.
      // Thinner and finer-lobed than it was. The reference draws a MATTRESS —
      // a low pad the other two sit on — where this was nearly as deep as the
      // comforter and read as a third quilt. Its scallops went from sixteen to
      // twenty-two for the same reason: at sixteen they were the size of the
      // pillow's whole end, which is a cloud rather than a quilted edge.
      rx: RX, rz: RZ, ry: h * 0.30, box: 3.6,
      cx: 0, cz: 0, cy: h * 0.135, flat: 0.55,
      n: 22, amp: BUMP,
    },
    {
      // The comforter. The puffiest of the three and the top of the piece.
      //
      // ON THE CENTRELINE, which is the whole of what was wrong before. It used
      // to be pulled off the base toward the foot AND toward the room — a
      // diagonal shove — so the bedding sat askew on its own mattress and the
      // rim of base was fat on two sides and nothing on the other two. The
      // reference lays all three out on ONE axis: everything is centred across
      // the bed and only ever moves along it. That is what makes it read as
      // made rather than as dropped.
      //
      // Its length is still a REMAINDER, not a choice — rim, pillow, gap,
      // comforter, rim, all of which has to fit inside the base's own valley
      // rather than its peak, since a rim that exists only where two bumps line
      // up is not a rim. And near enough square in plan, which surprised me
      // until I measured the drawing: a folded duvet is as broad as it is long.
      rx: RX * 0.520, rz: RZ * 0.760, ry: h * 0.42, box: 3.0,
      cx: -RX * 0.290, cz: 0, cy: h * 0.58, flat: 0.80,
      n: 18, amp: BUMP,
    },
    {
      // The pillow. At the head end, clear of the comforter, and level with it.
      //
      // Both of those were the other way round one revision ago and both were
      // wrong. It sat lower, on the reasoning that a pillow level with a heaped
      // duvet reads as a second duvet — sound, and checked against a reference
      // drawn from ABOVE rather than against the view you stand at, where a
      // layer both behind the comforter and shorter than it never breaks its
      // outline. Raising it past the comforter fixed the outline and fixed
      // nothing else, because the two still met INSIDE each other, where no
      // hull can draw (see the note at the top of this section).
      //
      // So: a real gap, and the same crown as the comforter. It is thinner
      // rather than shorter — less loft, lifted to meet — because two puffs of
      // one height with a strip of base showing between them is what the
      // reference actually shows, and the height was never what separated them.
      //
      // Squarer and wider across than along, because that is which way a pillow
      // lies on a bed, and it is what stops a third rounded rectangle reading
      // as a third rounded rectangle.
      //
      // Centred and LOWER again. It was nudged to the back of the bed and
      // raised to the comforter's own crown, both to solve a merge that the gap
      // has since solved properly — with a real strip of mattress between them
      // there is nothing left for the height to fix, and the reference is plain
      // that the pillow sits below the heap. Half as wide as the bed and a
      // fifth of its length, sitting square at the head.
      rx: RX * 0.185, rz: RZ * 0.440, ry: h * 0.30, box: 2.8,
      cx: RX * 0.630, cz: 0, cy: h * 0.56, flat: 0.85,
      n: 11, amp: BUMP,
    },
  ];

  // NO SCUFFS on this one. The ticks are the world's own texture and nearly
  // everything built here should wear them, but bedding is the exception: a
  // scuff is a mark of use on a hard surface, and on fresh white cloth it reads
  // as a stain rather than as wear.
  const box = new THREE.Box3();
  for (const L of LAYERS) {
    const spec = { ...L, bumps: rimBumps(L.n, L.rx, L.rz, L.box, L.amp) };
    const fill = part(g, (pad) => fluff(spec, pad), white);
    fill.geometry.computeBoundingBox();
    box.union(fill.geometry.boundingBox);
  }

  // MEASURED off the geometry rather than predicted from `h`. The bumps and the
  // three layers' offsets are what set the real extent and they are numbers
  // somebody will edit; a guess here would leave the shadow behind the moment
  // one of them moved, which is the exact thing `top` coming back from the
  // builder exists to prevent.
  return {
    group: g,
    fills: [white],
    top: box.max.y,
    rx: Math.max(box.max.x, -box.min.x),
    rz: Math.max(box.max.z, -box.min.z),
  };
}

// -------------------------------------------------------- Hachiware's bedding
//
// A worn sleeping mat with the comforter folded at one end. This is NOT
// Chiikawa's cloud-edged futon in cheaper colours: Hachiware's brown base is
// nearly rag-thin, and the white comforter is a tired double layer with broad
// slumps instead of scallops. Both still use the futon's one-surface cloth
// geometry so their ink remains a single drawn silhouette.
export function buildWornBedding(h) {
  const g = new THREE.Group();
  const mat = fillMat(PAL.wornBeddingMat);
  const cloth = fillMat(PAL.wornBeddingCloth);
  const matWear = markMat(new THREE.Color(PAL.wornBeddingMat));
  const clothWear = markMat(new THREE.Color(PAL.wornBeddingCloth));

  // Long and narrow in plan, matching the sheet and the side-on anime frames.
  // It stays this size because the cave placement and walkable gap were composed
  // around it; the remodelling is in its section and edge language, not its
  // footprint.
  const L = h * 4.10;
  const W = h * 1.55;
  const matSpec = {
    rx: L / 2,
    rz: W / 2,
    ry: h * 0.045,
    box: 8.0,
    cx: 0,
    cz: 0,
    cy: h * 0.017,
    flat: 0.38,
    // A crooked fabric perimeter, not the regular little lobes of a fresh futon.
    n: 22,
    amp: 0.10,
    rings: 18,
    cols: 168,
  };
  matSpec.bumps = rimBumps(
    matSpec.n, matSpec.rx, matSpec.rz, matSpec.box, matSpec.amp);
  const matFill = part(g, (pad) => fluff(matSpec, pad), mat, null, INK * 0.78);

  // The comforter is folded crosswise once. Two separate, shallow slabs keep the
  // doubled edge readable from every side, but a small gap leaves both inverted
  // ink hulls visible instead of merging them into one pillow-shaped mound.
  // The upper half overhangs by only a few centimetres and both halves keep
  // nearly smooth rims: old cloth sags, it does not bloom into cloud lobes.
  const matTop = matSpec.cy + matSpec.ry;
  const lower = {
    rx: h * 0.82,
    rz: h * 0.64,
    ry: h * 0.060,
    box: 5.2,
    cx: -L * 0.265,
    cz: h * 0.025,
    cy: matTop + h * 0.045,
    flat: 0.62,
    n: 12,
    amp: 0.18,
    rings: 22,
    cols: 128,
  };
  lower.bumps = rimBumps(lower.n, lower.rx, lower.rz, lower.box, lower.amp);
  const lowerFill = part(g, (pad) => fluff(lower, pad), cloth, null, INK * 0.88);

  const lowerTop = lower.cy + lower.ry;
  const upper = {
    rx: h * 0.86,
    rz: h * 0.66,
    ry: h * 0.085,
    box: 4.8,
    cx: -L * 0.275,
    cz: -h * 0.025,
    cy: lowerTop + h * 0.060,
    flat: 0.60,
    n: 11,
    amp: 0.22,
    rings: 24,
    cols: 136,
  };
  upper.bumps = rimBumps(upper.n, upper.rx, upper.rz, upper.box, upper.amp);
  const upperFill = part(g, (pad) => fluff(upper, pad), cloth, null, INK * 0.88);

  // The one long fold stroke visible in the reference sheet. It rides the crown
  // rather than floating at a fixed height, and bows just enough to keep it from
  // looking like upholstery piping.
  const crownY = (spec, x, z) => {
    const ax = Math.pow(Math.abs((x - spec.cx) / spec.rx), spec.box);
    const az = Math.pow(Math.abs((z - spec.cz) / spec.rz), spec.box);
    const plan = Math.pow(ax + az, 2 / spec.box);
    return spec.cy + spec.ry * Math.sqrt(Math.max(0, 1 - plan));
  };
  const foldPoints = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const x = upper.cx + (t - 0.5) * upper.rx * 1.38;
    const z = upper.cz + upper.rz * (0.27 + Math.sin(t * Math.PI) * 0.025);
    foldPoints.push(new THREE.Vector3(
      x,
      crownY(upper, x, z) + h * 0.007,
      z,
    ));
  }
  g.add(new THREE.Mesh(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(foldPoints), 24, h * 0.006, 5, false),
    clothWear,
  ));

  // Worn ticks on both materials. Unlike Chiikawa's fresh futon, the reference
  // deliberately scatters faded strokes over the mat and the folded cloth.
  const addWear = (fill, material, opts) => {
    const geo = scuffs(fill.geometry, opts);
    if (!geo) return;
    const mesh = new THREE.Mesh(geo, material);
    g.add(mesh);
  };
  addWear(matFill, matWear, {
    count: 14,
    len: h * 0.095,
    weight: h * 0.009,
    minUp: 0.45,
    lift: h * 0.006,
    seed: 67,
  });
  addWear(lowerFill, clothWear, {
    count: 5,
    len: h * 0.075,
    weight: h * 0.010,
    minUp: 0.24,
    lift: h * 0.006,
    seed: 71,
  });
  addWear(upperFill, clothWear, {
    count: 7,
    len: h * 0.080,
    weight: h * 0.010,
    minUp: 0.24,
    lift: h * 0.006,
    seed: 79,
  });

  // A handful of loose fibres at the mat's perimeter. Each is a bent stroke
  // growing out from the edge, sparse enough to read as wear rather than fur.
  const fibre = (x, z, dx, dz, bend) => {
    const path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x, h * 0.028, z),
      new THREE.Vector3(x + dx * 0.55, h * (0.026 + bend), z + dz * 0.55),
      new THREE.Vector3(x + dx, h * 0.022, z + dz),
    ]);
    g.add(new THREE.Mesh(
      new THREE.TubeGeometry(path, 7, h * 0.0065, 5, false),
      matWear,
    ));
  };
  fibre(-L * 0.47, W * 0.48, -h * 0.10, h * 0.025, 0.020);
  fibre(-L * 0.18, -W * 0.50, -h * 0.025, -h * 0.095, 0.014);
  fibre(L * 0.18, W * 0.50, h * 0.030, h * 0.085, 0.018);
  fibre(L * 0.47, -W * 0.42, h * 0.095, -h * 0.040, 0.012);
  fibre(L * 0.49, W * 0.18, h * 0.090, h * 0.018, 0.016);

  const box = new THREE.Box3();
  for (const fill of [matFill, lowerFill, upperFill]) {
    fill.geometry.computeBoundingBox();
    box.union(fill.geometry.boundingBox);
  }
  return {
    group: g,
    fills: [mat, cloth, matWear, clothWear],
    top: box.max.y,
    rx: Math.max(box.max.x, -box.min.x),
    rz: Math.max(box.max.z, -box.min.z),
  };
}

// ---------------------------------------------------------- sasumata weapons
//
// A rounded shaft ending in a U-shaped capture fork. The fork is genuinely
// open geometry rather than a flat silhouette, so its twelve white teeth and
// the space between the jaws survive both on the floor and in the carried view.
function buildSasumata(h, bodyColour, highlightColour) {
  const g = new THREE.Group();
  const body = fillMat(bodyColour);
  const highlight = fillMat(highlightColour);
  const white = fillMat(PAL.furniturePaper);

  const L = h * 3.80;
  const left = -L / 2;
  const right = L / 2;
  const join = left + h * 1.34;
  const gripStart = right - h * 0.66;
  const r = h * 0.073;
  const y = r;

  const tube = (curve, radius, material, segments, weight = INK * 0.74) => (
    part(
      g,
      (pad) => new THREE.TubeGeometry(
        curve, segments, radius + pad, 10, false),
      material,
      null,
      weight,
    )
  );
  const ball = (x, z, radius, material) => part(
    g,
    (pad) => new THREE.SphereGeometry(radius + pad, 14, 10),
    material,
    (m) => m.position.set(x, y, z),
    INK * 0.74,
  );

  // Pink shaft up to the white end grip.
  const shaft = new THREE.LineCurve3(
    new THREE.Vector3(join - h * 0.04, y, 0),
    new THREE.Vector3(gripStart + h * 0.025, y, 0),
  );
  tube(shaft, r, body, 48);

  // Two mirrored jaws. Their tips bend gently away from the opening, matching
  // the top and perspective views rather than ending as parallel prongs.
  const forkPoints = (side) => [
    new THREE.Vector3(join + h * 0.06, y, 0),
    new THREE.Vector3(join - h * 0.10, y, side * h * 0.18),
    new THREE.Vector3(join - h * 0.34, y, side * h * 0.40),
    new THREE.Vector3(left + h * 0.56, y, side * h * 0.51),
    new THREE.Vector3(left + h * 0.19, y, side * h * 0.52),
    new THREE.Vector3(left, y, side * h * 0.62),
  ];
  const topPoints = forkPoints(1);
  const bottomPoints = forkPoints(-1);
  const topFork = new THREE.CatmullRomCurve3(topPoints);
  const bottomFork = new THREE.CatmullRomCurve3(bottomPoints);
  tube(topFork, r * 1.08, body, 64);
  tube(bottomFork, r * 1.08, body, 64);
  ball(join, 0, r * 1.16, body);
  ball(left, h * 0.62, r * 1.08, body);
  ball(left, -h * 0.62, r * 1.08, body);

  // White grip, a touch broader than the shaft, with a dark join ring.
  const grip = new THREE.LineCurve3(
    new THREE.Vector3(gripStart, y, 0),
    new THREE.Vector3(right - h * 0.06, y, 0),
  );
  tube(grip, r * 1.06, white, 24);
  ball(right - h * 0.06, 0, r * 1.06, white);
  const collar = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 1.15, r * 1.15, h * 0.025, 12),
    legMat(),
  );
  collar.rotation.z = Math.PI / 2;
  collar.position.set(gripStart, y, 0);
  g.add(collar);

  // Six inward-facing and six outward-facing triangular teeth. Cones make the
  // top view triangular while retaining a real narrow side profile in the
  // reference's left/right elevations.
  const toothH = h * 0.19;
  const toothR = h * 0.066;
  const teeth = [
    [left + h * 0.34, h * 0.51],
    [left + h * 0.68, h * 0.50],
    [left + h * 1.00, h * 0.39],
  ];
  const tooth = (x, z, side, direction) => {
    const centre = z + side * direction * (r * 1.03 + toothH / 2);
    part(
      g,
      (pad) => new THREE.ConeGeometry(
        toothR + pad * 0.55, toothH + pad * 1.2, 3),
      white,
      (m) => {
        m.position.set(x, y, centre);
        const pointsPositiveZ = side * direction > 0;
        m.rotation.x = pointsPositiveZ ? Math.PI / 2 : -Math.PI / 2;
      },
      INK * 0.60,
    );
  };
  for (const [x, z] of teeth) {
    tooth(x, z, 1, -1);
    tooth(x, -z, -1, -1);
    tooth(x, z, 1, 1);
    tooth(x, -z, -1, 1);
  }

  // A narrow pale stripe along the crown gives the solid pink the same soft
  // highlight the modeling sheet paints down the shaft and both prongs.
  const shineTube = (curve, segments) => {
    const points = [];
    for (let i = 0; i <= segments; i++) {
      const p = curve.getPoint(i / segments);
      points.push(new THREE.Vector3(p.x, y + r * 0.94, p.z - r * 0.18));
    }
    g.add(new THREE.Mesh(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points), segments, r * 0.15, 6, false),
      highlight,
    ));
  };
  shineTube(shaft, 24);
  shineTube(topFork, 32);
  shineTube(bottomFork, 32);

  g.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(g);
  return {
    group: g,
    fills: [body, highlight, white],
    top: box.max.y,
    rx: Math.max(box.max.x, -box.min.x),
    rz: Math.max(box.max.z, -box.min.z),
  };
}

export function buildPinkWeapon(h) {
  return buildSasumata(h, PAL.weaponPink, PAL.weaponPinkHighlight);
}

export function buildBlueWeapon(h) {
  return buildSasumata(h, PAL.weaponBlue, PAL.weaponBlueHighlight);
}

// ---------------------------------------------------------- Chiikawa's key
//
// A broad, friendly house key rather than a realistic pin key: rounded square
// head, square opening, short shaft, and two blocky teeth. It is modelled flat
// in the XZ plane so it can lie on the floor; the held copy turns that face
// toward the player in main.js.
export function buildHouseKey(size) {
  const g = new THREE.Group();
  const gold = fillMat(PAL.houseKey);

  // `size` is the finished longest dimension. The outline and bevel grow just
  // outside the authored silhouette, so the yellow core is slightly shorter.
  const L = size * 0.965;
  const thick = size * 0.065;
  const line = size * 0.018;

  const keyShape = (outerScale = 1, holeScale = 1) => {
    const s = outerScale;
    const x = (n) => n * L * s;
    const z = (n) => n * L * s;
    const shape = new THREE.Shape();

    // Start at the flat end of the shaft and trace the lower edge into the
    // rounded head, then return along the toothed edge.
    shape.moveTo(x(-0.52), z(-0.090));
    shape.lineTo(x(0.025), z(-0.090));
    shape.quadraticCurveTo(x(0.060), z(-0.090), x(0.078), z(-0.125));
    shape.lineTo(x(0.105), z(-0.185));
    shape.quadraticCurveTo(x(0.125), z(-0.235), x(0.190), z(-0.245));
    shape.lineTo(x(0.350), z(-0.245));
    shape.quadraticCurveTo(x(0.475), z(-0.245), x(0.485), z(-0.120));
    shape.lineTo(x(0.485), z(0.120));
    shape.quadraticCurveTo(x(0.475), z(0.245), x(0.350), z(0.245));
    shape.lineTo(x(0.190), z(0.245));
    shape.quadraticCurveTo(x(0.125), z(0.235), x(0.105), z(0.185));
    shape.lineTo(x(0.078), z(0.125));
    shape.quadraticCurveTo(x(0.060), z(0.090), x(0.025), z(0.090));
    shape.lineTo(x(-0.070), z(0.090));
    shape.lineTo(x(-0.070), z(0.165));
    shape.quadraticCurveTo(x(-0.070), z(0.180), x(-0.090), z(0.180));
    shape.lineTo(x(-0.205), z(0.180));
    shape.quadraticCurveTo(x(-0.225), z(0.180), x(-0.225), z(0.160));
    shape.lineTo(x(-0.225), z(0.105));
    shape.lineTo(x(-0.300), z(0.105));
    shape.lineTo(x(-0.300), z(0.160));
    shape.quadraticCurveTo(x(-0.300), z(0.180), x(-0.320), z(0.180));
    shape.lineTo(x(-0.435), z(0.180));
    shape.quadraticCurveTo(x(-0.455), z(0.180), x(-0.455), z(0.160));
    shape.lineTo(x(-0.455), z(0.090));
    shape.lineTo(x(-0.52), z(0.090));
    shape.quadraticCurveTo(x(-0.535), z(0.090), x(-0.535), z(0.070));
    shape.lineTo(x(-0.535), z(-0.070));
    shape.quadraticCurveTo(x(-0.535), z(-0.090), x(-0.52), z(-0.090));
    shape.closePath();

    // Clockwise rounded square cut-out. The ink copy uses a slightly smaller
    // hole, leaving the same dark line around the opening as around the edge.
    const hole = new THREE.Path();
    const cx = x(0.295);
    const hw = L * 0.067 * holeScale;
    const hh = L * 0.060 * holeScale;
    const r = L * 0.012 * holeScale;
    hole.moveTo(cx - hw + r, hh);
    hole.lineTo(cx + hw - r, hh);
    hole.quadraticCurveTo(cx + hw, hh, cx + hw, hh - r);
    hole.lineTo(cx + hw, -hh + r);
    hole.quadraticCurveTo(cx + hw, -hh, cx + hw - r, -hh);
    hole.lineTo(cx - hw + r, -hh);
    hole.quadraticCurveTo(cx - hw, -hh, cx - hw, -hh + r);
    hole.lineTo(cx - hw, hh - r);
    hole.quadraticCurveTo(cx - hw, hh, cx - hw + r, hh);
    hole.closePath();
    shape.holes.push(hole);
    return shape;
  };

  const extruded = (shape, depth, bevel, rise = 0) => {
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth,
      steps: 1,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: bevel,
      bevelThickness: bevel,
      curveSegments: 8,
    });
    geo.translate(0, 0, rise);
    geo.rotateX(-Math.PI / 2);
    geo.computeVertexNormals();
    return geo;
  };

  // The ink shell is a real, slightly larger key with a smaller opening. The
  // yellow copy sits level with its top, exposing a clean outline on the outer
  // silhouette, inside the square hole, and along the visible sidewall.
  const inkDepth = thick + line;
  const outline = new THREE.Mesh(
    extruded(keyShape(1.025, 0.76), inkDepth, line * 0.44),
    ink(),
  );
  const fill = new THREE.Mesh(
    extruded(keyShape(), thick, line * 0.30, line),
    gold,
  );
  g.add(outline, fill);

  g.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(g);
  return {
    group: g,
    fills: [gold],
    top: box.max.y,
    rx: Math.max(box.max.x, -box.min.x),
    rz: Math.max(box.max.z, -box.min.z),
  };
}

// ------------------------------------------------------------- the plushie
//
// A small bear: Chiikawa's, and it belongs on the futon.
//
// GEOMETRY RATHER THAN A CARD, and that follows the rule at the top of this
// file rather than a preference. It sits on the futon, and the futon is the
// one thing in here you genuinely orbit — a billboard standing on it would
// turn as you walked round and read as a sticker on the lens, which is the
// exact failure the tables were made solid to avoid. The cast get to stay
// paper because they are the cast. A toy on a bed is furniture.
//
// It is assembled the way the reference DRAWS it: one round mass carrying the
// head and body together with no seam between them, and every other piece a
// separate lump poking out of that. Not a shortcut — it is what the drawing
// does. There is no line across the middle of the bear, and there is a line
// round every ear, arm and leg.
//
// Separate meshes give exactly that here, for a reason the futon had to learn
// the hard way. A lump STICKING OUT of the body meets it at that lump's own
// silhouette, with the body sitting behind — so the hull is against something
// farther away and draws. The futon's comforter and pillow had no line between
// them because they met side-on INSIDE each other, where neither surface is at
// a silhouette at all. Poking out works; crossing does not. Every part below is
// seated well into the mass for that reason, rather than balanced against it.

// Where the front of a flat part is, at a given point across it. The face is
// laid out in the head's OWN x and y and the depth solved for, rather than
// aimed at by a direction from the middle — on a shape this flat a direction is
// useless for placing anything: swing a bearing thirty degrees off centre and
// it still lands almost dead ahead, because there is nearly no side to hit.
// Two eyes aimed that way came out all but stacked on top of each other.
function faceZ(B, x, y) {
  const a = 1 - (y / B.ry) ** 2;
  if (a <= 0) return 0;
  const t = Math.pow(a, B.box / 2) - Math.pow(Math.abs(x) / B.rx, B.box);
  return t <= 0 ? 0 : B.rz * Math.pow(t, 1 / B.box);
}

// A flattened disc, lying in its own xy and thin along z.
//
// Finer than its size suggests it needs, and for a reason that is not about the
// disc itself: every one of these is half-buried in the head, so what you
// actually see is the CUT between two surfaces. A coarse sphere is perfectly
// smooth on its own and comes out with a notched, chewed edge the moment
// something slices it. The eyes read as inkblots at twenty segments.
function lensGeo(rx, ry, thick) {
  const g = new THREE.SphereGeometry(1, 30, 20);
  g.scale(rx, ry, thick);
  return g;
}

export function buildPlushie(h) {
  const g = new THREE.Group();
  const fur = fillMat(PAL.plushieFur);
  const pale = fillMat(PAL.plushieMouth);
  // The dark is the room's own pen, already shared by every leg in here.
  const dark = legMat();

  // MODELLED STANDING AND THEN LAID DOWN, in one move at the end.
  //
  // A dropped toy is the awkward thing to author directly: every part would
  // carry the tip in its own numbers and the whole arrangement would have to be
  // reasoned about in a frame nothing about a bear is natural in. Upright it is
  // just a bear, and `up` tips the finished thing onto its back afterwards.
  //
  // On its BACK, face to the ceiling, which is the one pose where the outline
  // you see from the room IS the drawing — this is a flat plush and its
  // silhouette is the whole design. Face down would be a brown lump.
  const up = new THREE.Group();
  up.rotation.x = -Math.PI / 2;
  g.add(up);

  // A HEAD AND A BODY, not one mass. The sketch is explicit about it, and the
  // pinch between them is most of what makes this a bear rather than a blob
  // with ears. Two overlapping lumps give that pinch for free in the union's
  // outline — and give it with NO LINE across the middle, which is also what
  // the sketch draws: the outline runs unbroken through the waist. That is the
  // one place on this piece where two parts meeting side-on inside each other
  // is exactly what is wanted.
  //
  // Flat. `rz` is a little over a third of `rx` on both, so it reads as a
  // stuffed thing pressed between two hands rather than as a ball, and so it
  // lies down to something you look ACROSS rather than a dome you look at.
  const HEAD = {
    rx: h * 0.34, ry: h * 0.26, rz: h * 0.14, box: 2.2,
    cx: 0, cy: h * 0.72, cz: 0, flat: 1.0, rings: 20, cols: 30,
  };
  const BODY = {
    rx: h * 0.25, ry: h * 0.25, rz: h * 0.125, box: 2.3,
    cx: 0, cy: h * 0.29, cz: 0, flat: 1.0, rings: 20, cols: 30,
  };

  // Limbs hang off the BODY — arms at its shoulders just under the waist, legs
  // off its bottom corners. That is the whole of what was wrong before: they
  // were pinned to the widest part of one big sphere, which is a starfish.
  //
  // Ears sit BEHIND the head and the limbs sit in FRONT of the body, and the
  // difference is deliberate. A lump pushed back has the head's own hull cross
  // in front of it, so its outline merges into the head's — which is how an ear
  // is drawn. A lump pulled forward meets the body at its own silhouette with
  // the body behind, so its hull draws a complete line across the fill — which
  // is how a limb over a body is drawn. Depth is doing the linework.
  const LUMPS = [
    HEAD,
    BODY,
    // A shade apart in size and height: two identical ears read as machined.
    { rx: h * 0.095, ry: h * 0.090, rz: h * 0.060, box: 2.0, cx: -h * 0.235, cy: h * 0.925, cz: -h * 0.035, flat: 1.0, rings: 12, cols: 20 },
    { rx: h * 0.080, ry: h * 0.076, rz: h * 0.054, box: 2.0, cx: h * 0.220, cy: h * 0.950, cz: -h * 0.035, flat: 1.0, rings: 12, cols: 20 },
    { rx: h * 0.080, ry: h * 0.065, rz: h * 0.055, box: 2.0, cx: -h * 0.260, cy: h * 0.400, cz: h * 0.030, flat: 1.0, rings: 12, cols: 20 },
    { rx: h * 0.080, ry: h * 0.065, rz: h * 0.055, box: 2.0, cx: h * 0.260, cy: h * 0.400, cz: h * 0.030, flat: 1.0, rings: 12, cols: 20 },
    { rx: h * 0.085, ry: h * 0.075, rz: h * 0.058, box: 2.0, cx: -h * 0.160, cy: h * 0.095, cz: h * 0.030, flat: 1.0, rings: 12, cols: 20 },
    { rx: h * 0.085, ry: h * 0.075, rz: h * 0.058, box: 2.0, cx: h * 0.160, cy: h * 0.095, cz: h * 0.030, flat: 1.0, rings: 12, cols: 20 },
  ];
  // NO SCUFFS on this one either, and for the same reason as the bedding: the
  // ticks read as wear on a hard surface, and a toy is neither hard nor a
  // surface. It is also the smallest thing in the room, so a mark that reads as
  // texture on a box reads as damage on a bear.
  for (const L of LUMPS) part(up, (pad) => fluff(L, pad), fur, null, INK_SMALL);

  // ------------------------------------------------------------- the face
  //
  // THE ONE THING HERE THAT WEARS NO INK, and it is a matter of scale rather
  // than of style.
  //
  // INK is 0.016 of the world and deliberately does not scale: a drawn line has
  // one weight whatever it is drawing round, and a line that thinned on small
  // things would read as those things being further away. On a bear half a unit
  // long that is already a fat pen. On an EYE it is bigger than the eye — a dot
  // two hundredths across, inside a shell adding sixteen thousandths on every
  // side, is not a dot, it is a blot.
  //
  // So the face is drawn the way the reference draws it rather than the way the
  // furniture is built. The eyes need no outline because they already ARE the
  // outline's colour. The mouth is a pale shape laid on a slightly larger dark
  // one, and the dark left showing around the edge IS its line — at whatever
  // weight it is given, which is the only way to get a line proportional to a
  // thing this small without giving the room two pens.
  //
  // All of it lies flat along z with no tilt of its own, because the head IS
  // flat: across the mouth's whole width the front falls away by about a
  // hundredth of the piece, so one flat disc stays seated the whole way over.
  const bit = (geo, mat, x, y, proud) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(HEAD.cx + x, HEAD.cy + y, faceZ(HEAD, x, y) + proud);
    up.add(m);
    return m;
  };

  const eye = lensGeo(h * 0.020, h * 0.024, h * 0.012);
  for (const sx of [-1, 1]) bit(eye, dark, sx * h * 0.155, h * 0.098, -h * 0.004);

  // Dark first, pale on top of it, and the sliver of dark left showing is the
  // ring. Each sits a little prouder than the last so nothing has to fight the
  // depth buffer over a thousandth. The tab is the notch the drawing hangs off
  // the top lip; it runs up out of the pale into the dark on purpose.
  const my = -h * 0.02;
  bit(lensGeo(h * 0.134, h * 0.098, h * 0.020), dark, 0, my, -h * 0.006);
  bit(lensGeo(h * 0.110, h * 0.076, h * 0.020), pale, 0, my, -h * 0.002);
  bit(lensGeo(h * 0.026, h * 0.030, h * 0.020), dark, 0, my + h * 0.048, h * 0.002);

  // Measured off the assembled, tipped-over piece — every number above is in a
  // frame this thing is no longer standing in, so predicting any of it would be
  // predicting through a rotation. Then dropped so it rests ON the floor rather
  // than half through it.
  g.updateMatrixWorld(true);
  const box = new THREE.Box3();
  for (const c of up.children) {
    if (!c.isMesh || c.material === ink()) continue;
    c.geometry.computeBoundingBox();
    box.union(c.geometry.boundingBox.clone().applyMatrix4(c.matrixWorld));
  }
  // CENTRED ON ITS OWN ANCHOR, not left where the modelling frame put it.
  // Standing, this thing grew upward from its feet; laid down that becomes half
  // a bear's length off to one side, and everything the room hands a piece is
  // measured from the anchor — the shadow is a plane centred on it, and `rz`
  // comes back from here as a half-extent. Left uncentred the shadow lands
  // beside the bear and comes out at two and a half times the size it should.
  //
  // And bedded a little into the floor. The room's floor is a cap of a sphere
  // of radius 8 while this rests on a tangent plane, so a piece half a unit
  // long lifts about four thousandths clear at its ends — measured at 0.0079
  // before this line, which is a toy hovering. Sinking it by more than the sag
  // costs nothing: the floor is opaque and nothing here is solid.
  const SINK = 0.008;
  up.position.set(
    -(box.min.x + box.max.x) / 2,
    -box.min.y - SINK,
    -(box.min.z + box.max.z) / 2,
  );
  box.translate(up.position);

  return {
    group: g,
    // Not `dark` — that is legMat, the shared pen, and the rule set where it is
    // made is that it is handed back once, by whoever is built first.
    fills: [fur, pale],
    top: box.max.y,
    rx: Math.max(box.max.x, -box.min.x),
    rz: Math.max(box.max.z, -box.min.z),
  };
}

// ------------------------------------------------------------------ the box
//
// A cardboard box, and the first thing in this room with FLAT FACES MEETING AT
// EDGES — which turns out to decide how it has to be built.
//
// Every other piece here is round, and a round thing gets its whole shape from
// its silhouette, which is exactly what an inverted hull draws. A box does not.
// Stand one in front of you and most of what tells you it is a box is the line
// where its top meets its front — an edge in the MIDDLE of the shape, nowhere
// near the outline. The hull cannot draw that, for the same reason it could not
// draw between the futon's layers: it is only ever visible in the ring outside
// where a surface turns away, and an edge between two faces of one mesh is
// nowhere near that ring. Built like the rest of the furniture, a box comes out
// as a flat tan hexagon with a line round it.
//
// So this one is SHADED instead: BoxGeometry carries a material group per face,
// and each face gets the cardboard multiplied by a different amount — top
// lightest, ends darkest of what you can see. That is not lighting sneaking in
// through the back door. Nothing here is lit and this does not change with the
// hour or the sun; it is the flat tone a drawing gives each face of a box so
// you can tell them apart, which is what the reference does too. The hour's
// tint still multiplies all four, so they move together.
//
// Sharp-edged, where the reference softens its corners a little. At this size
// the ink is a fat enough pen to round them by eye, and rounding them for real
// wants vertices concentrated along twelve edges — which a subdivided box does
// not give you and a superellipsoid gives you in the wrong places.

export function buildBox(h) {
  const g = new THREE.Group();
  // `h` is the height, as it is for the table and the stool. Low and broad,
  // with enough depth for both sealed lid flaps to read from the doorway.
  const L = h * 2.10;
  const D = h * 1.30;

  const card = new THREE.Color(PAL.boxCard);
  const face = (k) => fillMat(new THREE.Color().copy(card).multiplyScalar(k));
  // Top brightest because it is the face turned at the room, ends darkest of
  // the three you can see. The bottom is darker still and nobody will ever
  // check — it is there so the piece is not a lie if it is ever tipped over.
  const top = face(1.08);
  const side = face(0.99);
  const end = face(0.88);
  const under = face(0.82);
  // BoxGeometry's groups run +x, -x, +y, -y, +z, -z.
  const skin = [end, end, top, under, side, side];

  const shell = part(g, (pad) => new THREE.BoxGeometry(L + pad * 2, h + pad * 2, D + pad * 2),
    skin, (m) => { m.position.y = h / 2; });

  // Sparse little wear strokes like the paired pencil ticks in the reference;
  // `minUp` excludes only the underside.
  const scuff = markMat(new THREE.Color().copy(card).multiplyScalar(0.99));
  const marks = scuffs(shell.geometry, {
    count: 10, len: h * 0.055, weight: h * 0.010, minUp: -0.1, seed: 3,
  });
  if (marks) {
    const m = new THREE.Mesh(marks, scuff);
    m.position.y = h / 2;
    g.add(m);
  }

  // The seam where the two flaps meet, running front-to-back along the lid.
  //
  // Real geometry rather than a line, because there is no line to be had: see
  // above. A dark sliver standing a few thousandths proud of the lid, at about
  // the ink's own weight so it reads as the same pen. It is the one mark on
  // this piece that says the box OPENS.
  // Sunk so that only its top face clears the lid, by well under a millimetre
  // of world. Standing it proud instead gives a RIDGE, and a ridge shows its
  // own side and its own end caps: from across the room it came out as two
  // dark dashes with rounded ends rather than one line.
  const seam = new THREE.Mesh(
    new THREE.BoxGeometry(INK * 0.78, h * 0.02, D * 0.98), legMat());
  seam.position.set(0, h - h * 0.02 / 2 + 0.0006, 0);
  g.add(seam);

  // The torn tape holding it shut. It is one strip BENT OVER THE FRONT EDGE:
  // a short section on the lid continues down the front face.
  //
  // Two flat prisms, dark under pale, and the sliver of dark left showing round
  // the edge IS its outline — the same trick the bear's mouth uses and for the
  // same reason. A hull on something this small would be most of the patch.
  //
  // The jag is a fixed table rather than noise, so the tear is the same tear
  // every run and can be judged against the drawing. Torn tape is spiky on the
  // ends it was pulled from and straighter along its sides, which is what the
  // alternating reach below is doing.
  // The tape runs along the seam, so its length is the box's depth and its
  // width crosses the two flaps. Its free ends are ragged while its long sides
  // are the roll's own cut edges and stay
  // straight. Jagging the whole way round was the first attempt and produced a
  // seven-pointed star: a sparkle stuck to a parcel.
  // `inset` is a WORLD distance taken off both axes, not a scale factor. Scaled
  // down by a fraction, the pale piece leaves a ring proportional to the axis it
  // is on — and this patch is nearly twice as long as it is wide, so the torn
  // ends got a fat outline and the sides got almost none.
  const tape = fillMat(PAL.boxTape);
  const tapeX = -L * 0.045;
  const tapeDepth = h * 0.006;
  const outlineInset = h * 0.022;
  const tearX = [-1, -0.65, -0.30, 0.02, 0.34, 0.68, 1];
  const tearReach = [0.05, 0.60, 0.18, 0.78, 0.12, 0.52, 0.04];

  // The top part starts at the front edge and ends in a torn line over the lid.
  const topTape = (inset, depth, mat, y) => {
    const halfW = L * 0.078 - inset;
    const front = D * 0.505 - inset * 0.25;
    const back = D * 0.08 + inset;
    const jag = Math.max(h * 0.018, h * 0.075 - inset * 1.25);
    const pts = [
      new THREE.Vector2(tapeX - halfW, -front),
      new THREE.Vector2(tapeX + halfW, -front),
    ];
    for (let i = tearX.length - 1; i >= 0; i--) {
      pts.push(new THREE.Vector2(
        tapeX + tearX[i] * halfW,
        -(back + tearReach[i] * jag),
      ));
    }
    const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts), {
      depth, bevelEnabled: false, curveSegments: 1,
    });
    // Shape Y becomes world -Z; extrusion becomes world +Y.
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, mat);
    m.position.y = y;
    g.add(m);
  };

  // The front part continues from that same fold and tears off halfway down.
  const frontTape = (inset, depth, mat, z) => {
    const halfW = L * 0.078 - inset;
    const topY = h - inset * 0.25;
    const bottomY = h * 0.53 + inset;
    const jag = Math.max(h * 0.018, h * 0.075 - inset * 1.25);
    const pts = [
      new THREE.Vector2(tapeX - halfW, topY),
      new THREE.Vector2(tapeX + halfW, topY),
      new THREE.Vector2(tapeX + halfW, bottomY),
    ];
    for (let i = tearX.length - 2; i > 0; i--) {
      pts.push(new THREE.Vector2(
        tapeX + tearX[i] * halfW,
        bottomY - tearReach[i] * jag,
      ));
    }
    pts.push(new THREE.Vector2(tapeX - halfW, bottomY));
    const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts), {
      depth, bevelEnabled: false, curveSegments: 1,
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.z = z;
    g.add(m);
  };

  // Dark backing plus a slightly inset pale face makes the same drawn outline
  // on both planes. Together these two planes are one strip bent over the edge.
  topTape(0, tapeDepth, legMat(), h - tapeDepth * 0.55);
  topTape(outlineInset, tapeDepth * 0.72, tape, h + tapeDepth * 0.20);
  frontTape(0, tapeDepth, legMat(), D / 2 - tapeDepth * 0.45);
  frontTape(outlineInset, tapeDepth * 0.72, tape, D / 2 + tapeDepth * 0.20);

  return {
    group: g,
    // legMat is the shared pen and is handed back once, by whoever is built
    // first — the table already does it. Everything else here is this piece's
    // own and has to be registered or it never sees the hour.
    fills: [top, side, end, under, tape, scuff],
    top: h,
    rx: L / 2,
    rz: D / 2,
  };
}

// ------------------------------------------------------------ the trash bag
//
// Hachiware keeps a few tied bags against the cave wall. This is one soft,
// asymmetric surface rather than a pile of spheres: overlapping balls would
// each draw their own outline through the next one and turn a single bag into
// a heap of bubbles. The only separate pieces are the knot and its two tied
// ears, whose silhouettes genuinely sit in front of the body.
function trashBagBody(h, pad = 0, variant = 0) {
  const rings = 30;
  const cols = 64;
  // [height fraction, x radius, z radius]. The wide, flattened bottom and
  // narrow cinch are what distinguish a filled bag from a pear or a boulder.
  const profile = variant ? [
    // Lower and broader through the belly, then pulled abruptly into the
    // neck: a differently filled bag rather than a resized first one.
    [0.00, 0.38, 0.30],
    [0.06, 0.54, 0.41],
    [0.23, 0.60, 0.46],
    [0.48, 0.56, 0.43],
    [0.68, 0.44, 0.34],
    [0.86, 0.22, 0.18],
    [1.00, 0.075, 0.070],
  ] : [
    [0.00, 0.34, 0.28],
    [0.06, 0.50, 0.38],
    [0.22, 0.56, 0.44],
    [0.50, 0.53, 0.42],
    [0.72, 0.42, 0.33],
    [0.88, 0.23, 0.19],
    [1.00, 0.075, 0.070],
  ];
  const sample = (u) => {
    let i = 0;
    while (i < profile.length - 2 && profile[i + 1][0] < u) i++;
    const a = profile[i];
    const b = profile[i + 1];
    const raw = (u - a[0]) / (b[0] - a[0]);
    // Smooth rather than linear between the measured sections. Straight
    // interpolation left a visible corner at every row in the profile and
    // made the bag read as a low-poly vase instead of soft plastic.
    const t = raw * raw * (3 - 2 * raw);
    return [
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t,
    ];
  };

  const pos = [];
  const idx = [];
  for (let i = 0; i <= rings; i++) {
    const u = i / rings;
    const [rx, rz] = sample(u);
    const y = h * 0.86 * u;
    // A slight sideways drift and two different ripples keep every view from
    // resolving to the same mathematically perfect pear.
    const drift = variant
      ? h * (-0.052 * Math.sin(u * Math.PI * 1.18) + 0.014 * u)
      : h * (0.040 * Math.sin(u * Math.PI * 1.25) - 0.018 * u);
    for (let j = 0; j < cols; j++) {
      const a = (j / cols) * Math.PI * 2;
      // Broad, low-frequency unevenness through the filled body, becoming
      // tighter gathered ripples as it approaches the knot.
      const gather = Math.pow(u, 4);
      const phase = variant ? 1.7 : 0;
      const wobbleX = 1 + 0.040 * Math.sin(a * 2 + u * 3.7 + phase)
        + 0.025 * Math.sin(a * 3 - u * 2.2 - phase * 0.7)
        + gather * 0.055 * Math.sin(a * 7 + 0.8 + phase);
      const wobbleZ = 1 + 0.035 * Math.sin(a * 2 - u * 3.1 - phase)
        + gather * 0.045 * Math.sin(a * 6 - 0.4 + phase);
      pos.push(
        drift + Math.cos(a) * h * rx * wobbleX,
        y,
        Math.sin(a) * h * rz * wobbleZ,
      );
    }
  }

  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < cols; j++) {
      const k = (j + 1) % cols;
      const a = i * cols + j;
      const b = i * cols + k;
      const c = (i + 1) * cols + k;
      const d = (i + 1) * cols + j;
      idx.push(a, d, c, a, c, b);
    }
  }
  // Flat caps: the lower one lets the bag sit with weight on the floor, while
  // the upper is hidden inside the cinching ring.
  const bottom = pos.length / 3;
  pos.push(0, 0, 0);
  const top = pos.length / 3;
  pos.push(-h * 0.018, h * 0.86, 0);
  for (let j = 0; j < cols; j++) {
    const k = (j + 1) % cols;
    idx.push(bottom, k, j);
    const a = rings * cols + j;
    const b = rings * cols + k;
    idx.push(top, a, b);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  if (pad) {
    const P = geo.attributes.position;
    const N = geo.attributes.normal;
    for (let i = 0; i < P.count; i++) {
      P.setXYZ(i,
        P.getX(i) + N.getX(i) * pad,
        P.getY(i) + N.getY(i) * pad,
        P.getZ(i) + N.getZ(i) * pad);
    }
  }
  return geo;
}

function buildTrashBagModel(h, colour, variant = 0) {
  const g = new THREE.Group();
  const bag = fillMat(colour);
  part(g, (pad) => trashBagBody(h, pad, variant), bag, null, INK_SMALL);

  const neckY = h * 0.86;
  // The cinch wrapped around the gathered plastic.
  part(g, (pad) => new THREE.TorusGeometry(
    h * 0.082, h * 0.027 + pad, 9, 22),
  bag, (m) => {
    m.rotation.x = Math.PI / 2;
    m.position.set(-h * 0.018, neckY, 0);
  }, INK_SMALL);

  // A compact filled knot with two short pinched tips. The first version used
  // large hollow loops and read as rabbit ears; tied plastic is a small twist
  // of material, not a bow.
  part(g, (pad) => {
    const s = new THREE.SphereGeometry(1, 20, 14);
    s.scale(h * 0.095 + pad, h * 0.065 + pad, h * 0.075 + pad);
    return s;
  }, bag, (m) => m.position.set(-h * 0.018, neckY + h * 0.025, 0), INK_SMALL);
  for (const side of [-1, 1]) {
    part(g, (pad) => {
      const s = new THREE.SphereGeometry(1, 20, 14);
      s.scale(h * 0.115 + pad, h * 0.075 + pad, h * 0.052 + pad);
      return s;
    }, bag, (m) => {
      m.position.set(side * h * 0.090 - h * 0.018, neckY + h * 0.105, 0);
      m.rotation.z = side * 0.58;
    }, INK_SMALL);
  }

  // Sparse crease strokes on the front, matching the reference's handful of
  // short marks rather than texturing the whole plastic surface.
  const crease = (points, weight = h * 0.016) => {
    const curve = new THREE.CatmullRomCurve3(points);
    g.add(new THREE.Mesh(
      new THREE.TubeGeometry(curve, 12, weight, 8, false),
      legMat(),
    ));
  };

  // Gathered folds radiating down from the cinch. These are the marks that make
  // the narrowing top read as plastic pulled tight rather than a narrow neck.
  for (const side of [-1, 1]) {
    crease([
      new THREE.Vector3(side * h * 0.018 - h * 0.018, h * 0.835, h * 0.070),
      new THREE.Vector3(side * h * 0.090, h * 0.720, h * 0.190),
      new THREE.Vector3(side * h * 0.190, h * 0.580, h * 0.285),
    ]);
    crease([
      new THREE.Vector3(side * h * 0.045 - h * 0.018, h * 0.825, h * 0.060),
      new THREE.Vector3(side * h * 0.165, h * 0.665, h * 0.205),
      new THREE.Vector3(side * h * 0.310, h * 0.500, h * 0.285),
    ]);
  }
  crease([
    new THREE.Vector3(-h * 0.32, h * 0.29, h * 0.30),
    new THREE.Vector3(-h * 0.25, h * 0.31, h * 0.35),
    new THREE.Vector3(-h * 0.19, h * 0.28, h * 0.36),
  ]);
  crease([
    new THREE.Vector3(h * 0.18, h * 0.50, h * 0.32),
    new THREE.Vector3(h * 0.24, h * 0.51, h * 0.34),
    new THREE.Vector3(h * 0.29, h * 0.48, h * 0.32),
  ]);
  crease([
    new THREE.Vector3(h * 0.20, h * 0.16, h * 0.35),
    new THREE.Vector3(h * 0.27, h * 0.20, h * 0.37),
    new THREE.Vector3(h * 0.34, h * 0.20, h * 0.33),
  ]);

  return {
    group: g,
    fills: [bag],
    top: h * 1.06,
    rx: h * (variant ? 0.61 : 0.57),
    rz: h * (variant ? 0.47 : 0.45),
  };
}

export function buildTrashBag(h) {
  return buildTrashBagModel(h, PAL.trashBag, 0);
}

export function buildTrashBagAlt(h) {
  return buildTrashBagModel(h, PAL.trashBagAlt, 1);
}

// ---------------------------------------------------------- the nightstand
//
// A bedside cabinet: four feet, a carcass, a top slab that overhangs it, two
// drawers, and somebody's books left on top.
//
// It leans on both of the things this file has had to learn, at once.
//
// PER-FACE SHADING, because an inverted hull draws silhouettes and not edges,
// so a box built as one mesh in one colour is a flat tan hexagon with a line
// round it. The cardboard box hit that first; every boxy part here carries the
// same six-group skin, and the four wood tones are shared across all of them —
// carcass, slab and feet are one piece of furniture and should be one wood.
//
// AND GENUINE PROTRUSION, because a hull draws no line where two parts meet
// INSIDE each other. That is why the slab is wider than the carcass rather than
// flush with it, why the drawers stand proud of the front rather than sitting
// in it, and why the books have air between them. Every line the reference
// draws on this thing is a line that only exists because something sticks out
// past something else. Push the slab back flush and the lip under it vanishes;
// stand two books together and they become one wide book.
//
// The drawers cannot be recessed for that reason, and the reference is ambiguous
// enough to allow either. A sunk drawer front needs a hole cut in the carcass,
// which needs the carcass to stop being a box — and a proud one reads the same
// from anywhere you can stand in this room.

export function buildNightstand(h) {
  const g = new THREE.Group();
  // `h` is the height to the top of the slab, as it is for the table. The books
  // stand above that and are not counted in it: they are what is ON the piece,
  // not part of how tall it is.
  const W = h * 1.40;
  const D = h * 1.08;

  // The wood. Four tones off one colour, and the multipliers are in LINEAR
  // light — see MARK for why a 1.19 here is only about 8% on screen.
  const wood = new THREE.Color(PAL.woodBody);
  const tone = (k) => fillMat(new THREE.Color().copy(wood).multiplyScalar(k));
  const wTop = tone(1.185);
  const wSide = tone(1.0);
  const wEnd = tone(0.794);
  const wUnder = tone(0.584);
  // BoxGeometry's groups run +x, -x, +y, -y, +z, -z.
  const skin = [wEnd, wEnd, wTop, wUnder, wSide, wSide];

  const box = (w, ht, d, x, y, z, mat, weight) =>
    part(g, (pad) => new THREE.BoxGeometry(w + pad * 2, ht + pad * 2, d + pad * 2),
      mat, (m) => m.position.set(x, y, z), weight);

  const FOOT = h * 0.10;
  const SLAB = h * 0.13;
  const bodyW = W * 0.94;
  const bodyD = D * 0.93;
  const bodyY0 = FOOT;
  const bodyY1 = h - SLAB;
  const bodyH = bodyY1 - bodyY0;

  // Feet, inset from the corners so the carcass overhangs them a little — the
  // same trick as the slab at the other end, and what stops the piece reading
  // as a block sitting flat on the floor.
  const fs = h * 0.115;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      box(fs, FOOT, fs, sx * (bodyW / 2 - fs * 0.62), FOOT / 2,
        sz * (bodyD / 2 - fs * 0.62), skin);
    }
  }

  box(bodyW, bodyH, bodyD, 0, (bodyY0 + bodyY1) / 2, 0, skin);
  const slab = box(W, SLAB, D, 0, h - SLAB / 2, 0, skin);

  // The drawers. Proud of the carcass by their own thickness, which is what
  // gives each one a complete line round it.
  const drawer = fillMat(PAL.woodDrawer);
  const dT = h * 0.035;
  const dW = bodyW * 0.86;
  const dH = bodyH * 0.37;
  const dz = bodyD / 2 + dT / 2;
  const handle = [];
  for (const f of [0.72, 0.28]) {
    const cy = bodyY0 + bodyH * f;
    box(dW, dH, dT, 0, cy, dz, drawer);
    // A dark bar for a pull. No hull: it is already the pen's own colour, and
    // at this size a shell round it would be most of the handle.
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(dW * 0.22, h * 0.018, h * 0.016), legMat());
    bar.position.set(0, cy, dz + dT / 2 + h * 0.007);
    g.add(bar);
    handle.push(bar);
  }

  // ------------------------------------------------------------- the books
  //
  // Their own pen, held finer. A spine is a twentieth of this piece across, so
  // the room's line would be a third of the book — the same argument the bear
  // already made, and the same answer.
  const topY = h;
  const spines = PAL.bookSpines.map((c) => fillMat(c));
  const stack = fillMat(PAL.bookStack);

  // Standing, along the back-left of the slab, with AIR between them. Flush
  // against each other they would meet inside each other, where no hull can
  // draw, and five books would read as one wide one. The gap is narrower than
  // the ink is fat, so what shows between two spines is a single dark line
  // rather than a slot with the slab at the bottom of it.
  // Thicker than they look like they need to be. A spine is outlined on both
  // sides, so its own pen costs it twice — at a sixteenth of the height each,
  // the row came out as a dark block with slivers of colour in it. At a tenth
  // the colour wins and the lines read as lines.
  const GAP = h * 0.010;
  const bz = -D * 0.16;
  let bx = -W * 0.44;
  spines.forEach((mat, i) => {
    const t = h * (0.085 + 0.035 * hash01(i * 7 + 1));
    const bh = h * (0.30 + 0.12 * hash01(i * 7 + 2));
    const bd = h * (0.28 + 0.05 * hash01(i * 7 + 3));
    // The last one leans on the rest, which is what the reference draws and
    // what stops a row of books reading as a printed pattern.
    const lean = i === spines.length - 1 ? 0.26 : 0;
    const cx = bx + t / 2;
    const cy = topY + (bh / 2) * Math.cos(lean) + (t / 2) * Math.sin(lean);
    part(g, (pad) => new THREE.BoxGeometry(t + pad * 2, bh + pad * 2, bd + pad * 2),
      mat, (m) => {
        m.position.set(cx + (lean ? bh * 0.22 : 0), cy, bz);
        m.rotation.z = -lean;
      }, INK_SMALL);
    bx += t + GAP;
  });

  // ...and two lying flat on the other end, offset so the upper one has a
  // silhouette of its own against the lower. Stacked square they would share a
  // face, and share a face means no line.
  const ft = h * 0.048;
  for (let i = 0; i < 2; i++) {
    const k = 1 - i * 0.10;
    part(g, (pad) => new THREE.BoxGeometry(h * 0.36 * k + pad * 2, ft + pad * 2,
      h * 0.27 * k + pad * 2), stack,
      (m) => m.position.set(W * 0.27 + i * h * 0.02, topY + ft / 2 + i * ft,
        -D * 0.10 - i * h * 0.015), INK_SMALL);
  }

  // Scuffed on the slab, which is the face of this thing you look down at. The
  // carcass sides get none: they are almost entirely drawer, and the drawers
  // are the one part of a chest that is handled rather than knocked.
  //
  // Off `wTop` rather than off the wood, because MARK is a fraction of the
  // surface a mark LIES ON and every one of these lies on the slab's top face —
  // which is a fifth brighter than the body. Taken off the body it came out a
  // quarter darker than its surroundings instead of a fifth, which is a scuff
  // reading as a scratch.
  const scuff = markMat(wTop.userData.baseColor);
  const marks = scuffs(slab.geometry, {
    count: 7, len: h * 0.05, weight: h * 0.009, minUp: 0.30, seed: 23,
  });
  if (marks) {
    const m = new THREE.Mesh(marks, scuff);
    m.position.y = h - SLAB / 2;
    g.add(m);
  }

  return {
    group: g,
    fills: [wTop, wSide, wEnd, wUnder, drawer, stack, scuff, ...spines],
    top: h,
    rx: W / 2,
    rz: D / 2,
  };
}

// ----------------------------------------------------------------- the pot
//
// A teapot, and the first piece here that is a SOLID OF REVOLUTION — a profile
// spun about its own axis rather than a box squashed or a sphere lumped.
//
// The body's silhouette is the whole design: wide and nearly upright at the
// foot, curving in through the top half to a small flat lid. No superellipsoid
// does that — they are symmetric about their middle and this is emphatically
// not — so the shape is a curve, written down, and LatheGeometry spins it.
//
// Which makes the ink shell the interesting part. Everywhere else in this file
// the fattened copy is the same construction at a bigger number; a lathe has no
// such number, because "bigger" for a profile is not a scale. Scaling it is the
// leg mistake in a new hat: a profile scaled by six percent grows six percent
// TALLER, so the shell's foot sinks under the floor and its lid stands proud of
// the real one. The shell is the profile OFFSET ALONG ITS OWN NORMAL instead,
// which is what "fatter" actually means for a curve — and the two points that
// sit on the axis are pushed straight down and straight up, because a point at
// radius zero has no outward to be moved along and moving it off the axis would
// tear the surface open at the poles.

// The body's outline, as radius against height, from foot to lid. A quarter of
// a superellipse: `1 - t^p` raised to a small power holds the curve out near
// the foot and takes it in quickly at the shoulder, which is the profile a pot
// has. Cut off at 0.94 of the way through, which is what leaves a flat lid of
// about half the body's width rather than closing to a point.
function potProfile(rMax, h, n) {
  const raw = [[0, 0], [rMax * 0.90, 0]];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    raw.push([
      rMax * Math.pow(1 - Math.pow(t * 0.94, 2.6), 0.30),
      h * (0.045 + 0.955 * t),
    ]);
  }
  raw.push([0, h]);
  return raw;
}

// The same outline, fattened by `pad` along its own normal.
function potOffset(raw, pad) {
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    const a = raw[Math.max(0, i - 1)];
    const b = raw[Math.min(raw.length - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const len = Math.hypot(tx, ty) || 1;
    tx /= len; ty /= len;
    // Rotate the tangent a quarter turn to get the outward side. Checked at the
    // foot, where the outline runs out along the floor and this has to come
    // back pointing DOWN.
    const r = raw[i][0] + ty * pad;
    const y = raw[i][1] - tx * pad;
    out.push(new THREE.Vector2(raw[i][0] < 1e-6 ? 0 : Math.max(0, r), y));
  }
  return out;
}

export function buildTeapot(h) {
  const g = new THREE.Group();
  // Its own blue is the stool's, on purpose. The room is drawn in four pastels
  // and a pen, and a fifth colour for one pot would be a fifth colour.
  const glaze = fillMat(PAL.furnitureBlue);
  const dark = legMat();
  const mouth = fillMat(PAL.furniturePaper);

  const rMax = h * 0.85;
  const raw = potProfile(rMax, h, 22);
  const rLid = raw[raw.length - 2][0];

  // INK_SMALL throughout, like the bear, and the lid is what forces it. The
  // room's pen is 0.016 of the world in every direction; the lid is a fifth of
  // that THICK, so a shell at full weight is three times the height of the
  // thing it is drawing and swallows it whole — measured on a render as a black
  // cap where the lid should be. The spout comes out a third fatter for the
  // same reason. A piece carries one pen, so the body takes the finer one too.
  part(g, (pad) => new THREE.LatheGeometry(potOffset(raw, pad), 30),
    glaze, null, INK_SMALL);

  // The lid. A separate piece because it has to be: a seam scribed round the
  // top of one mesh is an edge in the middle of a shape, and the hull only ever
  // draws silhouettes. Standing it a little proud gives it an edge of its OWN,
  // with the body's shoulder behind it, and that draws.
  part(g, (pad) => new THREE.CylinderGeometry(
    rLid * 0.86 + pad, rLid * 0.90 + pad, h * 0.075 + pad * 2, 26),
    glaze, (m) => { m.position.y = h + h * 0.0375; }, INK_SMALL);

  // The spout, seated well inside the body so the join is buried and only the
  // part that clears it is ever drawn. Built along its own axis and turned,
  // rather than reasoned about in the pot's frame.
  const dir = new THREE.Vector3(-Math.cos(0.49), Math.sin(0.49), 0);
  const sLen = rMax * 0.86;
  const root = new THREE.Vector3(-rMax * 0.86, h * 0.34, 0);
  const spin = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  const place = (m) => {
    m.quaternion.copy(spin);
    m.position.copy(root).addScaledVector(dir, sLen / 2);
  };
  part(g, (pad) => new THREE.CylinderGeometry(
    rMax * 0.100 + pad, rMax * 0.22 + pad, sLen + pad * 2, 16),
    glaze, place, INK_SMALL);

  // The cut end: a dark disc with a pale one laid on it, so the ring of dark
  // left showing is the rim. The bear's mouth again — anything this small needs
  // its outline drawn rather than hulled.
  const cap = (r, t, mat, along) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, t, 16), mat);
    m.quaternion.copy(spin);
    m.position.copy(root).addScaledVector(dir, along);
    g.add(m);
  };
  cap(rMax * 0.103, h * 0.012, dark, sLen);
  cap(rMax * 0.062, h * 0.012, mouth, sLen + h * 0.007);

  // The bail. Dark, and wearing no shell for the reason the table's legs wear
  // none: it is already the pen's own colour, so an outline round it would be
  // an outline the colour of the thing it is outlining.
  //
  // A torus lies in xy and sweeps from +x through +y, so a half turn of one is
  // already the arch — squashed a little, because a true semicircle stands too
  // tall against a pot this wide.
  const rPivot = rLid * 0.96;
  const arch = new THREE.TorusGeometry(rPivot, h * 0.022, 8, 22, Math.PI);
  arch.scale(1, 0.82, 1);
  const bail = new THREE.Mesh(arch, dark);
  bail.position.y = h;
  g.add(bail);
  for (const sx of [-1, 1]) {
    const knob = new THREE.Mesh(new THREE.SphereGeometry(h * 0.042, 12, 8), dark);
    knob.position.set(sx * rPivot, h, 0);
    g.add(knob);
  }

  // NO SCUFFS. It is glazed, and a tick on glaze reads as a crack.
  g.updateMatrixWorld(true);
  const box = new THREE.Box3();
  for (const c of g.children) {
    if (!c.isMesh || c.material === ink()) continue;
    c.geometry.computeBoundingBox();
    box.union(c.geometry.boundingBox.clone().applyMatrix4(c.matrixWorld));
  }
  return {
    group: g,
    fills: [glaze, mouth],
    top: box.max.y,
    rx: Math.max(box.max.x, -box.min.x),
    rz: Math.max(box.max.z, -box.min.z),
  };
}

// --------------------------------------------------------------- the shelf
//
// A plank on two brackets with a vase on it, and the first piece in this room
// that is not standing on the floor — it hangs on the WALL. See the `wall`
// branch in scene.js for how it is hung; what matters here is that it is built
// with its BACK AT z = 0 and everything in front of that. A floor piece is
// built around its own middle because the floor holds it up from underneath; a
// wall piece is held from behind, so its back is its origin and the mount can
// put that flat against the masonry without knowing anything else about it.
//
// `h` is the whole assembly, bracket foot to the top of the flower. A shelf has
// no height of its own worth naming — the plank is a finger thick — so the one
// number that means anything is how much wall it takes up.

// The vase's outline. Bulged low, pinched at the neck and flared a little at
// the rim, which is three changes of direction in a short run — too many to
// write as one curve, so these are control points and SplineCurve does the
// smoothing. The pot's own profile is a formula because a pot is one arc; this
// one is drawn.
function vaseProfile(rMax, vh) {
  const P = (r, t) => new THREE.Vector2(rMax * r, vh * t);
  const side = new THREE.SplineCurve([
    P(0.52, 0), P(0.86, 0.12), P(1.00, 0.34), P(0.80, 0.56),
    P(0.42, 0.74), P(0.36, 0.88), P(0.44, 1),
  ]).getPoints(26);
  return [[0, 0], ...side.map((p) => [p.x, p.y]), [0, vh]];
}

export function buildShelf(h) {
  const g = new THREE.Group();
  // Both woods are the cabinet's, which is the point: one room, one timber.
  const plank = fillMat(PAL.woodDrawer);
  const bracket = fillMat(PAL.woodBody);
  const dark = legMat();
  const clay = fillMat(PAL.furniturePaper);
  const bloom = fillMat(PAL.bloomRed);
  const stalk = fillMat(PAL.stemGreen);
  const eye = fillMat(PAL.sun);

  const L = h * 0.90;          // how much wall it takes
  const T = h * 0.095;         // the plank
  const D = h * 0.40;          // how far it stands out
  const bh = h * 0.10;         // the brackets

  part(g, (pad) => new THREE.BoxGeometry(L + pad * 2, T + pad * 2, D + pad * 2),
    plank, (m) => m.position.set(0, bh + T / 2, D / 2), INK_SMALL);

  for (const sx of [-1, 1]) {
    part(g, (pad) => new THREE.BoxGeometry(
      h * 0.10 + pad * 2, bh + pad * 2, D * 0.70 + pad * 2),
      bracket, (m) => m.position.set(sx * L * 0.38, bh / 2, D * 0.35), INK_SMALL);
    // The peg on the bracket's face. Dark already, so no shell — the same rule
    // the table's legs and the pot's handle go by.
    const peg = new THREE.Mesh(
      new THREE.CylinderGeometry(h * 0.017, h * 0.017, h * 0.014, 10), dark);
    peg.rotation.x = Math.PI / 2;
    peg.position.set(sx * L * 0.38, bh * 0.52, D * 0.70);
    g.add(peg);
  }

  // ------------------------------------------------------------- the vase
  const vy = bh + T;                 // stands on the plank
  const vh = h * 0.42;
  const vr = h * 0.115;
  // Forward of the shelf's midpoint. On a flat house wall the old 0.52 was
  // enough, but the cave shell curves inward behind the vase and clipped its
  // rear outline. 0.68 buys that clearance while keeping the vase's front
  // edge on the plank.
  const vz = D * 0.68;
  const raw = vaseProfile(vr, vh);
  part(g, (pad) => new THREE.LatheGeometry(potOffset(raw, pad), 26),
    clay, (m) => m.position.set(0, vy, vz), INK_SMALL);

  // The ribbon: a ring round the neck with two loops on the front. A bow this
  // size is three millimetres of world — anything more faithful would be
  // detail nobody can resolve, and the ring is what actually reads.
  const neckY = vy + vh * 0.76;
  const tie = new THREE.Mesh(
    new THREE.TorusGeometry(vr * 0.40, h * 0.016, 8, 18), bloom);
  tie.rotation.x = Math.PI / 2;
  tie.position.set(0, neckY, vz);
  g.add(tie);
  for (const sx of [-1, 1]) {
    const loop = new THREE.Mesh(new THREE.SphereGeometry(h * 0.030, 10, 8), bloom);
    loop.scale.set(1.0, 0.72, 0.45);
    loop.position.set(sx * vr * 0.62, neckY + h * 0.008, vz + vr * 0.34);
    g.add(loop);
  }

  // ----------------------------------------------------------- the flower
  //
  // The stem leans and bends, because a straight one reads as a wire. Four
  // points through a curve is enough for a lean and a nod at the top.
  // It leans OUT INTO THE ROOM, and that is structural rather than pretty.
  //
  // The shell is a dome, so the wall is not a wall: it leans in as it rises,
  // losing better than four tenths of its radius over this piece's own height.
  // A back plane is flat and the dome is not, so anything tall and thin sitting
  // straight up off one goes THROUGH the masonry — measured at 0.28 outside the
  // shell with the stem upright, which is a flower with its head in the brick.
  // Leaning it forward is what buys the clearance back, and it is what the
  // reference draws anyway: a cut stem sags toward the light.
  const lean = D * 1.15;
  const stemTop = new THREE.Vector3(h * 0.02, vy + vh + h * 0.34, lean);
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, vy + vh * 0.86, vz),
    new THREE.Vector3(-h * 0.010, vy + vh + h * 0.10, vz + (lean - vz) * 0.26),
    new THREE.Vector3(h * 0.014, vy + vh + h * 0.24, vz + (lean - vz) * 0.68),
    stemTop,
  ]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 14, h * 0.011, 7, false), stalk));

  // Five petals round a middle, laid flat and facing the room. It is the one
  // thing here read from the front and nowhere else, so it is built that way
  // rather than as a thing with a back.
  const petal = new THREE.SphereGeometry(h * 0.042, 12, 8);
  petal.scale(1, 1, 0.42);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    const p = new THREE.Mesh(petal, bloom);
    p.position.set(
      stemTop.x + Math.cos(a) * h * 0.046,
      stemTop.y + Math.sin(a) * h * 0.046,
      stemTop.z + h * 0.006);
    g.add(p);
  }
  const mid = new THREE.Mesh(new THREE.SphereGeometry(h * 0.022, 12, 8), eye);
  // `.scale` on a MESH is a vector, not a call — on a geometry it is a method.
  // Both spellings appear a few lines apart here and only one of them throws.
  mid.scale.set(1, 1, 0.5);
  mid.position.copy(stemTop).add(new THREE.Vector3(0, 0, h * 0.020));
  g.add(mid);

  // NO SCUFFS: a shelf at head height is read from below and across the room,
  // and marks at that distance are dirt on the lens.
  g.updateMatrixWorld(true);
  const box = new THREE.Box3();
  for (const c of g.children) {
    if (!c.isMesh || c.material === ink()) continue;
    c.geometry.computeBoundingBox();
    box.union(c.geometry.boundingBox.clone().applyMatrix4(c.matrixWorld));
  }
  return {
    group: g,
    fills: [plank, bracket, clay, bloom, stalk, eye],
    top: box.max.y,
    rx: Math.max(box.max.x, -box.min.x),
    rz: Math.max(box.max.z, -box.min.z),
  };
}

// -------------------------------------------------------------- the lantern
//
// The first thing in this world that gives off light.
//
// Everything else here is unlit — MeshBasicMaterial the whole way down, one
// fixed sun, and an hour that is a colour rather than a direction. So "it
// lights the area" cannot mean a PointLight: there is not one lit material on
// this planet for a light to fall on, and adding one would mean relighting
// everything else to match. What it means instead is the language the house
// already speaks after dark — a warm patch of ground under it, and glass that
// stops being glass and starts being the source. See the note on the glow the
// builder hands back, and buildGlowPatch/LAMP_POOL in scene.js for the machine
// this is borrowing the vocabulary of.
//
// Turned by hand rather than by the clock, which is what makes it an ITEM
// rather than a fixture: the house's lamps come up because it got dark, and
// this one is on because somebody left it on. `lit` in the config is the
// switch.

// The glass is a barrel — bowed out at its waist and drawn in at both ends —
// so it is a lathe, like the teapot and the vase before it. `bow` is how far it
// swells: a straight cylinder reads as a tin can with a light in it, and this
// is glass, which is a thing that holds a highlight.
function lampGlassProfile(r, gh, bow) {
  const raw = [[0, 0]];
  const N = 14;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    // A cosine belly: 1 at the middle, tapering to `1 - bow` at both rims.
    raw.push([r * (1 - bow + bow * Math.sin(Math.PI * (0.12 + 0.76 * t))), gh * t]);
  }
  raw.push([0, gh]);
  return raw;
}

// Brightness down a lathe, as a vertex colour: `mid` at the waist falling to
// `end` at both rims, eased rather than linear so the hot part has a middle
// instead of a peak. A ratio, not a colour — see the note in buildLantern.
function hotBand(geo, height, mid, end) {
  const P = geo.attributes.position;
  const col = new Float32Array(P.count * 3);
  for (let i = 0; i < P.count; i++) {
    const t = Math.min(1, Math.max(0, P.getY(i) / height));
    // 1 at t = 0.5, 0 at both ends, with a flat top rather than a spike.
    const s = Math.sin(Math.PI * t) ** 0.75;
    const k = end + (mid - end) * s;
    col[i * 3] = k; col[i * 3 + 1] = k; col[i * 3 + 2] = k;
  }
  return new THREE.BufferAttribute(col, 3);
}

export function buildLantern(h) {
  const g = new THREE.Group();
  const brass = fillMat(PAL.lampBrass);
  const dark = legMat();

  // The glass gets its own material rather than sharing one, because it is the
  // one surface in the room whose colour is a STATE. `lampGlow` is what it
  // wears when it is on; it is not a tint of the brass and not a shade of
  // anything else here, so it is picked outright.
  const glass = fillMat(PAL.lampGlass);

  // Vertical layout, foot to the top of the bail. `h` is the whole of it, as
  // it is for every other piece here.
  const footH = h * 0.16;      // the flared base
  const glassH = h * 0.40;     // the lit barrel
  const collarH = h * 0.10;    // the cap it hangs from
  const glassY = footH;
  const collarY = glassY + glassH;

  const rFoot = h * 0.30;      // widest, at the very bottom
  const rWaist = h * 0.185;    // where the foot meets the glass
  const rGlass = h * 0.215;
  const rCollar = h * 0.225;

  // The foot: a flare, wide at the floor and drawn in to the glass. Two
  // stacked cones would give the same silhouette and a seam across the middle
  // that no hull would ever draw — see the futon. One lathe, one outline.
  part(g, (pad) => new THREE.LatheGeometry(potOffset([
    [0, 0], [rFoot * 0.94, 0], [rFoot, h * 0.028],
    [rWaist * 1.22, h * 0.105], [rWaist, h * 0.135], [rWaist, footH],
    [0, footH],
  ], pad), 24), brass, null, INK_SMALL);

  // The glass. NOT wearing the ink shell: it is the light, and a light with a
  // heavy line round it reads as a picture of a light. The brass above and
  // below it carries its own outline, which is what draws the lantern's
  // silhouette either side — so the glass sits in a gap in the pen, exactly the
  // way the reference draws it.
  //
  // ------------------------------------------------------------ the glow
  //
  // A flat fill is not a light. It was one, and it read as a lamp somebody had
  // coloured in: the thing that says GLOWING is not the hue, it is that the
  // middle is hotter than the edges and that the light does not stop at the
  // glass.
  //
  // Two parts, neither of them a shader. The barrel is vertex-coloured so it
  // burns out toward its waist, and a second, wider shell around it adds light
  // to whatever is behind it. Both are free at runtime.
  //
  // WHAT THE VERTEX COLOURS HOLD IS A RATIO, not a colour, for exactly the
  // reason water.js sets out at lakeGeo: vertex colours MULTIPLY into
  // material.color, and the hour owns material.color. Storing real colours here
  // would fight the tint — a lamp at dusk would come out a muddy version of
  // itself instead of a warm one. So the mesh carries only the SHAPE of the
  // brightness and the hour carries the colour, and neither needs to know about
  // the other.
  const glassGeo = new THREE.LatheGeometry(
    lampGlassProfile(rGlass, glassH, 0.16).map(([r, y]) => new THREE.Vector2(r, y)), 24);
  glassGeo.setAttribute('color', hotBand(glassGeo, glassH, 1.0, 0.62));
  glass.vertexColors = true;
  const barrel = new THREE.Mesh(glassGeo, glass);
  barrel.position.y = glassY;
  g.add(barrel);

  // The bloom: the same barrel, wider and taller, adding rather than covering.
  // It fades to nothing at both ends, so it never has an edge of its own — an
  // additive shell with a hard rim reads as a jar around the lamp.
  //
  // Additive on a CLOSED shell means the far wall adds through the near one, so
  // the middle of it doubles up on its own. That is not an accident to be
  // fixed: it is thickest exactly where the glass is deepest, which is what
  // gives it a core instead of an outline.
  const haloGeo = new THREE.LatheGeometry(
    lampGlassProfile(rGlass * 1.42, glassH * 1.22, 0.20)
      .map(([r, y]) => new THREE.Vector2(r, y)), 20);
  haloGeo.setAttribute('color', hotBand(haloGeo, glassH * 1.22, 1.0, 0.0));
  const halo = new THREE.Mesh(haloGeo, new THREE.MeshBasicMaterial({
    color: new THREE.Color(PAL.lampLit),
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0.55,
  }));
  halo.position.y = glassY - glassH * 0.11;
  halo.renderOrder = 6;
  g.add(halo);

  // The collar, and the ring under the glass that the barrel sits in. Both are
  // brass and both are proud of it, so each draws its own line across the
  // glass — which is what gives the lit part its top and bottom edge.
  part(g, (pad) => new THREE.CylinderGeometry(
    rCollar * 0.92 + pad, rCollar + pad, collarH + pad * 2, 24),
    brass, (m) => { m.position.y = collarY + collarH / 2; }, INK_SMALL);
  part(g, (pad) => new THREE.CylinderGeometry(
    rGlass * 1.10 + pad, rGlass * 1.14 + pad, h * 0.045 + pad * 2, 24),
    brass, (m) => { m.position.y = glassY + h * 0.020; }, INK_SMALL);

  // The bail. Dark, and wearing no shell for the reason the table's legs and
  // the teapot's handle wear none: it is already the pen's colour.
  //
  // Squashed taller than a half-circle rather than rounder — the reference's
  // handle is a tall arch, and a true semicircle on a lantern this narrow comes
  // out as a bubble.
  const rBail = rCollar * 0.72;
  const arch = new THREE.TorusGeometry(rBail, h * 0.020, 8, 20, Math.PI);
  arch.scale(1, 1.28, 1);
  const bail = new THREE.Mesh(arch, dark);
  bail.position.y = collarY + collarH;
  g.add(bail);
  for (const sx of [-1, 1]) {
    const knob = new THREE.Mesh(new THREE.SphereGeometry(h * 0.030, 10, 8), dark);
    knob.position.set(sx * rBail, collarY + collarH, 0);
    g.add(knob);
  }

  // NO SCUFFS: it is glass and polished brass, and a tick on either reads as a
  // chip rather than as wear.
  g.updateMatrixWorld(true);
  const box = new THREE.Box3();
  for (const c of g.children) {
    if (!c.isMesh || c.material === ink()) continue;
    c.geometry.computeBoundingBox();
    box.union(c.geometry.boundingBox.clone().applyMatrix4(c.matrixWorld));
  }

  // See the note on `reach` below, which is what this is.
  const lampReach = h * 7.0;

  return {
    group: g,
    fills: [brass, glass],
    top: box.max.y,
    rx: Math.max(box.max.x, -box.min.x),
    rz: Math.max(box.max.z, -box.min.z),
    // What this piece does to the room, handed to scene.js rather than built
    // here — the same split the shadows already use. This file knows what a
    // lantern looks like; scene.js knows how light lands on a sphere.
    //
    // `glass` is handed over too, because being lit is a colour this material
    // WEARS and the hour has an opinion about it: see the tint note in
    // fillMat. Whoever turns it on writes to the material, not to the mesh.
    glow: {
      // Reach, as a multiple of the piece's own height, and the ONE number the
      // pool on the boards, the falloff and the light on the furniture are all
      // cut from — scene.js reads it back rather than keeping a second copy, so
      // a lamp and the patch of floor under it can never disagree about how far
      // it gets. It appears twice below only because the foot has to be a
      // fraction of it; that is why it is a variable and not a literal.
      //
      // SEVEN of its own height — 2.4 units — and it has been up to 10 and
      // back. The history is worth keeping because the number moved for
      // reasons that stopped applying:
      //
      // 2.6 lit a corner. 7 was fitted to the reference frame, "where one
      // lantern owns half the floor". 10 came later, asked for by eye once the
      // lamp was something you could carry out onto the grass — because out
      // there is no wall three paces off to catch the light, so the reach that
      // filled a room read as a small circle in a field.
      //
      // That last argument was about a FALLOFF: with a long fading tail, a
      // bigger number mostly buys a wider haze and the eye reads the bright
      // middle as the light. With a disc it buys a bigger CIRCLE, and at 10 the
      // circle was the whole cave — the model on, and invisible.
      //
      // So back to the reach that was fitted to the frame in the first place,
      // which is the picture being aimed at. What it costs is the open-air
      // case, and that is the right thing to pay: a lantern set down in a field
      // SHOULD light a small circle in a field.
      reach: lampReach,
      lit: glass,
      // The additive shell built above is DELIBERATELY not handed over.
      //
      // It was, briefly. Named to the glow record, it joined the machinery that
      // dims a lamp's own glow with its switch and with the dark — so a
      // switched-off lantern went properly dead, and a lit one at night calmed
      // from 0.55 to 0.15 along with every other fixture. Reverted on request:
      // the soft glow the shell keeps around the glass at all hours is part of
      // what the lantern IS in this art, and a lantern that went fully inert
      // when off lost more than the off-state gained.
      //
      // So the shell burns at its built 0.55 whatever the switch says, and the
      // faint light on an off lantern's glass is a known, chosen thing. If it
      // is ever wanted switch-driven WITHOUT the night calming, hand it over as
      // `halo` here and exempt it from FIXTURE_GLOW rather than re-plumbing.
      colour: PAL.lampGlow,
      // A flame, so the warmest thing in the world restores to the warmest
      // white in it — and still a white. See PAL.lampRestore for why this end
      // of the model has to stay so close to neutral.
      restore: '#FFF0DB',
      // The bite out of the middle of the pool, as a fraction of its reach.
      //
      // Without it the pool's centre sits INSIDE the lantern's own foot — a cap
      // laid on the floor rises to its lift at the middle, which is where the
      // brass is — and being additive it lights the base from within. Measured
      // as a yellow foot on a brass lamp. The house's lamps have always had
      // this hole for the same reason; a light should not light the thing it is
      // standing on.
      hole: (h * 0.30) / lampReach,
      // How high the glass sits, so the pool can be told where its source is
      // without measuring the mesh back out again.
      at: glassY + glassH / 2,
    },
  };
}

// ----------------------------------------------------------------- the bulb
//
// A bare bulb on a flex, hanging from the middle of the ceiling. The room's
// second light, and the first that is not a thing you could pick up: it is
// wired in, so unlike the lantern it comes on because it is NIGHT rather than
// because somebody lit it. See the `night` flag in the config and _syncItemLights
// in scene.js for the switch.
//
// Built HANGING: its origin is where the flex meets the plaster and everything
// is below it, at negative y. Every other piece in this file grows upward from
// a floor that holds it up; this one grows downward from a ceiling it hangs
// off, and building it that way means the mount can put the origin on the
// plaster without knowing anything else about the piece — the same argument the
// wall shelf makes for having its back at z = 0.

// How clear the envelope is with the light off, and with it on. Off is nearly
// nothing — you are meant to see the filament and the room through it — and
// even lit it never closes up, because a bulb you cannot see into is a bulb
// with the light painted onto its outside.
const GLASS_DIM = 0.14;
const GLASS_LIT = 0.58;

// The bulb's outline: a round envelope drawn in to a neck. Written as control
// points rather than a formula, like the vase and unlike the pot — a bulb
// changes direction twice in a short run and one arc cannot do it.
// The envelope is a CIRCLE with a neck on it, so it is swept as one — an arc
// of the sphere from the bottom pole up past its equator, then a short straight
// run into the cap.
//
// Drawn as control points first and that was the wrong tool twice over: a
// spline through six hand-placed points gives a teardrop, because the eye
// cannot place points that happen to be concyclic, and at that few of them the
// outline comes out visibly faceted. The circle was always available.
function bulbProfile(rBulb, rNeck, gh) {
  const raw = [[0, 0]];
  const N = 20;
  // How far past the equator the glass carries before it starts necking in.
  const TOP = Math.PI * 0.36;
  for (let i = 0; i <= N; i++) {
    const a = -Math.PI / 2 + (Math.PI / 2 + TOP) * (i / N);
    raw.push([rBulb * Math.cos(a), rBulb * (1 + Math.sin(a))]);
  }
  raw.push([rNeck, gh * 0.93], [rNeck, gh], [0, gh]);
  return raw;
}

export function buildBulb(h) {
  const g = new THREE.Group();
  const dark = legMat();
  // The same two colours the lantern uses, on purpose: one world, one glass,
  // one idea of what "lit" looks like. Off is the dull one — a bulb that is
  // not burning should read as not burning.
  //
  // TRANSPARENT, and it is the only glass in this app that is. Everything else
  // built here is a solid with a colour on it, and for a lantern's panes that
  // is fine because there is nothing behind them worth seeing. A bare bulb is
  // the opposite: it is a filament in a jar, the jar is the least interesting
  // part, and painting it opaque puts the one thing anybody looks at inside a
  // sealed box. That is what forced the filament onto the OUTSIDE of the glass
  // as two decals, which is a workaround for a problem that did not need to
  // exist.
  //
  // `depthWrite` off so the far wall of the envelope blends too: looking
  // through two thicknesses of glass at the rim and one at the middle is what
  // gives it a body instead of an outline. It is also what lets the filament,
  // which is opaque and therefore drawn first, show through.
  const glass = fillMat(PAL.lampGlass);
  glass.transparent = true;
  glass.depthWrite = false;
  // A STATE, not a constant, and this is the half of "transparent" that was
  // missing. Held at 0.62 the envelope was see-through in principle and a
  // solid grey ball in the morning, because 0.62 of a dull colour over a dull
  // room is a dull colour. Glass is not a fixed thing: an unlit bulb is a
  // nearly clear shell you look straight through, and a lit one is a body of
  // light. The switch drives this the same way it drives the colour — see
  // GLASS_DIM/GLASS_LIT below and _syncItemLights.
  glass.opacity = GLASS_DIM;

  // Proportions from the sheet rather than from the sketch. The envelope is
  // near enough a SPHERE — 0.24 across against 0.26 tall, an egg only just —
  // where this was a pear with a long neck, and the cap is a fifth the size it
  // was. `h` is still the whole drop, so a longer flex hangs it lower without
  // touching anything else.
  const cordLen = h * 0.62;
  const capTop = -cordLen;
  const capLen = h * 0.085;
  const gh = h * 0.267;
  const rBulb = h * 0.117;
  const rNeck = rBulb * 0.44;
  const glassTop = capTop - capLen * 0.86;      // tucked up into the cap

  // The flex. Thin, dark, and wearing no shell for the reason the table's legs
  // wear none: it is already the pen's own colour, and an outline round a line
  // is a thicker line.
  const cord = new THREE.Mesh(
    new THREE.CylinderGeometry(h * 0.016, h * 0.016, cordLen, 8), dark);
  cord.position.y = -cordLen / 2;
  g.add(cord);

  // The cap: ONE small tapered cone, wide where it grips the glass and drawn in
  // to the flex. It was two stacked collars and came out as a chunky fitting on
  // a small bulb — the sheet draws barely more than a shoulder.
  // Barely tapered, and NARROWER than the neck it grips. At 1.55 of the neck it
  // flared wider than the glass's shoulder and read as a little lampshade.
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(rNeck * 0.80, rNeck * 1.16, capLen, 16), dark);
  cap.position.y = capTop - capLen / 2;
  g.add(cap);

  // The envelope. Vertex-coloured so the middle burns hotter than the neck —
  // a RATIO rather than a colour, for the reason set out at the lantern and
  // originally at lakeGeo in water.js: the hour owns material.color, and
  // storing real colours here would fight it.
  //
  // The profile already runs round-end-first, so it is HUNG rather than turned:
  // its y = 0 is the bottom of the envelope and its y = gh is the neck, and
  // dropping the whole thing by `gh` puts the neck at the cap with the glass
  // below it. Rotating it instead — which is what this did first — puts the
  // neck at the FLOOR and hangs a bulb by its bottom.
  const glassGeo = new THREE.LatheGeometry(
    bulbProfile(rBulb, rNeck, gh).map(([r, y]) => new THREE.Vector2(r, y)), 26);
  glassGeo.setAttribute('color', hotBand(glassGeo, gh, 1.0, 0.80));
  glass.vertexColors = true;
  // NO INK HULL, and on a transparent piece that is a law rather than a taste.
  // The hull trick draws a black inside-out copy around the whole mesh and
  // relies on the OPAQUE fill to hide all of it but the silhouette sliver;
  // make the fill transparent and every ray through the glass shows the inside
  // of that black cup instead — measured as a black bulb every morning, with
  // the filament invisible against it. The lantern's barrel already states the
  // stylistic half of this rule; the bulb found the mechanical half. The pen
  // stays on the cap and the cord, which is where the sheet draws it anyway.
  //
  // Default front-face culling, on purpose: one thickness of glass, not two.
  // DoubleSide would blend the far wall in as well, and at these opacities
  // that is a second layer of milk on a thing whose whole job is to be seen
  // through.
  const envelope = new THREE.Mesh(glassGeo, glass);
  envelope.position.y = glassTop - gh;
  envelope.renderOrder = 5;
  g.add(envelope);

  // The filament, on the UNDERSIDE, which is the one part of a hanging bulb
  // anybody ever looks at. Inside the glass would be truer and would also be
  // invisible: nothing in this app is transparent, so a filament in there is a
  // squiggle in a sealed box.
  // The filament, laid on the FACE of the glass rather than under it.
  //
  // The sheet draws it dead centre and visible from front and back alike, which
  // an opaque envelope cannot do honestly — so there are two of them, one on
  // each side, each sitting a hair proud of the surface. Under the bulb, where
  // this used to be, is the one place the sheet never shows it.
  //
  // Small enough that the glass barely curves across it: at this arc's own
  // radius the surface falls away by seven thousandths, which the tube's own
  // thickness covers, so a flat arc stays proud the whole way round.
  // The filament, INSIDE the glass, where a filament goes.
  //
  // One of it, not two, and that is the whole gain from a transparent
  // envelope: it is visible from every side at once, which is what the sheet
  // draws — the same squiggle in FRONT, BACK, LEFT and RIGHT. The two surface
  // decals it replaces could only ever be right from two directions, and were
  // stuck to the outside of a bulb like a sticker.
  //
  // Opaque, so it lands in the opaque pass and the transparent glass blends
  // over it afterwards. That ordering is free and is the whole trick: nothing
  // here needs sorting by hand.
  // ONE WIRE, drawn as the reference draws it: in from the left with a hook,
  // down through a dip, up into a loop that crosses itself, down through a
  // second dip, and out to a hook on the right. A tube swept along a curve —
  // the same construction as the shelf flower's stem — because the shape IS a
  // pen stroke and a stroke is a path, not an assembly. The arch, bead and
  // stems this replaces were three primitives doing an impression of one.
  //
  // The ends hang free, which is what the drawing does. Nothing in this room
  // is load-bearing.
  //
  // Flat in the piece's own xz-facing plane. From edge-on it thins to a line,
  // which is also what a real filament does, and the piece has no `spin` to
  // aim it — a bulb is round and hangs where it hangs.
  const filY = glassTop - gh + rBulb * 0.96;
  const SQUIGGLE = [
    [-0.50, 0.28], [-0.59, 0.03], [-0.45, -0.28], [-0.18, -0.25],
    [0.00, 0.03], [-0.03, 0.30], [-0.23, 0.33], [-0.34, 0.10],
    [-0.18, -0.15], [0.10, -0.30], [0.35, -0.25], [0.51, -0.03],
    [0.48, 0.23],
  ];
  const wirePath = new THREE.CatmullRomCurve3(
    SQUIGGLE.map(([x, y]) => new THREE.Vector3(rBulb * x, filY + rBulb * y, 0)));
  g.add(new THREE.Mesh(
    new THREE.TubeGeometry(wirePath, 72, h * 0.0085, 6, false), dark));

  // The highlight. One small pale patch up on the shoulder, and the single
  // cheapest thing that says GLASS in a flat-shaded world — every drawing of a
  // bulb on the reference sheet has one, and nothing else here is shiny enough
  // to need one. Additive, so it brightens whatever the hour has made of the
  // envelope rather than sitting on it as a white sticker.
  const spec = new THREE.Mesh(
    new THREE.SphereGeometry(rBulb * 0.20, 10, 8),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xffffff),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.42,
    }));
  spec.scale.set(1.35, 0.85, 0.5);
  spec.position.set(-rBulb * 0.46, glassTop - gh + rBulb * 1.42, rBulb * 0.62);
  spec.renderOrder = 7;
  g.add(spec);

  // The light itself, a small additive core INSIDE the envelope. A bulb glows
  // from a point in the middle of it, and with the glass transparent that is
  // now something the piece can actually say rather than imply.
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(rBulb * 0.62, 14, 10),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(PAL.lampLit),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.55,
    }));
  core.position.y = filY - rBulb * 0.06;
  core.renderOrder = 4;
  g.add(core);

  // The bloom: THREE nested shells rather than one, each fainter and wider.
  //
  // The lantern's halo is a lathe and fades to nothing at both ends, which is
  // what stops it having an edge. A sphere cannot do that trick — every vertex
  // on a shell is the same distance out, so a vertex colour has nothing to fall
  // off along, and one uniform shell is a hard-rimmed ball of light. Measured
  // against the lantern side by side, that is exactly what read as a flat
  // yellow disc rather than a glow.
  //
  // Nesting gets the falloff back in the only currency a shell has: coverage.
  // Three of them, each adding over the last, sum to a core that is bright and
  // an outside that is nearly nothing — a stepped gradient rather than a smooth
  // one, and at this size the steps are well under a pixel apart.
  const haloes = [core];
  for (const [k, alpha] of [[1.18, 0.34], [1.52, 0.20], [1.95, 0.11]]) {
    const geo = new THREE.SphereGeometry(rBulb * k, 16, 12);
    geo.scale(1, 1.06, 1);
    const shell = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: new THREE.Color(PAL.lampLit),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: alpha,
    }));
    shell.position.y = glassTop - gh * 0.56;
    shell.renderOrder = 6;
    g.add(shell);
    haloes.push(shell);
  }

  g.updateMatrixWorld(true);
  const box = new THREE.Box3();
  for (const c of g.children) {
    if (!c.isMesh || c.material === ink()) continue;
    c.geometry.computeBoundingBox();
    box.union(c.geometry.boundingBox.clone().applyMatrix4(c.matrixWorld));
  }

  return {
    group: g,
    fills: [glass],
    // Hanging, so `top` is the plaster it is fixed to and the piece is all
    // below. Handed back honestly rather than forced to look like a floor
    // piece's — nothing stands on this and nothing walks into it.
    top: 0,
    drop: -box.min.y,
    rx: Math.max(box.max.x, -box.min.x),
    rz: Math.max(box.max.z, -box.min.z),
    glow: {
      // A bare bulb in a small room throws further than a lantern on the
      // floor, and from higher up, so its pool is wider and softer.
      //
      // 2.9 heights is 3.0 units, DOWN from 4.6 heights, and the direction of
      // that change is the whole difference between the two models.
      //
      // The old number was chosen to make sure the light got everywhere: the
      // note here worked out that the foot of the wall is about 3.9 away
      // through the air and pushed the reach past it so the corners "get a real
      // share" instead of holding their gloom to the skirting. Under a falloff
      // that is a long fading tail, that is the right instinct — a short reach
      // just means a dim room.
      //
      // Under a disc it is exactly backwards. The reach is not how far a hint
      // of light carries, it is the RADIUS OF THE CIRCLE, and a circle that
      // reaches every corner is a lit room with no circle in it. At 4.7 the
      // disc covered a whole room edge to edge and the model was invisible;
      // the gloom the old note complains about is the thing the reference
      // frame is mostly made of.
      //
      // It went to 2.9 heights first, argued "against a wall 3.2 out" — which
      // is the HOUSE's wall, and the bulb does not hang in the house. It hangs
      // at the apex of the CAVE: wall 4.0 out, and the filament measured 2.5
      // above the boards. A reach of 3.0 with the plateau ending at 1.9 meant
      // the circle ran out of radius in mid-air — a bright patch of ceiling
      // over a floor the light never touched, which is exactly how it
      // photographed.
      //
      // 4.4 heights is 4.5 units, fitted to the room it actually lights:
      // the boards directly below the filament sit at t=0.56, comfortably
      // inside the plateau; the floor 2.5 out is at half cover; and the foot
      // of the wall, 4.7 through the air, is past the rim entirely. The middle
      // of the cave is lit and its corners stay night, which is what a bare
      // bulb in a big room does.
      reach: h * 4.4,
      lit: glass,
      haloes,
      dim: GLASS_DIM,
      bright: GLASS_LIT,
      colour: PAL.lampGlow,
      // What it restores a surface to. Cooler than the lantern's, because this
      // is a wired bulb and that is a flame — the difference between the two
      // lights in the room, and now something the lighting can actually say
      // rather than a fact about their glass alone. Barely: both are near
      // white, and the gap between them is meant to be felt rather than seen.
      restore: '#FFF6EC',
      // No foot to shadow — it is in the air — so the pool fills its middle.
      hole: 0.02,
      // How far below the plaster the light itself is, so scene.js can put the
      // room's light source where the light source is rather than at the point
      // the flex is nailed to. The filament's own core, which is the honest
      // answer and also the visible one — it is the additive ball you can see
      // through the glass.
      //
      // NEGATIVE, unlike the lantern's, and that is the piece being hung
      // rather than stood: everything about this one is built downward from an
      // origin on the ceiling. A light term handed the anchor instead would
      // reach the room from a foot inside the plaster, which reads as a room
      // lit through its own roof.
      at: core.position.y,
      // What it looks like burning, and what the switch writes.
      on: PAL.lampLit,
      off: PAL.lampGlass,
    },
  };
}

// --------------------------------------------------------------- being held
//
// A built piece can be picked up, and there are two places that show one: the
// slot at the edge of your own sight (hand.js) and a character's own hands
// (character.js). Both have to do the same two things to a freshly built copy —
// size it, and find out what in it wears the hour — so both do them from here.
//
// It lives in this file rather than in either holder because it is a fact about
// the PIECES, not about the holding: what a copy needs before it can be carried
// is the same answer whoever is carrying it.

const _fitBox = new THREE.Box3();
const _fitSize = new THREE.Vector3();
const _fitCentre = new THREE.Vector3();

// Size a copy so its longest dimension is `height`, centred about its own
// middle — so a piece modelled off-centre spins about itself rather than about
// its birthplace. Returns the scale used.
//
// MEASURED ALONE AND AT SCALE 1, ALWAYS — the whole of a bug worth remembering,
// because it had two halves and fixing one left it broken.
//
// The copies are built once and kept, so the second time one is picked up it
// arrives already wearing the scale and the centring offset the FIRST pickup
// gave it. Measuring in that state and scaling again compounds both. That is
// the obvious half, and resetting the transform fixes it.
//
// The half that hides: a holder that drops the HOLDER rather than the object
// leaves the object a child of a discarded group carrying that slot's
// three-quarter turn. `setFromObject` reads WORLD matrices, so the box came
// back as the bounding box of a ROTATED bear — bigger than the upright one, by
// a different amount each time as the offset shifted. Measured over six
// pick-ups the fit factor read 0.743, 0.461, 0.596, 0.680, 0.722, 0.742: not a
// drift but a slow convergence, which is exactly the shape of a feedback loop
// reading its own output.
//
// So: off any parent, transform cleared, then measured.
//
// ITS OWN ROTATION IS LEFT ALONE, because a copy is built for the slot it is
// going into and arrives in the pose that slot wants — the bear stood back up
// out of the lying-down it wears on the futon, the sasumata turned so its fork
// faces out. Resetting the rotation here undid that silently and handed you a
// bear carried flat like a tray.
export function fitHeld(obj, height) {
  obj.removeFromParent();
  obj.position.set(0, 0, 0);
  obj.scale.setScalar(1);
  obj.updateMatrixWorld(true);
  _fitBox.setFromObject(obj);
  const size = _fitBox.getSize(_fitSize);
  const k = height / Math.max(size.x, size.y, size.z, 1e-4);
  const centre = _fitBox.getCenter(_fitCentre);
  obj.position.copy(centre).multiplyScalar(-k);
  obj.scale.setScalar(k);
  return k;
}

// What in a copy wears the hour, as a list with no duplicates.
//
// `baseColor` is the mark of a fill — see fillMat above — and it is exactly the
// right test, because the two things it excludes are the two that must be
// excluded: the shared ink, which would stop being an outline the moment it
// dimmed, and the additive halos, which are light and cannot be darkened by the
// dark they are holding off.
export function heldMaterials(obj) {
  const out = [];
  obj.traverse((o) => {
    const m = o.material;
    if (!m || !m.userData || !m.userData.baseColor) return;
    if (out.indexOf(m) < 0) out.push(m);
  });
  return out;
}

export const BUILD = {
  table: buildTable,
  openbook: buildOpenBook,
  stool: buildStool,
  futon: buildFuton,
  wornbedding: buildWornBedding,
  pinkweapon: buildPinkWeapon,
  blueweapon: buildBlueWeapon,
  housekey: buildHouseKey,
  plushie: buildPlushie,
  box: buildBox,
  teapot: buildTeapot,
  shelf: buildShelf,
  lantern: buildLantern,
  bulb: buildBulb,
  nightstand: buildNightstand,
  trashbag: buildTrashBag,
  trashbag2: buildTrashBagAlt,
};
