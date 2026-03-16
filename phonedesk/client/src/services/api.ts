import axios from "axios";
import type { AxiosError, InternalAxiosRequestConfig } from "axios";
import type { ApiErrorResponse } from "../types";
import { useAuthStore } from "../stores/authStore";

export const api = axios.create({
  baseURL: "/api",
  timeout: 15_000,
});

export const mouseApi = {
  move: (dx: number, dy: number) => api.post("/mouse/move", { dx, dy }),
  click: (button: "left" | "right") => api.post("/mouse/click", { button }),
  scroll: (dy: number) => api.post("/mouse/scroll", { dy }),
};

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().token;

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorResponse>) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().clearSession();
    }

    return Promise.reject(error);
  },
);
