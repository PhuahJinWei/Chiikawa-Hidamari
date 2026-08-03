// Bump CACHE whenever you ship a change, otherwise phones keep the old build.
const CACHE = 'hidamari-v193';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './css/style.css',
  './js/main.js',
  './js/scene.js',
  './js/household.js',
  './js/furniture.js',
  './js/foliage.js',
  './js/water.js',
  './js/fish.js',
  './js/items.js',
  './js/hand.js',
  './js/fishing.js',
  './js/camera-control.js',
  './js/character.js',
  './js/dialogue.js',
  './js/social.js',
  './js/lines.js',
  './js/config.js',
  './js/cast.js',
  './js/sphere.js',
  './js/daylight.js',
  './js/weather.js',
  './js/falling.js',
  './js/snowfield.js',
  './js/art.js',
  './js/assets.js',
  // The drawn art. Unlike the code, none of this is optional at runtime: the
  // app awaits every one of these before it builds anything, so a cold cache
  // with no network is a start card that never turns into an invitation.
  // Add every new expression sheet here as you draw it.
  // `ground-day.png` stood here — 2000x1000 of one flat green. The planet
  // paints its own surface now, with biomes and tick marks that no single
  // drawing could carry. See paintGlobe in art.js.
  './asset/images/bush-1.png',
  './asset/images/bush-2.png',
  // ...and the same two with snow on them. See WORLD_SNOW in assets.js: a bush
  // is a drawing, so its winter is a redraw rather than a tint.
  './asset/images/bush-1-snow.png',
  './asset/images/bush-2-snow.png',
  // `lake.png` stood here. The ponds are built — see water.js.
  './asset/images/house-day-1.png',
  './asset/images/house-night-1.png',
  './asset/images/chiikawa-house-plate.png',
  // The three tree sheets and stump.png stood here, 199KB of the install
  // budget. Trees and stumps are built geometry — their cards are never shown —
  // so the drawings are retired to `asset/images/legacy/` and nothing fetches
  // them. See the note in assets.js.
  './asset/images/sun.png',
  './asset/images/moon.png',
  // The five grass tuft drawings stood here. Grass is built blades now, which
  // need no texture, and the drawings are archived in `asset/images/legacy/`.
  // They were left listed here for a while after the art had moved, which
  // cached five 404s every install — survivable, since install adds each entry
  // separately and swallows misses, but a list that lies about what the app
  // needs is the one thing this file must never be.
  './asset/images/flower-1.png',
  './asset/images/flower-2.png',
  './asset/images/flower-3.png',
  './asset/images/flower-4.png',
  './asset/images/flower-5.png',
  // The same blossoms drawn without their stalks, for scattering over a built
  // tree's canopy. Add one here as you draw it, and bump
  // FLOWER_TEXTURE_VARIANTS in assets.js.
  './asset/images/flower-texture-1.png',
  './asset/images/flower-texture-2.png',
  './asset/images/flower-texture-3.png',
  './asset/images/flower-texture-4.png',
  // The six `flat-flower-*.png` clusters stood here. They lay ON the grass as
  // decals, and both halves of that job moved: the field prints its own blooms
  // at distance now, and up close the standing flowers and grass blades do it.
  // See the note in assets.js.
  './asset/images/mushroom-1.png',
  './asset/images/mushroom-2.png',
  './asset/images/grass-1.png',
  // The notes over a singer — see TUNE_VARIANTS in assets.js.
  './asset/images/effects/tune-1.webp',
  './asset/images/effects/tune-2.webp',
  './asset/images/effects/tune-3.webp',
  './asset/images/effects/tune-4.webp',
  // The twelve fish, one drawing per species — see FISH_SPECIES in config.js,
  // which is the list this one has to agree with. Required like the rest: the
  // school builds a card per species before the world is shown, so a fish
  // missing here is a fish missing from the lake on a cold offline start.
  // A thirteenth is a row there, a file, and a line here.
  './asset/images/fish/peach-carp.png',
  './asset/images/fish/apricot-moonspot-carp.png',
  './asset/images/fish/golden-dashfin.png',
  './asset/images/fish/lime-blossomfin.png',
  './asset/images/fish/limebar-minnow.png',
  './asset/images/fish/mint-pearl-minnow.png',
  './asset/images/fish/sky-teardrop-fish.png',
  './asset/images/fish/blue-button-puffer.png',
  './asset/images/fish/lilac-needlefish.png',
  './asset/images/fish/lavender-pebblefin.png',
  './asset/images/fish/pink-ripplefin.png',
  './asset/images/fish/blushspot-loach.png',
  // The start screen, and the whole of what it fetches. Unlike everything above
  // these are wanted *before* the wait rather than after it — nothing awaits
  // them, so a miss is a menu with no drawing behind it, or a road with no car
  // on it, rather than a broken build.
  //
  // The meadow ships as WebP: the source PNG beside it is 1.5MB, which on a cold
  // connection is several seconds of flat blue on the one screen whose whole job
  // is to have something to look at. The same drawing at quality 88 is 62KB.
  // Keep the PNG as the source, ship the WebP — and RE-ENCODE IT when the source
  // is redrawn, which is the one step easy to forget: the encoded file is not
  // derived at build time, so a new PNG beside an old WebP ships the old picture.
  './asset/images/bg-menu.webp',
  // All three cars, because which one is driving is picked at random per load.
  './asset/images/loading-1.png',
  './asset/images/loading-2.png',
  './asset/images/loading-3.png',
  // The pack's tiles. Different pictures from the drawings above on purpose —
  // see ICONS in assets.js. WebP for the same reason bg-menu is: the sources are
  // 1254px and about a megabyte each, which would be twenty megabytes of start
  // screen for something never shown above 70px. Drawing a new one means the
  // file, a row in ICONS, and a line here.
  './asset/images/icon/icon-common-grass.webp',
  './asset/images/icon/icon-common-mushroom-red.webp',
  './asset/images/icon/icon-common-mushroom-regular.webp',
  './asset/images/icon/icon-fish-apricot-moonspot-carp.webp',
  './asset/images/icon/icon-fish-blue-button-puffer.webp',
  './asset/images/icon/icon-fish-blushspot-loach.webp',
  './asset/images/icon/icon-fish-golden-dashfin.webp',
  './asset/images/icon/icon-fish-lavender-pebblefin.webp',
  './asset/images/icon/icon-fish-lilac-needlefish.webp',
  './asset/images/icon/icon-fish-lime-blossomfin.webp',
  './asset/images/icon/icon-fish-limebar-minnow.webp',
  './asset/images/icon/icon-fish-mint-pearl-minnow.webp',
  './asset/images/icon/icon-fish-peach-carp.webp',
  './asset/images/icon/icon-fish-pink-ripplefin.webp',
  './asset/images/icon/icon-fish-sky-teardrop-fish.webp',
  './asset/images/icon/icon-special-chiikawa-fork.webp',
  './asset/images/icon/icon-special-hachiware-camera.webp',
  './asset/images/icon/icon-special-hachiware-guitar.webp',
  './asset/images/icon/icon-special-hachiware-fork.webp',
  './asset/images/icon/icon-special-chiikawa-housekey.webp',
  './asset/images/icon/icon-unique-bear.webp',
  './asset/images/icon/icon-unique-book.webp',
  './asset/images/icon/icon-unique-kettle.webp',
  './asset/images/icon/icon-unique-lamp.webp',
  './asset/images/icon/icon-unique-trashbag.webp',
  './asset/images/characters/chiikawa-idle.png',
  './asset/images/characters/chiikawa-happy.png',
  './asset/images/characters/chiikawa-delight.png',
  './asset/images/characters/chiikawa-sleep.png',
  './asset/images/characters/hachiware-idle.png',
  './asset/images/characters/hachiware-happy.png',
  './asset/images/characters/hachiware-surprise.png',
  './asset/images/characters/hachiware-sleep.png',
  './asset/images/characters/usagi-idle.png',
  './asset/images/characters/usagi-happy.png',
  './asset/images/characters/usagi-surprise.png',
  './asset/images/characters/usagi-sleep.png',
  // The hobbies — see PASTIMES in household.js. Required like every other
  // sheet: the app awaits them all before it builds anything.
  './asset/images/characters/hachiware-pastime-1.png',
  './asset/images/characters/hachiware-pastime-1-snow.png',
  './asset/images/characters/usagi-pastime-1.png',
  './asset/images/characters/usagi-pastime-1-snow.png',
  './asset/images/characters/momonga-idle.png',
  './asset/images/characters/momonga-fly.png',
  './asset/images/characters/momonga-happy.png',
  './asset/images/characters/momonga-happy-snow.png',
  './asset/images/characters/momonga-delight.png',
  './asset/images/characters/momonga-delight-snow.png',
  './asset/images/characters/momonga-surprise.png',
  './asset/images/characters/momonga-surprise-snow.png',
  // The winter wardrobe — see `snow` in cast.js, which is the list this one has
  // to agree with. Required exactly as the sheets above are: a name in that
  // list with no file here is a cold offline start that never finishes loading.
  // `hachiware-sleep-snow.png` is drawn and deliberately NOT listed; nothing
  // fetches it until the other two sleepers have one.
  './asset/images/characters/chiikawa-idle-snow.png',
  './asset/images/characters/chiikawa-happy-snow.png',
  './asset/images/characters/chiikawa-delight-snow.png',
  './asset/images/characters/hachiware-idle-snow.png',
  './asset/images/characters/hachiware-happy-snow.png',
  './asset/images/characters/hachiware-surprise-snow.png',
  './asset/images/characters/usagi-idle-snow.png',
  './asset/images/characters/usagi-happy-snow.png',
  './asset/images/characters/usagi-surprise-snow.png',
  './asset/images/characters/momonga-idle-snow.png',
  './asset/images/characters/momonga-fly-snow.png',
  'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // addAll rejects the whole batch if one entry 404s; add individually so a
      // single miss cannot leave the app with no cache at all.
      .then((c) => Promise.all(ASSETS.map((u) => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => {
      // Offline, and nothing cached under this exact URL. `hit` is undefined by
      // definition here — we only reach the network when it missed — and
      // resolving respondWith to undefined is not "let the browser handle it",
      // it is a TypeError and a dead tab.
      //
      // A navigation can still be answered with the shell: launchers append
      // things like ?source=pwa to start_url, which never matches the cached
      // './index.html' on its own even though it is the very page wanted.
      // Anything else is an honest miss, but it has to be said as a Response.
      if (e.request.mode === 'navigate') {
        return caches.match('./index.html').then((shell) => shell || Response.error());
      }
      return Response.error();
    })),
  );
});
