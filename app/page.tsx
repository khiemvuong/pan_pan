"use client";

import { useState } from "react";
import LoadingScreen from "@/components/LoadingScreen";
import BookReader from "@/components/BookReader";
import SmoothScroll from "@/components/SmoothScroll";
import { AmbientElements } from "@/components/AmbientEffects";

export default function Home() {
  const [showContent, setShowContent] = useState(false);

  return (
    <>
      {!showContent && <LoadingScreen onComplete={() => setShowContent(true)} />}

      {showContent && (
        <>
          <AmbientElements />
          <SmoothScroll />
          <BookReader />
        </>
      )}
    </>
  );
}
