(function () {
  var demo = document.getElementById('tt-demo');
  if (!demo) return;
  var video = demo.querySelector('.tt-video');
  var START_AT = 2.5; // video ke shuru ke itne second skip (black wala hissa). 0 karoge to poora video chalega
  var timers = [], running = false;

  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
  function clearAll() { timers.forEach(clearTimeout); timers = []; }
  function play() {
    try { video.currentTime = START_AT; var p = video.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
  }

  function cycle() {
    if (!running) return;
    clearAll();
    demo.classList.remove('is-approach', 'is-tap', 'is-live');
    try { video.pause(); video.currentTime = START_AT; } catch (e) {}

    later(function () { demo.classList.add('is-approach'); }, 600);        // phone aata hai
    later(function () { demo.classList.add('is-tap'); }, 2100);            // card par tap + rings
    later(function () { demo.classList.add('is-live'); play(); }, 2350);   // video chalu

    var dur = (isFinite(video.duration) && video.duration > 0 ? video.duration : 7) - START_AT;
    later(leave, 2350 + dur * 1000 + 4000); // safety timer
  }

  function leave() {
    clearAll();
    demo.classList.remove('is-approach', 'is-tap');  // phone wapas jata hai
    later(cycle, 1800);
  }

  video.addEventListener('ended', function () {
    if (!running) return;
    clearAll();
    later(leave, 1400); // end par 1.4 sec ruk kar phone hatta hai
  });

  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) {
    demo.classList.add('is-approach', 'is-live'); play(); return;
  }

  // sirf screen par dikhne par chalao
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (e) {
      if (e[0].isIntersecting && !running) { running = true; cycle(); }
      else if (!e[0].isIntersecting && running) { running = false; clearAll(); video.pause(); }
    }, { threshold: 0.35 }).observe(demo);
  } else { running = true; cycle(); }
})();