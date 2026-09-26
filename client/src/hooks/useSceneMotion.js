import { useLayoutEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { finishThemeTransition } from '../lib/motion';

export function useSceneMotion(shellRef, contentRef, routeKey) {
    const previousBounds = useRef(null);
    useLayoutEffect(() => {
        finishThemeTransition();
        const shell = shellRef.current;
        const content = contentRef.current;
        const target = shell.getBoundingClientRect();
        const previous = previousBounds.current;
        let timeline;
        let lastFrame = target;
        const media = gsap.matchMedia();
        media.add({ always: 'all', reduce: '(prefers-reduced-motion: reduce)' }, context => {
            if (context.conditions.reduce) { lastFrame = shell.getBoundingClientRect(); return; }
            timeline = gsap.timeline({ defaults: { ease: 'power3.out' }, onUpdate: () => { lastFrame = shell.getBoundingClientRect(); } });
            if (previous && (Math.abs(previous.width - target.width) > 1 || Math.abs(previous.height - target.height) > 1)) {
                timeline.fromTo(shell, {
                    width: previous.width, height: previous.height,
                    y: previous.y - target.y - (target.height - previous.height) / 2,
                }, {
                    width: target.width, height: target.height, y: 0,
                    duration: .48, ease: 'power3.inOut', clearProps: 'width,height,transform',
                }, 0);
            }
            timeline.fromTo(content, { scale: .975, opacity: .45, transformOrigin: '50% 40%' }, {
                scale: 1, opacity: 1, duration: .4, clearProps: 'transform,opacity,transformOrigin',
            }, previous ? .04 : 0);
        });
        const settleOnResize = () => {
            timeline?.progress(1);
            lastFrame = shell.getBoundingClientRect();
            previousBounds.current = lastFrame;
        };
        window.addEventListener('resize', settleOnResize);
        return () => {
            previousBounds.current = lastFrame;
            window.removeEventListener('resize', settleOnResize);
            media.revert();
        };
    }, [routeKey, shellRef, contentRef]);
}
