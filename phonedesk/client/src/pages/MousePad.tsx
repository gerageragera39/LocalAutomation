import type { AxiosError } from "axios";
import { useCallback, useEffect, useRef, useState, type TouchEvent } from "react";
import { Link } from "react-router-dom";
import { mouseApi } from "../services/api";
import type { ApiErrorResponse } from "../types";

const SEND_INTERVAL_MS = 33;
const MOVE_SENSITIVITY = 3.1;
const SCROLL_SENSITIVITY = 0.7;
const DOUBLE_TAP_INTERVAL_MS = 280;
const TAP_DURATION_MS = 220;
const TAP_MOVE_TOLERANCE_PX = 14;
const DOUBLE_TAP_DISTANCE_PX = 28;

interface Point {
  x: number;
  y: number;
}

export const MousePad = () => {
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Готово к управлению");

  const singleTouchRef = useRef<Point | null>(null);
  const twoFingerCenterRef = useRef<Point | null>(null);
  const tapStartRef = useRef<{ point: Point; time: number; moved: boolean } | null>(null);
  const lastTapRef = useRef<{ point: Point; time: number } | null>(null);

  const moveTimerRef = useRef<number | null>(null);
  const scrollTimerRef = useRef<number | null>(null);
  const lastMoveSentAtRef = useRef(0);
  const lastScrollSentAtRef = useRef(0);
  const pendingMoveRef = useRef({ dx: 0, dy: 0 });
  const pendingScrollRef = useRef(0);

  const flushMove = useCallback(() => {
    moveTimerRef.current = null;

    const rawDx = pendingMoveRef.current.dx;
    const rawDy = pendingMoveRef.current.dy;
    pendingMoveRef.current = { dx: 0, dy: 0 };

    const dx = Math.round(rawDx * MOVE_SENSITIVITY);
    const dy = Math.round(rawDy * MOVE_SENSITIVITY);

    if (dx === 0 && dy === 0) {
      return;
    }

    lastMoveSentAtRef.current = Date.now();

    void mouseApi
      .move(dx, dy)
      .then(() => {
        setStatus("Курсор перемещён");
      })
      .catch((rawError: AxiosError<ApiErrorResponse>) => {
        setError(rawError.response?.data?.message ?? "Не удалось переместить курсор");
      });
  }, []);

  const flushScroll = useCallback(() => {
    scrollTimerRef.current = null;

    const rawDy = pendingScrollRef.current;
    pendingScrollRef.current = 0;

    const dy = Math.round(rawDy * SCROLL_SENSITIVITY);
    if (dy === 0) {
      return;
    }

    lastScrollSentAtRef.current = Date.now();

    void mouseApi
      .scroll(dy)
      .then(() => {
        setStatus("Скролл отправлен");
      })
      .catch((rawError: AxiosError<ApiErrorResponse>) => {
        setError(rawError.response?.data?.message ?? "Не удалось выполнить скролл");
      });
  }, []);

  const queueMove = useCallback(
    (dx: number, dy: number) => {
      pendingMoveRef.current.dx += dx;
      pendingMoveRef.current.dy += dy;

      if (moveTimerRef.current !== null) {
        return;
      }

      const elapsed = Date.now() - lastMoveSentAtRef.current;
      const waitTime = Math.max(0, SEND_INTERVAL_MS - elapsed);

      moveTimerRef.current = window.setTimeout(flushMove, waitTime);
    },
    [flushMove],
  );

  const queueScroll = useCallback(
    (dy: number) => {
      pendingScrollRef.current += dy;

      if (scrollTimerRef.current !== null) {
        return;
      }

      const elapsed = Date.now() - lastScrollSentAtRef.current;
      const waitTime = Math.max(0, SEND_INTERVAL_MS - elapsed);

      scrollTimerRef.current = window.setTimeout(flushScroll, waitTime);
    },
    [flushScroll],
  );

  useEffect(() => {
    return () => {
      if (moveTimerRef.current !== null) {
        window.clearTimeout(moveTimerRef.current);
      }

      if (scrollTimerRef.current !== null) {
        window.clearTimeout(scrollTimerRef.current);
      }
    };
  }, []);

  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    setError("");

    if (event.touches.length === 1) {
      const touch = event.touches[0];
      singleTouchRef.current = { x: touch.clientX, y: touch.clientY };
      twoFingerCenterRef.current = null;
      tapStartRef.current = {
        point: { x: touch.clientX, y: touch.clientY },
        time: Date.now(),
        moved: false,
      };
      return;
    }

    if (event.touches.length === 2) {
      const first = event.touches[0];
      const second = event.touches[1];
      twoFingerCenterRef.current = {
        x: (first.clientX + second.clientX) / 2,
        y: (first.clientY + second.clientY) / 2,
      };
      singleTouchRef.current = null;
      tapStartRef.current = null;
    }
  };

  const onTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    event.preventDefault();

    if (event.touches.length === 1) {
      const touch = event.touches[0];
      const previous = singleTouchRef.current;

      if (!previous) {
        singleTouchRef.current = { x: touch.clientX, y: touch.clientY };
        return;
      }

      queueMove(touch.clientX - previous.x, touch.clientY - previous.y);

      if (tapStartRef.current) {
        const movedX = Math.abs(touch.clientX - tapStartRef.current.point.x);
        const movedY = Math.abs(touch.clientY - tapStartRef.current.point.y);

        if (movedX > TAP_MOVE_TOLERANCE_PX || movedY > TAP_MOVE_TOLERANCE_PX) {
          tapStartRef.current.moved = true;
        }
      }

      singleTouchRef.current = { x: touch.clientX, y: touch.clientY };
      return;
    }

    if (event.touches.length === 2) {
      const first = event.touches[0];
      const second = event.touches[1];
      const center = {
        x: (first.clientX + second.clientX) / 2,
        y: (first.clientY + second.clientY) / 2,
      };

      const previousCenter = twoFingerCenterRef.current;
      if (previousCenter) {
        queueScroll(center.y - previousCenter.y);
      }

      twoFingerCenterRef.current = center;
      singleTouchRef.current = null;
      tapStartRef.current = null;
    }
  };

  const onTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length === 0 && tapStartRef.current) {
      const finishedTap = tapStartRef.current;
      tapStartRef.current = null;

      const duration = Date.now() - finishedTap.time;
      const isTap = !finishedTap.moved && duration <= TAP_DURATION_MS;

      if (isTap) {
        const previousTap = lastTapRef.current;
        const now = Date.now();

        if (
          previousTap &&
          now - previousTap.time <= DOUBLE_TAP_INTERVAL_MS &&
          Math.abs(previousTap.point.x - finishedTap.point.x) <= DOUBLE_TAP_DISTANCE_PX &&
          Math.abs(previousTap.point.y - finishedTap.point.y) <= DOUBLE_TAP_DISTANCE_PX
        ) {
          void handleClick("left");
          lastTapRef.current = null;
        } else {
          lastTapRef.current = { point: finishedTap.point, time: now };
        }
      } else {
        lastTapRef.current = null;
      }
    }

    singleTouchRef.current = null;
    twoFingerCenterRef.current = null;
  };

  const handleClick = async (button: "left" | "right") => {
    setError("");

    if (navigator.vibrate) {
      navigator.vibrate(30);
    }

    try {
      await mouseApi.click(button);
      setStatus(button === "left" ? "Левый клик" : "Правый клик");
    } catch (rawError) {
      const errorResponse = rawError as AxiosError<ApiErrorResponse>;
      setError(errorResponse.response?.data?.message ?? "Не удалось отправить клик");
    }
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 pb-4 pt-4">
      <header className="mb-3 flex items-center justify-between rounded-2xl border border-white/10 bg-surface/80 p-4">
        <div>
          <h1 className="text-2xl font-bold">Мышь</h1>
          <p className="text-xs text-white/60">{status}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/dashboard" className="rounded-lg border border-white/20 px-3 py-2 text-sm hover:bg-white/10">
            Приложения
          </Link>
          <Link to="/admin" className="rounded-lg border border-white/20 px-3 py-2 text-sm hover:bg-white/10">
            Admin
          </Link>
        </div>
      </header>

      {error && <p className="mb-3 rounded-lg border border-danger/40 bg-danger/10 p-2 text-sm text-danger">{error}</p>}

      <section
        className="relative flex-[9] touch-none overflow-hidden rounded-2xl border border-white/10 bg-base/95"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      >
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="text-xl tracking-[0.4em] text-white/20">ТРЕКПАД</span>
        </div>
      </section>

      <section className="mt-3 grid flex-[1] grid-cols-2 overflow-hidden rounded-2xl border border-white/10 bg-surface/90">
        <button
          type="button"
          className="h-full min-h-[76px] border-r border-white/10 text-lg font-semibold active:bg-white/10"
          onClick={() => {
            void handleClick("left");
          }}
        >
          Левая
        </button>
        <button
          type="button"
          className="h-full min-h-[76px] text-lg font-semibold active:bg-white/10"
          onClick={() => {
            void handleClick("right");
          }}
        >
          Правая
        </button>
      </section>
    </div>
  );
};
