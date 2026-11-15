/* global gsap */
window.Nova = {
  create(id) {
    const tl = gsap.timeline({ paused: true, defaults: { ease: "power3.out", duration: 0.7 } });
    tl.novaSelect = gsap.utils.selector(document.querySelector('[data-composition-id="' + id + '"]'));
    return tl;
  },
  timeline(id, duration) {
    const tl = this.create(id);
    const scope = tl.novaSelect;
    tl.addLabel(id, 0);
    if (scope(".kicker").length) tl.fromTo(scope(".kicker"), { opacity: 0.4, y: 12 }, { opacity: 1, y: 0, duration: 0.45 }, 0);
    if (scope(".headline").length) tl.fromTo(scope(".headline"), { opacity: 0, y: 50 }, { opacity: 1, y: 0, duration: 0.8 }, 0.15);
    if (scope(".subline").length) tl.fromTo(scope(".subline"), { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6 }, 0.6);
    if (scope(".scene-footer, .demo").length) tl.fromTo(scope(".scene-footer, .demo"), { opacity: 0 }, { opacity: 1, duration: 0.4 }, 0.8);
    tl.fromTo(scope(".scene"), { opacity: 1 }, { opacity: 0.35, duration: 0.2, ease: "power2.in", immediateRender: false }, duration - 0.2);
    return tl;
  },
  enter(tl, selector, at, extra = {}) {
    tl.fromTo(tl.novaSelect(selector), { opacity: 0, y: 36, ...extra }, { opacity: 1, y: 0, x: 0, scale: 1, rotation: 0, duration: 0.75, stagger: 0.11 }, at);
  },
  register(id, tl) {
    window.__timelines = window.__timelines || {};
    window.__timelines[id] = tl;
  },
};
