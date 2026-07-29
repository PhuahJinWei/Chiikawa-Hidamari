// THE SHAPE OF A LAMP, in one place.
//
// Everything about how far a light reaches and what it does when it gets there
// lives here, so that the shader that evaluates it and anything that ever has
// to PAINT it — a stamp on a floor, a decal on grass — are reading one
// definition rather than two that were fitted to each other by hand and drift.
//
// That drift is the thing this file exists to stop. The system it replaces had
// the falloff written down four times: as gradient stops in paintLampGlow, as
// different gradient stops in paintItemGlow, and as two exponents in scene.js
// (2.4 and 2.0) each fitted by measurement to one of those stamps. Every one of
// them was correct, and keeping them correct was a standing tax on changing
// anything.
//
// --------------------------------------------------------------- the profile
//
// A lamp is a DISC, not a glow. That is the whole of the model and it is a
// claim about the reference art rather than about optics.
//
// A physical point light falls off with the square of distance: brightest at
// one point and dimming from the first step outward. Draw that and you get a
// bright core bleeding into gloom — which is a perfectly good picture of a lamp
// and is not the picture the anime draws. There, a lantern on a cave floor puts
// a CIRCLE on the world: near enough uniform across most of its span, then one
// quick soft edge, and outside it the dark is simply the dark. The edge is the
// point. It is what makes the lit part read as somewhere you are, and it is
// exactly what an inverse square has none of.
//
// So: flat out to `plateau`, then a smoothstep to nothing at the rim.
//
//   t = ( distance − inner ) / reach
//   disc( t ) = 1 − smoothstep( plateau, 1, t )
//
// `t` is 0 at the lamp and 1 at the edge of its reach, and `inner` is how far
// out the measurement starts — nonzero only for a light being modelled from
// somewhere other than where it is, which on this planet means a lit building
// seen from outside its own wall.
//
// The rim's softness is whatever is left: `1 − plateau`. One number therefore
// sets both, which is right, because they are one decision — how much of the
// reach is the circle and how much is its edge.
export const PLATEAU = 0.62;

// The same curve in JS, for anything that has to agree with the shader without
// being one — a painted stamp, a test, a number quoted in a comment.
export function disc(t, plateau = PLATEAU) {
  if (t <= plateau) return 1;
  if (t >= 1) return 0;
  const u = (t - plateau) / (1 - plateau);
  return 1 - u * u * (3 - 2 * u);
}

// ------------------------------------------------------------- what it does
//
// A lamp RESTORES a surface toward daylight. It does not add light to it.
//
// This is the second half of the model and the half that cannot be reached by
// tuning the first. The system before this added a warm colour to whatever the
// surface already was, which is what light does physically and what paint does
// on a screen — and it has one consequence that no choice of colour or strength
// escapes: every lit surface moves TOWARD the lamp's hue. Cream art overshoots
// to yellow-white, and blue art — a cap, a book spine, a stripe on a mug — goes
// through grey to beige. The drawing loses its own colours in exactly the place
// the picture is asking you to look.
//
// What the reference does instead is take the dark away. A night interior is
// flat art under a dark multiply; where a lamp reaches, that multiply is lifted
// and the art is simply itself again. Blue stays blue, because nothing was ever
// added to it — something was removed.
//
//   colour = art × mix( dark, target, K )
//
// `dark` is the hour's own multiply, `K` is how completely this fragment is
// covered by lamplight (0 to 1, summed over every lamp and clamped), and
// `target` is what full coverage restores TO — very nearly white, leaning a
// little warm for a flame and less so for a bulb.
//
// Three things fall out of the arithmetic rather than having to be arranged:
//
//   Overlap cannot blow out. K is clamped, so two lamps covering one patch of
//   floor restore it once. The old additive stamps summed past white over the
//   middle of a room and needed a constant halving them to stay legible.
//
//   Daylight needs no special case. At noon `dark` is white and `target` is
//   near-white, so the mix barely moves and lamps stop mattering on their own.
//   Nothing has to gate them by hour.
//
//   The edge of the light is the edge of the disc, at every hour, on every
//   surface, whatever the surface's own colour is.
//
// The GLSL below is generated rather than written out, because the loop bound
// is the number of lamps in the world and that is only known once the world has
// been scattered. It expects the caller to have declared the uniform block it
// reads — see LAMP_UNIFORMS in scene.js — and leaves two values behind:
// `lampK`, the coverage, and `lampT`, the colour to restore toward.
//
// `mask` is the caller's answer to "can THIS surface see lamp i at all", as a
// GLSL expression in `i`. It is a parameter rather than a fixed term because
// the answer has two forms and they are not interchangeable. A surface nailed
// to one side of a wall knows its side at build and asks a constant question —
// `uLampIn[ i ]` indoors. Anything that can walk through a door does not, and
// has to compare the lamp's side against its own, live. Passing it in is what
// lets both use this one loop rather than growing a second copy that has to be
// kept in step.
//
// `from` is the point the distances are measured from, and is `vLampAt` for
// everything that stands on the planet. The one exception is whatever is in
// your hand: it hangs off the camera rather than off the world, and the world
// bobs, so its distance to a lamp has to have the planet's own offset added
// back or the thing you are carrying pulses on the bob's cycle.
export function restoreGLSL(n, mask = 'uLampIn[ i ]', from = 'vLampAt') {
  return `
    vec3 lampFrom = ${from};
    vec3 lampAcc = vec3( 0.0 );
    float lampK = 0.0;
    for ( int i = 0; i < ${n}; i++ ) {
      float lampD = distance( uLampAt[ i ], lampFrom );
      float lampT0 = ( lampD - uLampInner[ i ] ) / uLampReach[ i ];
      float k = uLampK[ i ] * ( ${mask} )
        * ( 1.0 - smoothstep( uPlateau, 1.0, lampT0 ) );
      lampAcc += uLampTarget[ i ] * k;
      lampK += k;
    }
    // The colour to restore toward, weighted by how much each lamp is
    // contributing here — so a patch of floor reached by a warm lantern and a
    // cooler bulb lands between them rather than taking whichever was written
    // last. Guarded because an unlit fragment divides by nothing, and its
    // target is never read: mix() is at 0 there.
    vec3 lampT = lampK > 0.0001 ? lampAcc / lampK : vec3( 1.0 );
    float lampCover = clamp( lampK, 0.0, 1.0 );
  `;
}

// What a surface does with the two values above. Split out so the one line
// that actually decides the picture is not buried inside a loop.
//
// THE max() IS THE WHOLE OF "A LAMP CANNOT DARKEN ANYTHING", and it is not a
// safety rail bolted on — without it the model is wrong at noon.
//
// `target` is a near-white with a little warmth in it, which is brighter than
// the dark at every hour that has any dark to speak of. At midday it is not:
// the hour's own multiply is pure #FFFFFF, and mixing white toward #FFF0DB
// makes a surface DIMMER and yellower the more completely a lamp covers it. A
// lit lantern in a sunlit room was measured taking the floor down by as much as
// 121 levels — a lamp casting shade.
//
// Clamping the result at the dark says the one thing that was actually meant:
// a lamp takes the dark away and can never add any. It also makes the
// self-disabling property true rather than nearly true — at noon there is no
// dark to take, so every lamp in the world stops mattering on its own, with no
// hour gate anywhere.
//
// Equivalent to restoring toward max( dark, target ), and written this way
// round because it is the RESULT that must not fall below the dark: the two are
// identical at every coverage, and this form says why.
export const RESTORE_APPLY
  = 'diffuseColor.rgb *= max( mix( uDark, lampT, lampCover ), uDark );';
