declare global {
  interface Window {
    config?: {
      apiUrl?: string
    }
  }

  // Injected per-build via `define` in vite.config.mts.
  const __BUILD_VERSION__: string
}

export {}
