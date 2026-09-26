import { gsap } from 'gsap';

let themeTimeline;
let themeMedia;
export function animateThemeChange(update) {
    themeTimeline?.kill();
    themeMedia?.revert();
    const scene = document.getElementById('root');
    if (!scene || document.hidden) { update(); return; }
    themeMedia = gsap.matchMedia();
    themeMedia.add({ always: 'all', reduce: '(prefers-reduced-motion: reduce)' }, context => {
        if (context.conditions.reduce) { update(); return; }
        themeTimeline = gsap.timeline({ defaults: { ease: 'power2.inOut' } })
            .to(scene, { scale: .985, opacity: .78, transformOrigin: '50% 50vh', duration: .12 })
            .call(update)
            .to(scene, { scale: 1, opacity: 1, duration: .3, clearProps: 'transform,opacity,transformOrigin' });
    });
}

export function finishThemeTransition() {
    themeTimeline?.progress(1);
    themeTimeline?.kill();
    themeMedia?.revert();
    themeTimeline = null;
    themeMedia = null;
}
