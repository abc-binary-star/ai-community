"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type {
  PointerEvent as ReactPointerEvent,
  RefObject,
  WheelEvent as ReactWheelEvent,
} from "react";

interface Translation {
  x: number;
  y: number;
}

interface Point {
  x: number;
  y: number;
}

interface PinchState {
  distance: number;
  scale: number;
  worldX: number;
  worldY: number;
}

export interface MapViewport {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 地图视口：自动 fit、拖拽、滚轮、双指缩放和短时镜头动画。 */
export function useMapViewport({
  wrapRef,
  boardW,
  boardH,
  onManualNavigate,
}: {
  wrapRef: RefObject<HTMLDivElement | null>;
  boardW: number;
  boardH: number;
  onManualNavigate?: () => void;
}) {
  const [scale, setScaleState] = useState(0.5);
  const scaleRef = useRef(0.5);
  const [translation, setTranslationState] = useState<Translation>({
    x: 0,
    y: 0,
  });
  const translationRef = useRef<Translation>({ x: 0, y: 0 });
  const [viewportSize, setViewportSize] = useState({ width: 1, height: 1 });
  const fitScaleRef = useRef(0.5);
  const autoFitRef = useRef(true);
  const pointersRef = useRef(new Map<number, Point>());
  const dragRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    origin: Translation;
    moved: boolean;
    threshold: number;
  } | null>(null);
  const pinchRef = useRef<PinchState | null>(null);
  const suppressClickRef = useRef(false);
  const animationRef = useRef<number | null>(null);

  const setScale = useCallback((next: number) => {
    scaleRef.current = next;
    setScaleState(next);
  }, []);

  const setTranslation = useCallback((next: Translation) => {
    translationRef.current = next;
    setTranslationState(next);
  }, []);

  const calculateFit = useCallback(
    (width: number, height: number) => {
      return Math.min(width / boardW, height / boardH) * 0.94;
    },
    [boardH, boardW],
  );

  const fitTranslation = useCallback(
    (nextScale: number, width: number, height: number): Translation => ({
      x: (width - boardW * nextScale) / 2,
      y: (height - boardH * nextScale) / 2,
    }),
    [boardH, boardW],
  );

  const fit = useCallback(() => {
    const element = wrapRef.current;
    if (!element) return;
    const nextScale = calculateFit(element.clientWidth, element.clientHeight);
    fitScaleRef.current = nextScale;
    autoFitRef.current = true;
    setScale(nextScale);
    setTranslation(
      fitTranslation(nextScale, element.clientWidth, element.clientHeight),
    );
  }, [calculateFit, fitTranslation, setScale, setTranslation, wrapRef]);

  useLayoutEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    const applySize = () => {
      const width = element.clientWidth;
      const height = element.clientHeight;
      setViewportSize({ width, height });
      const nextFit = calculateFit(width, height);
      fitScaleRef.current = nextFit;
      if (autoFitRef.current) {
        setScale(nextFit);
        setTranslation(fitTranslation(nextFit, width, height));
      }
    };
    applySize();
    const observer = new ResizeObserver(applySize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [calculateFit, fitTranslation, setScale, setTranslation, wrapRef]);

  const cancelAnimation = useCallback(() => {
    if (animationRef.current !== null)
      cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
  }, []);

  useEffect(() => cancelAnimation, [cancelAnimation]);

  const animateTranslation = useCallback(
    (target: Translation, duration = 420) => {
      cancelAnimation();
      const start = performance.now();
      const origin = translationRef.current;
      const tick = (now: number) => {
        const progress = Math.min(1, (now - start) / duration);
        const eased = 1 - (1 - progress) ** 3;
        setTranslation({
          x: origin.x + (target.x - origin.x) * eased,
          y: origin.y + (target.y - origin.y) * eased,
        });
        if (progress < 1) animationRef.current = requestAnimationFrame(tick);
        else animationRef.current = null;
      };
      animationRef.current = requestAnimationFrame(tick);
    },
    [cancelAnimation, setTranslation],
  );

  const centerOn = useCallback(
    (point: Point, smooth = true) => {
      const element = wrapRef.current;
      if (!element) return;
      autoFitRef.current = false;
      const target = {
        x: element.clientWidth / 2 - point.x * scaleRef.current,
        y: element.clientHeight / 2 - point.y * scaleRef.current,
      };
      if (smooth) animateTranslation(target);
      else setTranslation(target);
    },
    [animateTranslation, setTranslation, wrapRef],
  );

