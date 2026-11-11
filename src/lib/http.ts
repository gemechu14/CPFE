import axios, { AxiosError, type AxiosRequestConfig } from 'axios';
import type { ApiErrorBody, LoginResponse } from '@/types/api';
import { session } from './session';

const API_ROOT = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
export const API_BASE = `${API_ROOT}/api/v1`;

/** Turn a server-relative upload path (may use Windows separators) into a URL. */
export const assetUrl = (path?: string | null) =>
  path ? (/^https?:\/\//.test(path) ? path : `${API_ROOT}/${path.replace(/\\/g, '/').replace(/^\/+/, '')}`) : undefined;

export const http = axios.create({ baseURL: API_BASE, timeout: 60_000 });

http.interceptors.request.use((config) => {
  const token = session.get()?.tokens.access.token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Refresh tokens are single-use: every 401 that arrives while a refresh is in
// flight must wait for that same refresh instead of starting its own.
let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const current = session.get();
  if (!current) return null;
  try {
    const { data } = await axios.post<LoginResponse>(`${API_BASE}/auth/refresh/accessToken`, {
      refreshToken: current.tokens.refresh.token,
    });
    session.set({ ...current, tokens: data.tokens, permissions: data.permissions, isFirstTimeLoggedIn: data.isFirstTimeLoggedIn });
    return data.tokens.access.token;
  } catch {
    session.clear('expired');
    return null;
  }
}

type RetriableConfig = AxiosRequestConfig & { _retried?: boolean };

http.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const config = error.config as RetriableConfig | undefined;
    const isAuthCall = config?.url?.startsWith('/auth/');
    if (error.response?.status === 401 && config && !config._retried && !isAuthCall && session.get()) {
      config._retried = true;
      refreshing ??= refreshAccessToken().finally(() => {
        refreshing = null;
      });
      const token = await refreshing;
      if (token) {
        config.headers = { ...config.headers, Authorization: `Bearer ${token}` };
        return http(config);
      }
    }
    return Promise.reject(error);
  },
);

export class ApiError extends Error {
  status: number;
  details: { message: string; path: string }[];
  constructor(status: number, message: string, details: { message: string; path: string }[] = []) {
    super(message);
    this.status = status;
    this.details = details;
  }
  /** Message for a given input path, if the backend returned one. */
  fieldError(path: string) {
    return this.details.find((d) => d.path === path)?.message;
  }
}

export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (axios.isAxiosError(err)) {
    const body = err.response?.data as Partial<ApiErrorBody> | undefined;
    const status = err.response?.status ?? 0;
    if (!err.response) return new ApiError(0, 'Cannot reach the server. Check your connection and try again.');
    return new ApiError(status, body?.message ?? err.message, body?.details ?? []);
  }
  return new ApiError(0, err instanceof Error ? err.message : 'Something went wrong');
}

export function errorMessage(err: unknown) {
  return toApiError(err).message;
}
