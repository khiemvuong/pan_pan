'use client';

import { useEffect } from 'react';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

export default function SmoothScroll() {
  useEffect(() => {
    // Skip Lenis on mobile — touch swipe handles navigation there
    const isMobile = window.matchMedia('(max-width: 900px)').matches && 'ontouchstart' in window;
    if (isMobile) return;

    const lenis = new Lenis({
      autoRaf: false,
      duration: 2.5,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 0.5,
      touchMultiplier: 2,
      infinite: false,
      syncTouch: false,
    });

    lenis.on('scroll', ScrollTrigger.update);

    function raf(time: number) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }

    requestAnimationFrame(raf);

    return () => {
      lenis.destroy();
    };
  }, []);

  return null;
}
