/* Vahm ambient music engine
   - plays ambient.mp3 quietly under everything, looping with a 4s crossfade
   - carries over between pages (position + on/off saved in sessionStorage)
   - browsers only allow sound after a user interaction, so start() retries on the first click/keypress */
(function () {
  const SRC = 'ambient.mp3';
  const BASE = 0.18;     // overall music loudness (0..1). Raise for louder, lower for quieter.
  const XFADE = 4;       // seconds of crossfade at the loop point
  const KEY = 'vahm_music';

  const a = new Audio(SRC), b = new Audio(SRC);
  [a, b].forEach(x => { x.preload = 'auto'; x.volume = 0; });
  const g = new Map([[a, 0], [b, 0]]);          // per-element crossfade gain
  let cur = a, nxt = b, crossing = false;
  let level = 0, target = 0, speed = 0;          // master fade (0..1)
  let started = false, wantOn = true, lastTick = performance.now();

  function setVol(el) { el.volume = Math.max(0, Math.min(1, g.get(el) * level * BASE)); }

  function tick(now) {
    const dt = (now - lastTick) / 1000; lastTick = now;
    if (level !== target) {
      const step = speed * dt;
      level = level < target ? Math.min(target, level + step) : Math.max(target, level - step);
    }
    if (started && cur.duration && !cur.paused) {
      const remaining = cur.duration - cur.currentTime;
      if (!crossing && remaining < XFADE) {
        crossing = true; nxt.currentTime = 0; g.set(nxt, 0);
        nxt.play().catch(() => {});
      }
      if (crossing) {
        const k = Math.max(0, Math.min(1, remaining / XFADE));
        g.set(cur, k); g.set(nxt, 1 - k);
        if (remaining <= 0.05) {
          cur.pause(); g.set(cur, 0);
          const t = cur; cur = nxt; nxt = t; g.set(cur, 1); crossing = false;
        }
      }
    }
    setVol(a); setVol(b);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  function fadeTo(v, secs) {
    target = v;
    speed = Math.abs(v - level) / Math.max(0.05, secs);
  }

  function start(opts) {
    opts = opts || {};
    if (started) return Promise.resolve();
    wantOn = opts.on !== false;
    if (opts.offset) { try { cur.currentTime = opts.offset; } catch (e) {} }
    g.set(cur, 1);
    return cur.play().then(() => {
      started = true;
      fadeTo(wantOn ? 1 : 0, opts.fadeIn || 3);
    }).catch(() => {
      // autoplay blocked: begin on the first interaction instead
      const kick = () => { start(opts); };
      window.addEventListener('pointerdown', kick, { once: true });
      window.addEventListener('keydown', kick, { once: true });
    });
  }

  function setOn(on, secs) {
    wantOn = on;
    if (!started) { if (on) return start({ fadeIn: secs || 3 }); return; }
    fadeTo(on ? 1 : 0, secs || 0.5);
  }

  function save() {
    try {
      sessionStorage.setItem(KEY, JSON.stringify({
        t: started ? cur.currentTime : 0, on: wantOn, started: started
      }));
    } catch (e) {}
  }
  window.addEventListener('pagehide', save);
  window.addEventListener('beforeunload', save);

  // Resume from the previous page, if it was already playing
  function resume(fadeIn) {
    try {
      const s = JSON.parse(sessionStorage.getItem(KEY) || 'null');
      if (s && s.started) { start({ offset: s.t, on: s.on, fadeIn: fadeIn || 4 }); return true; }
    } catch (e) {}
    return false;
  }

  window.VahmMusic = {
    start, setOn, resume, save,
    isOn: () => wantOn && started,
    fadeTo
  };
})();
