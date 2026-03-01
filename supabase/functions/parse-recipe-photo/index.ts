import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import * as jose from "jsr:@panva/jose@6";

const MISTRAL_API_KEY = Deno.env.get("MISTRAL_API_KEY")!;

const SUPABASE_JWT_ISSUER = Deno.env.get("SUPABASE_URL")! + "/auth/v1";
const SUPABASE_JWT_KEYS = jose.createRemoteJWKSet(
  new URL(Deno.env.get("SUPABASE_URL")! + "/auth/v1/.well-known/jwks.json"),
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
    }

    // Step 1: OCR with mistral-ocr-latest (dedicated endpoint, one image at a time)
    const ocrController = new AbortController();
    const ocrTimeout = setTimeout(() => ocrController.abort(), 60000);

    const ocrPages: string[] = [];
    for (const url of imageUrls) {
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
    }
    clearTimeout(ocrTimeout);

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
