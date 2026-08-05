import { AppError } from './errors'

export type RequestOptions = {
  signal?: AbortSignal
  headers?: Record<string, string>
  query?: Record<string, string | number | undefined>
  timeout?: number
  body?: unknown
  method?: 'GET' | 'POST'
}

export interface ApiClient {
  get<T>(path: string, options?: RequestOptions): Promise<T>
  post<T>(path: string, body: unknown, options?: RequestOptions): Promise<T>
}

type FetchRequestOptions = RequestOptions & { baseURL?: string }
type FetchRequest = <T>(
  path: string,
  options: FetchRequestOptions,
) => Promise<T>

type FetchError = {
  status?: number
  statusCode?: number
  data?: { error?: { code?: string; details?: unknown } }
}

function isAbortSignalError(error: unknown, signal?: AbortSignal) {
  return (
    signal?.aborted ||
    (error instanceof DOMException && error.name === 'AbortError')
  )
}

function toAppError(error: unknown, signal?: AbortSignal): AppError {
  if (isAbortSignalError(error, signal)) {
    return new AppError('REQUEST_CANCELLED', undefined, {
      cancelled: true,
      cause: error,
    })
  }

  const fetchError: FetchError =
    typeof error === 'object' && error !== null ? (error as FetchError) : {}
  const code = fetchError.data?.error?.code
  if (code)
    return new AppError(code, fetchError.data?.error?.details, { cause: error })

  return new AppError(
    fetchError.status === 408 || fetchError.statusCode === 408
      ? 'REQUEST_TIMEOUT'
      : 'NETWORK_ERROR',
    { status: fetchError.status ?? fetchError.statusCode },
    { cause: error },
  )
}

function logDevelopment(event: {
  method: string
  path: string
  status?: number
  errorCode?: string
}) {
  if (import.meta.dev) console.debug('[api]', event)
}

async function fetchRequest<T>(
  path: string,
  options: FetchRequestOptions,
): Promise<T> {
  const { body, ...fetchOptions } = options
  const response: unknown = await $fetch(path, {
    ...fetchOptions,
    body: body as Record<string, unknown> | undefined,
  })
  return response as T
}

export function createFetchApiClient(
  request: FetchRequest = fetchRequest,
  config: { baseURL?: string; defaultTimeout?: number } = {},
): ApiClient {
  async function send<T>(path: string, options: RequestOptions = {}) {
    const method = options.method ?? 'GET'
    logDevelopment({ method, path })
    try {
      const response = await request<T>(path, {
        baseURL: config.baseURL,
        timeout: options.timeout ?? config.defaultTimeout ?? 10_000,
        signal: options.signal,
        headers: options.headers,
        query: options.query,
        method: options.method,
        body: options.body,
      })
      logDevelopment({ method, path, status: 200 })
      return response
    } catch (error) {
      const appError = toAppError(error, options.signal)
      const fetchError =
        typeof error === 'object' && error !== null
          ? (error as FetchError)
          : undefined
      logDevelopment({
        method,
        path,
        status: fetchError?.status ?? fetchError?.statusCode,
        errorCode: appError.code,
      })
      throw appError
    }
  }

  return {
    get: <T>(path: string, options?: RequestOptions) => send<T>(path, options),
    post: <T>(path: string, body: unknown, options: RequestOptions = {}) =>
      send<T>(path, { ...options, body, method: 'POST' }),
  }
}

export function useApiClient(): ApiClient {
  const runtimeConfig = useRuntimeConfig()
  return createFetchApiClient(fetchRequest, {
    baseURL:
      typeof runtimeConfig.public.apiBaseUrl === 'string'
        ? runtimeConfig.public.apiBaseUrl
        : undefined,
  })
}
