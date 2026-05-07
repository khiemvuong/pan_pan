"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { bookPages } from "@/lib/book-data";
import Image from "next/image";
import { Smartphone } from "lucide-react";
import { FlowerBlossom, CornerDecoration, FloralBranch, Cherry } from "@/components/FloralElements";

const N = bookPages.length;
const TOTAL_LEAVES = N + 1;

function renderChars(text: string) {
  const tokens = text.split(/(\s+)/);
  let idx = 0;
  return tokens.map((token, ti) => {
    if (!token.trim()) return <span key={`s${ti}`} style={{ whiteSpace: "pre" }}>{" "}</span>;
    return (
      <span key={`w${ti}`} style={{ display: "inline-block", whiteSpace: "nowrap" }}>
        {token.split("").map((ch) => (
          <span key={idx} className="book-char" data-i={idx++}
            style={{ display: "inline-block", opacity: 0, transform: "translateY(12px)", filter: "blur(2px)" }}>
            {ch}
          </span>
        ))}
      </span>
    );
  });
}

export default function BookReader() {
  const leafRefs = useRef<(HTMLDivElement | null)[]>([]);
  const barRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const charCache = useRef<HTMLElement[][]>([]);
  const rafId = useRef(0);
  const viewportRef = useRef<HTMLDivElement>(null);

  // Mobile state
  const [isMobile, setIsMobile] = useState(false);
  const currentPageRef = useRef(0);
  const touchStartRef = useRef({ x: 0, y: 0, time: 0 });
  const dragRef = useRef(0);
  const isDraggingRef = useRef(false);
  const snapAnimRef = useRef(0);
  const touchDirRef = useRef<"h" | "v" | null>(null);
  const initialDragRef = useRef(0);

  // Safari fullscreen hint (auto-dismiss after a few seconds, landscape only)
  const [showFullscreenHint, setShowFullscreenHint] = useState(false);
  const hintShownRef = useRef(false);
  useEffect(() => {
    if (!isMobile) return;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                         (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (isStandalone) return;

    let hideTimer: ReturnType<typeof setTimeout>;
    const onOrientationChange = () => {
      const isLandscape = window.innerWidth > window.innerHeight;
      if (isLandscape && !hintShownRef.current) {
        hintShownRef.current = true;
        setShowFullscreenHint(true);
        hideTimer = setTimeout(() => setShowFullscreenHint(false), 4000);
      }
    };
    // Check right away + listen for rotation
    const t = setTimeout(onOrientationChange, 0);
    window.addEventListener("resize", onOrientationChange);
    return () => { clearTimeout(t); clearTimeout(hideTimer); window.removeEventListener("resize", onOrientationChange); };
  }, [isMobile]);

  // Build character cache for text reveal animations
  useEffect(() => {
    charCache.current = Array.from({ length: TOTAL_LEAVES }).map((_, i) => {
      if (i === 0) return [];
      const pageData = bookPages[i - 1];
      if (pageData.imageOnRight) {
        const prevLeaf = leafRefs.current[i - 1];
        return prevLeaf ? Array.from(prevLeaf.querySelectorAll<HTMLElement>('.book-right-back .book-char')) : [];
      } else {
        const currLeaf = leafRefs.current[i];
        return currLeaf ? Array.from(currLeaf.querySelectorAll<HTMLElement>('.book-right-front .book-char')) : [];
      }
    });
  }, []);

  // ── SHARED TRANSFORM FUNCTION ──
  // Accepts a virtual scroll position and applies all page transforms + text reveals.
  // Used by both desktop (scroll-driven) and mobile (touch-driven).
  const applyFlipState = useCallback((sy: number) => {
    const vh = window.innerHeight;

    // Progress bar
    const totalScroll = TOTAL_LEAVES * vh;
    if (barRef.current) barRef.current.style.width = `${Math.min((sy / totalScroll) * 100, 100)}%`;

    // Scroll hint
    if (hintRef.current) hintRef.current.style.opacity = sy < vh * 0.08 ? "1" : "0";

    // Process each leaf
    for (let i = 0; i <= N; i++) {
      const start = i * vh;
      const p = Math.max(0, Math.min(1, (sy - start) / vh));
      const leaf = leafRefs.current[i];

      if (leaf) {
        const deg = p * -180;
        const midFactor = Math.sin(p * Math.PI);
        const curl = midFactor * 6;
        const scaleX = 1 - midFactor * 0.05;
        leaf.style.transform = `rotateY(${deg}deg) skewY(${curl}deg) scaleX(${scaleX})`;

        // Tối ưu Safari: Chỉ tính toán và render bóng đổ khi trang đang thực sự di chuyển
        const isAnimating = p > 0 && p < 1;
        if (isAnimating) {
          const sOff = midFactor * 20;
          const sBlur = midFactor * 30;
          const sAlpha = midFactor * 0.3;
          leaf.style.boxShadow = `${p < 0.5 ? -sOff : sOff}px ${sOff / 2}px ${sBlur}px rgba(0,0,0,${sAlpha})`;
        } else {
          leaf.style.boxShadow = "none";
        }

        leaf.style.setProperty("--flip-progress", String(midFactor));

        // Z-index stacking
        if (p > 0 && p < 1) {
          leaf.style.zIndex = String(TOTAL_LEAVES + 50);
        } else if (p >= 1) {
          leaf.style.zIndex = String(i + 10);
        } else {
          leaf.style.zIndex = String(TOTAL_LEAVES - i + 10);
        }
      }

      // Text reveal
      if (i > 0) {
        const prevP = Math.max(0, Math.min(1, (sy - (i - 1) * vh) / vh));
        const reveal = Math.max(0, Math.min(1, (prevP - 0.3) / 0.7));
        const chars = charCache.current[i];
        if (chars && chars.length > 0) {
          const count = reveal * (chars.length + 3);
          for (let c = 0; c < chars.length; c++) {
            const o = Math.max(0, Math.min(1, count - c));
            const el = chars[c];
            // Tối ưu Safari: Tránh update DOM liên tục cho các ký tự đã hiển thị xong hoặc chưa hiển thị
            const currentState = o >= 1 ? "1" : (o <= 0 ? "0" : "anim");
            if (el.dataset.state !== currentState || currentState === "anim") {
              el.style.opacity = String(o);
              el.style.transform = o >= 1 ? "translateY(0)" : `translateY(${-(1 - o) * 12}px)`;
              el.style.filter = (o >= 1 || o <= 0) ? "none" : `blur(${(1 - o) * 2}px)`;
              el.dataset.state = currentState;
            }
          }
        }
      }
    }
  }, []);

  // ── DESKTOP: Scroll handler ──
  const onScroll = useCallback(() => {
    applyFlipState(window.scrollY);
  }, [applyFlipState]);

  // ── MOBILE: Snap animation (ease-out cubic) ──
  const animateSnap = useCallback((targetPage: number) => {
    const vh = window.innerHeight;
    const startScroll = (currentPageRef.current + dragRef.current) * vh;
    const endScroll = targetPage * vh;
    const startTime = performance.now();
    
    // Tốc độ lật tỷ lệ thuận với quãng đường còn lại, tránh bị chậm khi chỉ còn 1 chút
    const distanceFrac = Math.abs((endScroll - startScroll) / vh);
    const duration = Math.max(150, 400 * distanceFrac);

    function tick(now: number) {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const current = startScroll + (endScroll - startScroll) * eased;
      
      // Update dragRef constantly so it can be cleanly interrupted
      dragRef.current = (current / vh) - currentPageRef.current;
      
      applyFlipState(current);

      if (t < 1) {
        snapAnimRef.current = requestAnimationFrame(tick);
      } else {
        currentPageRef.current = targetPage;
        dragRef.current = 0;
        applyFlipState(endScroll);
      }
    }

    cancelAnimationFrame(snapAnimRef.current);
    snapAnimRef.current = requestAnimationFrame(tick);
  }, [applyFlipState]);

  // ── MOBILE: Touch handlers ──
  const onTouchStart = useCallback((e: TouchEvent) => {
    cancelAnimationFrame(snapAnimRef.current);
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
    isDraggingRef.current = true;
    touchDirRef.current = null;
    initialDragRef.current = dragRef.current; // Save interrupted progress
  }, []);

  const onTouchMove = useCallback((e: TouchEvent) => {
    if (!isDraggingRef.current) return;

    const touch = e.touches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;

    // Lock direction on first significant movement
    if (!touchDirRef.current) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      touchDirRef.current = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
    }

    if (touchDirRef.current !== "h") return;
    if (e.cancelable) e.preventDefault();

    const sw = window.innerWidth;
    // Add initial drag to handle interrupted animations seamlessly
    let rawProgress = initialDragRef.current + (-dx / (sw * 0.35)); 
    let page = currentPageRef.current;

    // Tràn trang: cho phép vuốt liền mạch qua nhiều trang mà không cần nhấc tay
    if (rawProgress >= 1 && page < TOTAL_LEAVES) {
      currentPageRef.current += 1;
      initialDragRef.current -= 1;
      rawProgress -= 1;
      page = currentPageRef.current;
    } else if (rawProgress <= -1 && page > 0) {
      currentPageRef.current -= 1;
      initialDragRef.current += 1;
      rawProgress += 1;
      page = currentPageRef.current;
    }

    let clamped: number;
    if (rawProgress > 0) {
      clamped = page >= TOTAL_LEAVES ? 0 : Math.min(1, rawProgress);
    } else {
      clamped = page <= 0 ? 0 : Math.max(-1, rawProgress);
    }

    dragRef.current = clamped;
    const vh = window.innerHeight;
    applyFlipState(Math.max(0, (page + clamped) * vh));
  }, [applyFlipState]);

  const onTouchEnd = useCallback((e: TouchEvent) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;

    const drag = dragRef.current;
    const page = currentPageRef.current;

    const elapsed = Date.now() - touchStartRef.current.time;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    
    // -dx is positive when swiping left (forward)
    const isFlickForward = elapsed < 300 && -dx > 30;
    const isFlickBackward = elapsed < 300 && dx > 30;

    if (drag > 0) {
      if ((drag > 0.15 || isFlickForward) && !isFlickBackward && page < TOTAL_LEAVES) {
        animateSnap(page + 1);
      } else {
        animateSnap(page);
      }
    } else if (drag < 0) {
      if ((drag < -0.15 || isFlickBackward) && !isFlickForward && page > 0) {
        animateSnap(page - 1);
      } else {
        animateSnap(page);
      }
    } else {
      animateSnap(page);
    }
  }, [animateSnap]);

  // ── MOBILE DETECTION ──
  useEffect(() => {
    const check = () => {
      const mobile = window.matchMedia("(max-width: 1024px)").matches && "ontouchstart" in window;
      setIsMobile(mobile);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // ── DESKTOP: Scroll listeners ──
  useEffect(() => {
    if (isMobile) return;
    const h = () => {
      cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(onScroll);
    };
    window.addEventListener("scroll", h, { passive: true });
    h();
    return () => {
      window.removeEventListener("scroll", h);
      cancelAnimationFrame(rafId.current);
    };
  }, [isMobile, onScroll]);

  // ── MOBILE: Touch listeners ──
  useEffect(() => {
    if (!isMobile) return;
    const vp = viewportRef.current;
    if (!vp) return;

    // Add mobile class
    document.body.classList.add("mobile-swipe-mode");

    // All non-passive so we can preventDefault on touchmove
    vp.addEventListener("touchstart", onTouchStart, { passive: false });
    vp.addEventListener("touchmove", onTouchMove, { passive: false });
    vp.addEventListener("touchend", onTouchEnd, { passive: true });

    // Initialize current state
    const vh = window.innerHeight;
    requestAnimationFrame(() => applyFlipState(currentPageRef.current * vh));

    return () => {
      document.body.classList.remove("mobile-swipe-mode");
      vp.removeEventListener("touchstart", onTouchStart);
      vp.removeEventListener("touchmove", onTouchMove);
      vp.removeEventListener("touchend", onTouchEnd);
    };
  }, [isMobile, onTouchStart, onTouchMove, onTouchEnd, applyFlipState]);

  // Preload images
  useEffect(() => {
    bookPages.forEach((p) => { const i = new window.Image(); i.src = p.imageSrc; });
  }, []);

  return (
    <>
      <div className="portrait-blocker">
        <div className="portrait-blocker-content">
          <div className="portrait-blocker-icon"><Smartphone /></div>
          <h2>Vui lòng xoay ngang màn hình</h2>
          <p>Để có trải nghiệm xem album tốt nhất, hãy xoay ngang điện thoại của bạn nhé!</p>
        </div>
      </div>

      {showFullscreenHint && (
        <div className="safari-fullscreen-hint">
          ↑ Vuốt nhẹ lên để xem Full màn hình ✨
        </div>
      )}

      <div className="book-scroll-wrapper">
        <div className="book-scroll-spacer" style={{ height: `${(TOTAL_LEAVES + 1) * 100}vh` }} />

        <div ref={viewportRef} className="book-viewport">
          <div className="book-progress-bar"><div ref={barRef} className="book-progress-fill" /></div>

          {/* ── 3D BOOK CONTAINER ── */}
          <div className="book-scene">

            {/* Base hardcover */}
            <div className="book-base" />
            <div className="book-spine" />

            {/* All leaves */}
            {Array.from({ length: TOTAL_LEAVES }).map((_, i) => {
              const isCover = i === 0;
              const isLast = i === N;

              return (
                <div key={i} ref={(el) => { leafRefs.current[i] = el; }} className="book-right-leaf">

                  {/* ── FRONT FACE ── */}
                  <div className={`book-right-front ${isCover ? 'book-cover-front' : ''}`}>
                    {isCover ? (
                      <div className="book-cover-bg-wrap">
                        <div className="book-cover-bg" />
                        <div className="book-cover-content">
                          <div className="book-cover-line" />
                          <div className="book-cover-title-wrap">
                            <div className="book-cover-title-row">
                              {"TRẠM DỪNG".split("").map((c, j) => <span key={j} className="book-cover-char">{c === " " ? "\u00A0" : c}</span>)}
                            </div>
                            <div className="book-cover-title-row">
                              {"THANH XUÂN".split("").map((c, j) => <span key={j} className="book-cover-char accent">{c === " " ? "\u00A0" : c}</span>)}
                            </div>
                          </div>
                          <div className="book-cover-line" />
                          <p className="book-cover-subtitle" style={{ fontSize: '0.9rem', padding: '0 5%' }}>Cuốn sách nhỏ gói gọn những năm tháng của Pan</p>
                        </div>
                      </div>
                    ) : (
                      <div className="book-page-bg">
                        {bookPages[i - 1].imageOnRight ? (
                          <>
                            <div className="book-photo-frame style-2">
                              <div className="book-photo-inner">
                                <Image src={bookPages[i - 1].imageSrc} alt={bookPages[i - 1].imageAlt} fill className="book-photo" sizes="(max-width: 1200px) 50vw, 600px" priority={i <= 1} />
                              </div>
                            </div>
                            <div className="book-sticker sticker-tl" style={{ opacity: 0.7 }}><CornerDecoration size={140} /></div>
                            <div className="book-sticker sticker-br" style={{ opacity: 0.8 }}><FloralBranch width={160} height={160} /></div>
                            <div className="book-sticker" style={{ right: '10%', top: '10%', opacity: 0.9 }}><Cherry size={50} /></div>
                          </>
                        ) : (
                          <>
                            <div className="book-right-content">
                              <span className="book-page-num">{String(i).padStart(2, "0")}</span>
                              <h2 className="book-page-title">{renderChars(bookPages[i - 1].title)}</h2>
                              {bookPages[i - 1].text && <p className="book-page-text">{renderChars(bookPages[i - 1].text as string)}</p>}
                            </div>
                            <div className="book-sticker sticker-tr" style={{ opacity: 0.6 }}><FlowerBlossom size={100} color="#ffb6c1" /></div>
                            <div className="book-sticker sticker-bl" style={{ left: '5%', bottom: '15%', opacity: 0.7 }}><Cherry size={40} /></div>
                            <div className="book-sticker" style={{ left: '85%', bottom: '5%', opacity: 0.8 }}><Cherry size={40} /></div>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* ── BACK FACE ── */}
                  <div className={`book-right-back ${isLast ? 'book-cover-front' : ''}`}>
                    {!isLast ? (
                      <div className="book-page-bg">
                        {!bookPages[i].imageOnRight ? (
                          <>
                            <div className="book-photo-frame style-2">
                              <div className="book-photo-inner">
                                <Image src={bookPages[i].imageSrc} alt={bookPages[i].imageAlt} fill className="book-photo" sizes="(max-width: 1200px) 50vw, 600px" priority={i <= 1} />
                              </div>
                            </div>
                            <div className="book-sticker sticker-tl" style={{ opacity: 0.7 }}><CornerDecoration size={140} /></div>
                            <div className="book-sticker sticker-br" style={{ opacity: 0.8 }}><FloralBranch width={160} height={160} /></div>
                            <div className="book-sticker" style={{ right: '10%', top: '10%', opacity: 0.9 }}><Cherry size={50} /></div>
                          </>
                        ) : (
                          <>
                            <div className="book-right-content">
                              <span className="book-page-num">{String(i + 1).padStart(2, "0")}</span>
                              <h2 className="book-page-title">{renderChars(bookPages[i].title)}</h2>
                              {bookPages[i].text && <p className="book-page-text">{renderChars(bookPages[i].text as string)}</p>}
                            </div>
                            <div className="book-sticker sticker-tr" style={{ opacity: 0.6 }}><FlowerBlossom size={100} color="#ffb6c1" /></div>
                            <div className="book-sticker sticker-bl" style={{ left: '5%', bottom: '15%', opacity: 0.7 }}><Cherry size={40} /></div>
                            <div className="book-sticker" style={{ left: '85%', bottom: '5%', opacity: 0.8 }}><Cherry size={40} /></div>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="book-cover-bg-wrap" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div className="book-cover-bg" />
                        <div className="book-cover-content">
                          <div className="book-cover-line" />
                          <div className="book-cover-title-wrap">
                            <div className="book-cover-title-row">
                              {"HẸN GẶP".split("").map((c, j) => <span key={j} className="book-cover-char">{c === " " ? "\u00A0" : c}</span>)}
                            </div>
                            <div className="book-cover-title-row">
                              {"LẠI NHA".split("").map((c, j) => <span key={j} className="book-cover-char accent">{c === " " ? "\u00A0" : c}</span>)}
                            </div>
                          </div>
                          <div className="book-cover-line" />
                          <p className="book-cover-subtitle" style={{ fontSize: '0.9rem', marginBottom: '1rem', padding: '0 10%', lineHeight: '1.4' }}>
                            Cảm ơn cậu đã xem. Nhớ đến dự lễ tốt nghiệp của tớ nha~ 💌
                          </p>
                          <div className="book-sticker sticker-tr" style={{ right: '15%', top: '15%', opacity: 0.6 }}><FlowerBlossom size={80} color="#ff69b4" /></div>
                          <div className="book-sticker sticker-bl" style={{ left: '15%', bottom: '15%', opacity: 0.7 }}><CornerDecoration size={100} /></div>
                        </div>
                      </div>
                    )}
                  </div>

                </div>
              );
            })}
          </div>

          <div ref={hintRef} className="book-scroll-hint">
            <span className="book-scroll-hint-text">{isMobile ? "Vuốt ngang để lật trang" : "Cuộn để lật trang"}</span>
            <div className="book-scroll-hint-arrow">{isMobile ? "←  →" : "↓"}</div>
          </div>
        </div>
      </div>
    </>
  );
}
