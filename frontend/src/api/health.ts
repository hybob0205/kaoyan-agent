export type HealthResponse = { status: string; service: string; lan_mode?: boolean }

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? ''

export async function getHealth(): Promise<HealthResponse> {
  const response = await fetch(`${apiBaseUrl}/api/health`)
  if (!response.ok) throw new Error(`API returned ${response.status}`)
  return response.json() as Promise<HealthResponse>
}
