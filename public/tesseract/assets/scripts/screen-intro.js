// Open the glass, wait one second, then release the independent content entrances.
const root = document.documentElement;
const gate = document.querySelector('#screen-startup');
const motion = matchMedia('(prefers-reduced-motion: reduce)');
let before = 0, after = 0, fallback = 0, started = false, opened = false;
const release = () => {
  if (!root.classList.contains('content-hold')) return;
  root.classList.remove('content-hold');
  document.dispatchEvent(new Event('crt:contentstart'));
  document.dispatchEvent(new CustomEvent('crt:frame', { detail:{ graphics:true } }));
};
function finish() {
  if (opened) return;
  opened = true;
  clearTimeout(before); clearTimeout(fallback);
  root.classList.remove('crt-booting', 'crt-powering');
  document.querySelector('#screen-power')?.remove();
  document.dispatchEvent(new Event('crt:layout'));
  if (motion.matches) release();
  else after = setTimeout(release, 1000);
}
function ready() {
  if (started || root.classList.contains('is-loading')) return;
  started = true;
  observer.disconnect();
  if (motion.matches) { finish(); return; }
  before = setTimeout(() => {
    root.classList.add('crt-powering');
    fallback = setTimeout(finish, 1700);
  }, 1000);
}
const observer = new MutationObserver(ready);
observer.observe(root, { attributes:true, attributeFilter:['class'] });
gate.addEventListener('animationend', event => {
  if (event.target === gate && event.animationName === 'screen-power-on') finish();
});
motion.addEventListener('change', () => {
  if (motion.matches) { clearTimeout(after); finish(); release(); }
});
ready();
