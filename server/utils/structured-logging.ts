type LogLevel = 'info' | 'error'
type StructuredLog = { event: string } & Record<
  string,
  string | number | boolean | null
>

export function logStructured(level: LogLevel, entry: StructuredLog) {
  console[level](JSON.stringify(entry))
}