  const zoomAt = useCallback(
    (factor: number, clientX?: number, clientY?: number, manual = false) => {
      const element = wrapRef.current;
      if (!element) return;
      cancelAnimation();
      const rect = element.getBoundingClientRect();
      const px = clientX === undefined ? rect.width / 2 : clientX - rect.left;
      const py = clientY === undefined ? rect.height / 2 : clientY - rect.top;
      const worldX = (px - translationRef.current.x) / scaleRef.current;
      const worldY = (py - translationRef.current.y) / scaleRef.current;
      const minScale = Math.max(0.22, fitScaleRef.current * 0.7);
      const maxScale = Math.max(2.15, fitScaleRef.current * 3.8);
      const nextScale = Math.min(
        maxScale,
        Math.max(minScale, scaleRef.current * factor),
      );
      autoFitRef.current = false;
      setScale(nextScale);
      setTranslation({
        x: px - worldX * nextScale,
        y: py - worldY * nextScale,
      });
      if (manual) onManualNavigate?.();
    },
    [cancelAnimation, onManualNavigate, setScale, setTranslation, wrapRef],
  );

  const onWheel = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      event.preventDefault();
      zoomAt(
        Math.exp(-event.deltaY * 0.0016),
        event.clientX,
        event.clientY,
        true,
      );
    },
    [zoomAt],
  );

  const startPinch = useCallback(() => {
    const element = wrapRef.current;
    const points = [...pointersRef.current.values()];
    if (!element || points.length < 2) return;
    const rect = element.getBoundingClientRect();
    const centerX = (points[0].x + points[1].x) / 2 - rect.left;
    const centerY = (points[0].y + points[1].y) / 2 - rect.top;
    pinchRef.current = {
      distance: Math.max(
        1,
        Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y),
      ),
      scale: scaleRef.current,
      worldX: (centerX - translationRef.current.x) / scaleRef.current,
      worldY: (centerY - translationRef.current.y) / scaleRef.current,
    };
    dragRef.current = null;
  }, [wrapRef]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if ((event.target as HTMLElement).closest("[data-map-control]")) return;
      cancelAnimation();
      event.currentTarget.setPointerCapture(event.pointerId);
      pointersRef.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
      if (pointersRef.current.size >= 2) {
        startPinch();
        return;
      }
      dragRef.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        origin: translationRef.current,
        moved: false,
        threshold: event.pointerType === "touch" ? 14 : 9,
      };
    },
    [cancelAnimation, startPinch],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!pointersRef.current.has(event.pointerId)) return;
      pointersRef.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
      const element = wrapRef.current;
      if (!element) return;

      if (pointersRef.current.size >= 2) {
        const points = [...pointersRef.current.values()];
        const pinch = pinchRef.current;
        if (!pinch) return startPinch();
        const rect = element.getBoundingClientRect();
        const centerX = (points[0].x + points[1].x) / 2 - rect.left;
        const centerY = (points[0].y + points[1].y) / 2 - rect.top;
        const distance = Math.max(
          1,
          Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y),
        );
        const minScale = Math.max(0.22, fitScaleRef.current * 0.7);
        const maxScale = Math.max(2.15, fitScaleRef.current * 3.8);
        const nextScale = Math.min(
          maxScale,
          Math.max(minScale, pinch.scale * (distance / pinch.distance)),
        );
        setScale(nextScale);
        setTranslation({
          x: centerX - pinch.worldX * nextScale,
          y: centerY - pinch.worldY * nextScale,
        });
        suppressClickRef.current = true;
        autoFitRef.current = false;
        onManualNavigate?.();
        return;
      }

      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (!drag.moved) {
        if (Math.hypot(dx, dy) < drag.threshold) return;
        drag.moved = true;
        suppressClickRef.current = true;
        autoFitRef.current = false;
        onManualNavigate?.();
      }
      setTranslation({ x: drag.origin.x + dx, y: drag.origin.y + dy });
    },
    [onManualNavigate, setScale, setTranslation, startPinch, wrapRef],
  );

  const finishPointer = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      pointersRef.current.delete(event.pointerId);
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        /* pointer capture already released */
      }
      pinchRef.current = null;
      const remaining = [...pointersRef.current.entries()][0];
      if (remaining) {
        dragRef.current = {
          pointerId: remaining[0],
          x: remaining[1].x,
          y: remaining[1].y,
          origin: translationRef.current,
          moved: false,
          threshold: 14,
        };
      } else {
        dragRef.current = null;
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 0);
      }
    },
    [],
  );

  const viewport: MapViewport = {
    x: -translation.x / scale,
    y: -translation.y / scale,
    w: viewportSize.width / scale,
    h: viewportSize.height / scale,
  };

  const minScale = Math.max(0.22, fitScaleRef.current * 0.7);
  const maxScale = Math.max(2.15, fitScaleRef.current * 3.8);

  return {
    scale,
    translation,
    fitScale: fitScaleRef.current,
    minScale,
    maxScale,
    canZoomIn: scale < maxScale - 0.001,
    canZoomOut: scale > minScale + 0.001,
    viewport,
    fit,
    centerOn,
    zoomAt,
    suppressClickRef,
    interactionProps: {
      onWheel,
      onPointerDown,
      onPointerMove,
      onPointerUp: finishPointer,
      onPointerCancel: finishPointer,
    },
  };
}
