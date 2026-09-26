import React, { useEffect, useRef } from 'react';

/**
 * XBackground - An ambient glowing canvas inspired by Animate UI Backgrounds & X aesthetic.
 * Features subtle dark gradient meshes and twinkling floating micro-particles.
 */
const XBackground = ({ className = '' }) => {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationFrameId;
        let width = (canvas.width = canvas.offsetWidth);
        let height = (canvas.height = canvas.offsetHeight);

        const handleResize = () => {
            if (!canvas) return;
            width = canvas.width = canvas.offsetWidth;
            height = canvas.height = canvas.offsetHeight;
        };

        window.addEventListener('resize', handleResize);

        // Particle generation
        const particleCount = Math.min(Math.floor((width * height) / 12000), 60);
        const particles = Array.from({ length: particleCount }, () => ({
            x: Math.random() * width,
            y: Math.random() * height,
            radius: Math.random() * 1.5 + 0.5,
            vx: (Math.random() - 0.5) * 0.3,
            vy: (Math.random() - 0.5) * 0.3,
            alpha: Math.random() * 0.5 + 0.1,
            fadeSpeed: (Math.random() * 0.008 + 0.002) * (Math.random() > 0.5 ? 1 : -1)
        }));

        const render = () => {
            ctx.clearRect(0, 0, width, height);

            // Render floating subtle particles
            particles.forEach((p) => {
                p.x += p.vx;
                p.y += p.vy;

                if (p.x < 0) p.x = width;
                if (p.x > width) p.x = 0;
                if (p.y < 0) p.y = height;
                if (p.y > height) p.y = 0;

                p.alpha += p.fadeSpeed;
                if (p.alpha > 0.7) {
                    p.alpha = 0.7;
                    p.fadeSpeed = -Math.abs(p.fadeSpeed);
                } else if (p.alpha < 0.1) {
                    p.alpha = 0.1;
                    p.fadeSpeed = Math.abs(p.fadeSpeed);
                }

                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(240, 240, 245, ${p.alpha})`;
                ctx.fill();
            });

            animationFrameId = requestAnimationFrame(render);
        };

        render();

        return () => {
            window.removeEventListener('resize', handleResize);
            cancelAnimationFrame(animationFrameId);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                zIndex: 0
            }}
        />
    );
};

export default XBackground;
