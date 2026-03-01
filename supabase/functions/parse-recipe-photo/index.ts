import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import * as jose from "jsr:@panva/jose@6";

const MISTRAL_API_KEY = Deno.env.get("MISTRAL_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const SUPABASE_JWT_ISSUER = SUPABASE_URL + "/auth/v1";
const SUPABASE_JWT_KEYS = jose.createRemoteJWKSet(
  new URL(SUPABASE_URL + "/auth/v1/.well-known/jwks.json"),
);

const SYSTEM_PROMPT = `You are a recipe parser. Given OCR-extracted text from a recipe photo, extract it into a structured JSON format.

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
- OCR text may have errors — correct obvious misspellings
- The text may come from multiple overlapping screenshots — deduplicate any repeated content
- Steps should be clear, concise instructions
- Return ONLY the JSON, no markdown, no explanation`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

// SSRF protection: validate URL is not pointing to internal resources
async function validateImageUrl(url: string): Promise<void> {
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

  if (/^localhost$/i.test(hostname)) {
    throw new Error("URL points to a private/internal address");
  }

  if (hostname.startsWith("[")) {
    throw new Error("IPv6 addresses are not allowed");
  }

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    if (isPrivateIP(hostname)) {
      throw new Error("URL points to a private/internal address");
    }
    return;
  }

  const rebindingDomains = [".nip.io", ".sslip.io", ".xip.io", ".localtest.me", ".lvh.me"];
  if (rebindingDomains.some((d) => hostname.toLowerCase().endsWith(d))) {
    throw new Error("URL points to a disallowed domain");
  }

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
  }
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

    // Rate limit check
    const rateLimitRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/check_ai_rate_limit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": authHeader,
        "apikey": SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({}),
    });
    if (rateLimitRes.ok) {
      const allowed = await rateLimitRes.json();
      if (!allowed) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }

    const body = await req.json();

    // Normalize: accept image_url (string) or image_urls (string[])
    let imageUrls: string[];
    if (Array.isArray(body.image_urls)) {
      imageUrls = body.image_urls;
    } else if (typeof body.image_url === "string") {
      imageUrls = [body.image_url];
    } else {
      return new Response(JSON.stringify({ error: "image_url or image_urls is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (imageUrls.length < 1 || imageUrls.length > 10) {
      return new Response(JSON.stringify({ error: "Between 1 and 10 images are required." }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    for (const url of imageUrls) {
      if (typeof url !== "string" || url.length === 0) {
        return new Response(JSON.stringify({ error: "Each image URL must be a non-empty string." }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      if (url.length > 2000) {
        return new Response(JSON.stringify({ error: "Each image URL must be at most 2,000 characters." }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      // SSRF protection: validate each image URL
      try {
        await validateImageUrl(url);
      } catch (e) {
        return new Response(JSON.stringify({ error: (e as Error).message }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }

    // Step 1: OCR with mistral-ocr-latest (dedicated endpoint, one image at a time)
    const ocrPages: string[] = [];
    for (const url of imageUrls) {
      const ocrController = new AbortController();
      const ocrTimeout = setTimeout(() => ocrController.abort(), 30000);
      try {
        const ocrResponse = await fetch("https://api.mistral.ai/v1/ocr", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${MISTRAL_API_KEY}`,
          },
          body: JSON.stringify({
            model: "mistral-ocr-latest",
            document: {
              type: "image_url",
              image_url: url,
            },
          }),
          signal: ocrController.signal,
        });
        clearTimeout(ocrTimeout);

        if (!ocrResponse.ok) {
          const errorBody = await ocrResponse.text();
          throw new Error(`Mistral OCR error (${ocrResponse.status}): ${errorBody}`);
        }

        const ocrData = await ocrResponse.json();
        for (const page of ocrData.pages || []) {
          if (page.markdown) {
            ocrPages.push(page.markdown);
          }
        }
      } catch (e) {
        clearTimeout(ocrTimeout);
        if (e instanceof DOMException && e.name === "AbortError") {
          throw new Error("OCR request timed out. Please try with fewer or smaller images.");
        }
        throw e;
      }
    }

    const extractedText = ocrPages.join("\n\n");

    // Step 2: Structure with mistral-large
    const aiController = new AbortController();
    const aiTimeout = setTimeout(() => aiController.abort(), 30000);
    const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MISTRAL_API_KEY}`,
      },
      body: JSON.stringify({
        model: "mistral-large-latest",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `OCR extracted text:\n\n${extractedText}` },
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
      signal: aiController.signal,
    });
    clearTimeout(aiTimeout);

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Mistral API error (${response.status}): ${errorBody}`);
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
