import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import * as jose from "jsr:@panva/jose@6";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

const SUPABASE_JWT_ISSUER = Deno.env.get("SUPABASE_URL")! + "/auth/v1";
const SUPABASE_JWT_KEYS = jose.createRemoteJWKSet(
  new URL(Deno.env.get("SUPABASE_URL")! + "/auth/v1/.well-known/jwks.json"),
);

const SYSTEM_PROMPT = `You are a recipe parser. Given the text content scraped from a recipe webpage, extract it into a structured JSON format.

Return ONLY valid JSON with this exact structure:
{
  "title": "Recipe Title",
  "ingredients": [
    { "name": "ingredient name", "description": "amount/qualifier" }
  ],
  "steps": ["step 1 instruction", "step 2 instruction"]
}

Rules:
- "name" is the item itself (e.g., "tomato", "spaghetti", "butter")
- "description" is the amount or qualifier (e.g., "1 can", "400g", "2 tablespoons", "1 large")
- Ignore ads, navigation, comments, and other non-recipe content
- Steps should be clear, concise instructions
- Return ONLY the JSON, no markdown, no explanation`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function extractTextFromHtml(html: string): string {
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<[^>]+>/g, " ");
  text = text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  text = text.replace(/&nbsp;/g, " ").replace(/&#\d+;/g, "");
  text = text.replace(/\s+/g, " ").trim();
  return text.slice(0, 8000);
}

// SSRF protection: check if an IPv4 address is private/internal
function isPrivateIP(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return false;
  return (
    parts[0] === 127 ||
    parts[0] === 10 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 169 && parts[1] === 254) ||
    parts[0] === 0
  );
}

// SSRF protection: validate URL with DNS resolution check
async function validateUrl(url: string): Promise<URL> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("Invalid URL format");
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("Only HTTP/HTTPS URLs are allowed");
  }

  const hostname = parsedUrl.hostname;

  // Block localhost
  if (/^localhost$/i.test(hostname)) {
    throw new Error("URL points to a private/internal address");
  }

  // Block IPv6 addresses
  if (hostname.startsWith("[")) {
    throw new Error("IPv6 addresses are not allowed");
  }

  // Check direct IPv4 addresses
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    if (isPrivateIP(hostname)) {
      throw new Error("URL points to a private/internal address");
    }
    return parsedUrl;
  }

  // Block known DNS rebinding services
  const rebindingDomains = [".nip.io", ".sslip.io", ".xip.io", ".localtest.me", ".lvh.me"];
  if (rebindingDomains.some((d) => hostname.toLowerCase().endsWith(d))) {
    throw new Error("URL points to a disallowed domain");
  }

  // Resolve DNS via DNS-over-HTTPS and check for private IPs
  try {
    const dnsRes = await fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(hostname)}&type=A`,
      { headers: { Accept: "application/dns-json" } },
    );
    const dnsData = await dnsRes.json();
    const ips: string[] = (dnsData.Answer || [])
      .filter((a: { type: number }) => a.type === 1)
      .map((a: { data: string }) => a.data);

    if (ips.length > 0 && ips.every((ip: string) => isPrivateIP(ip))) {
      throw new Error("URL resolves to a private/internal address");
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes("private")) throw e;
    // DNS-over-HTTPS unavailable: fall through with hostname-only validation
  }

  return parsedUrl;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify JWT using JWKS (Supabase recommended pattern for ES256)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    try {
      const token = authHeader.replace("Bearer ", "");
      await jose.jwtVerify(token, SUPABASE_JWT_KEYS, {
        issuer: SUPABASE_JWT_ISSUER,
        audience: "authenticated",
      });
    } catch (e) {
      console.error("Auth failed:", e);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { url } = await req.json();

    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "url is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // SSRF protection: validate URL and resolve DNS
    try {
      await validateUrl(url);
    } catch (e) {
      return new Response(JSON.stringify({ error: (e as Error).message }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Fetch the webpage with timeout
    const pageController = new AbortController();
    const pageTimeout = setTimeout(() => pageController.abort(), 15000);
    const pageResponse = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; RecipeParser/1.0)" },
      redirect: "follow",
      signal: pageController.signal,
    });
    clearTimeout(pageTimeout);

    // Verify the final URL (after redirects) is not private
    try {
      await validateUrl(pageResponse.url);
    } catch {
      return new Response(JSON.stringify({ error: "URL redirected to a disallowed address" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (!pageResponse.ok) {
      return new Response(JSON.stringify({ error: `Failed to fetch URL (HTTP ${pageResponse.status})` }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const html = await pageResponse.text();
    const pageText = extractTextFromHtml(html);

    // Send to OpenAI with timeout
    const aiController = new AbortController();
    const aiTimeout = setTimeout(() => aiController.abort(), 30000);
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `URL: ${url}\n\nPage content:\n${pageText}` },
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
      signal: aiController.signal,
    });
    clearTimeout(aiTimeout);

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${errorBody}`);
    }

    const data = await response.json();
    const recipe = JSON.parse(data.choices[0].message.content);

    // Validate response shape
    if (
      typeof recipe.title !== "string" ||
      !Array.isArray(recipe.ingredients) ||
      !Array.isArray(recipe.steps)
    ) {
      throw new Error("Invalid response format from AI");
    }

    return new Response(JSON.stringify({
      title: recipe.title,
      ingredients: recipe.ingredients.map((i: Record<string, unknown>) => ({
        name: String(i.name ?? ""),
        description: String(i.description ?? ""),
      })),
      steps: recipe.steps.map((s: unknown) => String(s)),
    }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error) {
    console.error("Edge function error:", error);
    return new Response(JSON.stringify({ error: "Failed to parse recipe. Please try again." }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
