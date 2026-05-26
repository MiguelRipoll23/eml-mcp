export type McpToolResult = {
  content: [{ type: 'text'; text: string }];
  structuredContent?: Record<string, unknown>;
  isError?: true;
};

function toLocalISOString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const absOffset = Math.abs(offset);
  const offsetHours = pad(Math.floor(absOffset / 60));
  const offsetMinutes = pad(absOffset % 60);
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${sign}${offsetHours}:${offsetMinutes}`;
}

export function toMcpSuccess(data: unknown): McpToolResult {
  const text = JSON.stringify(data, (_key, value) => {
    if (value instanceof Date) return toLocalISOString(value);
    return value;
  }, 2);
  return {
    content: [{ type: 'text', text }],
    structuredContent: JSON.parse(text) as Record<string, unknown>,
  };
}

export function toMcpError(code: string, message: string): McpToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: code, message }) }],
    isError: true,
  };
}
