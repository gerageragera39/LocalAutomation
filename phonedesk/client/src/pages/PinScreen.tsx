import type { AxiosError } from "axios";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import { useAuthStore } from "../stores/authStore";
import type { ApiErrorResponse } from "../types";

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "←"];

export const PinScreen = () => {
  const navigate = useNavigate();
  const setSession = useAuthStore((state) => state.setSession);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [shake, setShake] = useState(false);
  const [blockedUntil, setBlockedUntil] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const isBlocked = useMemo(() => blockedUntil !== null && blockedUntil > Date.now(), [blockedUntil]);

  useEffect(() => {
    if (!blockedUntil) {
      setSecondsLeft(0);
      return;
    }

    const tick = () => {
      const nextSeconds = Math.max(0, Math.ceil((blockedUntil - Date.now()) / 1000));
      setSecondsLeft(nextSeconds);

      if (nextSeconds <= 0) {
        setBlockedUntil(null);
      }
    };

    tick();
    const timer = window.setInterval(tick, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [blockedUntil]);

  const triggerShake = () => {
    setShake(true);
    window.setTimeout(() => setShake(false), 420);
  };

  const updatePin = (value: string) => {
    if (isBlocked || isLoading) {
      return;
    }

    if (value === "←") {
      setPin((current) => current.slice(0, -1));
      return;
    }

    if (!value) {
      return;
    }

    setPin((current) => {
      if (current.length >= 8) {
        return current;
      }

      return `${current}${value}`;
    });
  };

  const submit = async () => {
    if (pin.length < 4 || pin.length > 8 || isBlocked || isLoading) {
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const response = await api.post<{ token: string; mustChangePin: boolean }>("/auth/login", { pin });
      setSession(response.data.token, response.data.mustChangePin);
      navigate("/dashboard", { replace: true });
    } catch (rawError) {
      const errorResponse = rawError as AxiosError<ApiErrorResponse>;
      const retryAfter = errorResponse.response?.data?.details?.retryAfterSeconds;

      if (errorResponse.response?.status === 429 && retryAfter && retryAfter > 0) {
        setBlockedUntil(Date.now() + retryAfter * 1000);
      }

      setError(errorResponse.response?.data?.message ?? "Не удалось выполнить вход.");
      setPin("");
      triggerShake();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-5 pb-8 pt-5">
      <div className="mb-7 space-y-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight">PhoneDesk</h1>
        <p className="text-sm text-white/70">Введите PIN-код для входа</p>
      </div>

      <motion.div
        animate={shake ? { x: [0, -12, 12, -8, 8, 0] } : { x: 0 }}
        transition={{ duration: 0.42 }}
        className="mb-5 flex justify-center gap-2"
      >
        {Array.from({ length: 8 }).map((_, index) => (
          <span
            key={index}
            className={`h-3 w-3 rounded-full border border-white/20 ${
              index < pin.length ? "bg-accent" : "bg-transparent"
            }`}
          />
        ))}
      </motion.div>

      {error && <p className="mb-4 text-center text-sm text-danger">{error}</p>}

      {isBlocked && (
        <p className="mb-4 text-center text-sm text-yellow-300">Слишком много попыток. Повторите через {secondsLeft} сек.</p>
      )}

      <div className="grid grid-cols-3 gap-3">
        {DIGITS.map((digit, index) => (
          <button
            key={`${digit}-${index}`}
            type="button"
            className="min-h-16 rounded-2xl border border-white/15 bg-surface text-2xl font-semibold transition hover:border-accent/60 disabled:opacity-50"
            onClick={() => updatePin(digit)}
            disabled={isBlocked || isLoading || digit.length === 0}
          >
            {digit || " "}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="mt-4 min-h-16 rounded-2xl bg-accent text-lg font-semibold text-base transition hover:bg-accentSoft disabled:cursor-not-allowed disabled:opacity-55"
        onClick={submit}
        disabled={pin.length < 4 || isBlocked || isLoading}
      >
        {isLoading ? "Проверка..." : "Войти"}
      </button>
    </div>
  );
};
