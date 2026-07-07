// public/reveal.js
// Lightweight scroll-reveal: adds .is-visible the first time an element
// with .reveal or .reveal-group enters the viewport, then stops watching
// it (this is a first-time/occasional-frequency animation, not something
// that should re-trigger every scroll). No-ops gracefully if
// IntersectionObserver isn't available — elements just render visible.

(function () {
  if (!('IntersectionObserver' in window)) {
    document.querySelectorAll('.reveal, .reveal-group').forEach((el) => el.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: '0px 0px -60px 0px' }
  );

  document.querySelectorAll('.reveal, .reveal-group').forEach((el) => observer.observe(el));
})();
