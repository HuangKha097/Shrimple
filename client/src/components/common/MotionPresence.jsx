import { useLayoutEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';

export default function MotionPresence({ open, children, ...props }) {
    const [present, setPresent] = useState(open);
    const rootRef = useRef(null);
    useLayoutEffect(() => {
        if (open && !present) { setPresent(true); return; }
        if (!present) return;
        const root = rootRef.current;
        const panel = root.firstElementChild || root;
        const media = gsap.matchMedia();
        media.add({ always: 'all', reduce: '(prefers-reduced-motion: reduce)' }, context => {
            if (context.conditions.reduce) { if (!open) setPresent(false); return; }
            const timeline = gsap.timeline({ onComplete: () => { if (!open) setPresent(false); } });
            if (open) {
                timeline.fromTo(root, { opacity: 0 }, { opacity: 1, duration: .24, clearProps: 'opacity' }, 0)
                    .fromTo(panel, { scale: .96 }, { scale: 1, duration: .28, ease: 'power3.out', clearProps: 'transform' }, 0);
            } else {
                timeline.to(root, { opacity: 0, duration: .18 }, 0)
                    .to(panel, { scale: .975, duration: .18, ease: 'power2.in' }, 0);
            }
        });
        return () => media.revert();
    }, [open, present]);
    if (!present) return null;
    return <div ref={rootRef} inert={!open} {...props}>{children}</div>;
}
