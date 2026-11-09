// Thin JSON client for the Dartmouth Arabic server. The session lives in an HttpOnly cookie.
export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export async function api(path, { method = "GET", body, keepalive = false } = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      keepalive,
      headers: { "content-type": "application/json", "x-requested-with": "dalt" },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    throw new ApiError(0, "Can’t reach the server. Check your connection and try again.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, data.error || "Something went wrong.");
  return data;
}
