// Restrict fetching to operator-approved HTTPS hosts. DNS checks supplement,
// but do not replace, outbound network restrictions against DNS rebinding.
export function isPublicAddress(ip: string): boolean {
  if (ip.includes(":")) {
    // Only native global-unicast IPv6; reject mapped IPv4, local ranges,
    // documentation, Teredo and 6to4 transition addresses.
    const lower = ip.toLowerCase();
    return /^[23][0-9a-f]{0,3}:/.test(lower) && !lower.includes(".") &&
      !/^2001:(?:0:|db8:)/.test(lower) && !lower.startsWith("2002:");
  }
  const p = ip.split(".").map(Number);
  if (
    p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)
  ) return false;
  return !(p[0] === 0 || p[0] === 10 || p[0] === 127 || p[0] >= 224 ||
    (p[0] === 100 && p[1] >= 64 && p[1] <= 127) ||
    (p[0] === 169 && p[1] === 254) ||
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && (p[1] === 168 || p[1] === 0)) ||
    (p[0] === 198 && (p[1] === 18 || p[1] === 19 || p[1] === 51)) ||
    (p[0] === 203 && p[1] === 0 && p[2] === 113));
}

type Resolver = (host: string) => Promise<string[]>;
async function resolvePublicAddresses(host: string): Promise<string[]> {
  // Validate both address families because fetch may choose either.
  const [v4, v6] = await Promise.all([
    Deno.resolveDns(host, "A"),
    Deno.resolveDns(host, "AAAA").catch((error) => {
      if (error instanceof Deno.errors.NotFound) return [];
      throw error;
    }),
  ]);
  return [...v4, ...v6];
}

export async function fetchRecipeHtml(
  value: string,
  allowedHosts: string[],
  request: typeof fetch = fetch,
  resolve: Resolver = resolvePublicAddresses,
): Promise<string> {
  const allowed = new Set(
    allowedHosts.map((h) => h.trim().toLowerCase()).filter(Boolean),
  );
  const signal = AbortSignal.timeout(15_000);
  let url = new URL(value);
  for (let hop = 0; hop <= 5; hop++) {
    if (
      url.protocol !== "https:" || url.username || url.password ||
      (url.port && url.port !== "443") ||
      !allowed.has(url.hostname.toLowerCase())
    ) {
      throw new Error(
        "Recipe URL host is not allowed. Configure RECIPE_ALLOWED_HOSTS.",
      );
    }
    const addresses = await resolve(url.hostname);
    if (!addresses.length || !addresses.every(isPublicAddress)) {
      throw new Error("Recipe URL resolves to a disallowed address");
    }
    signal.throwIfAborted();
    const response = await request(url, {
      redirect: "manual",
      signal,
      headers: { "User-Agent": "BrangerRecipeParser/1.0" },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get("location");
      if (!location || hop === 5) {
        throw new Error("Invalid or excessive redirects");
      }
      url = new URL(location, url);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Recipe website returned HTTP ${response.status}`);
    }
    const maxBytes = 2 * 1024 * 1024;
    if (Number(response.headers.get("content-length")) > maxBytes) {
      await response.body?.cancel();
      throw new Error("Recipe page is too large");
    }
    if (!response.body) return "";
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let size = 0;
    let html = "";
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > maxBytes) throw new Error("Recipe page is too large");
        html += decoder.decode(chunk.value, { stream: true });
      }
      return html + decoder.decode();
    } finally {
      await reader.cancel();
    }
  }
  throw new Error("Too many redirects");
}
