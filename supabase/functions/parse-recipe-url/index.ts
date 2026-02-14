import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

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

function extractTextFromHtml(html: string): string {
  // Remove script and style tags and their content
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  // Remove all HTML tags
  text = text.replace(/<[^>]+>/g, " ");
  // Decode common HTML entities
  text = text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  text = text.replace(/&nbsp;/g, " ").replace(/&#\d+;/g, "");
  // Collapse whitespace
  text = text.replace(/\s+/g, " ").trim();
  // Limit to avoid token overflow
  return text.slice(0, 8000);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const { url } = await req.json();

    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "url is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // SSRF protection: validate URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid URL format' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return new Response(JSON.stringify({ error: 'Only HTTP/HTTPS URLs are allowed' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    // Block private/internal IPs
    const hostname = parsedUrl.hostname;
    const blockedPatterns = [
      /^localhost$/i,
      /^127\./,
      /^10\./,
      /^172\.(1[6-9]|2\d|3[01])\./,
      /^192\.168\./,
      /^169\.254\./,
      /^0\./,
      /^\[::1\]$/,
      /^\[fd/i,
      /^\[fe80:/i,
    ];
    if (blockedPatterns.some(p => p.test(hostname))) {
      return new Response(JSON.stringify({ error: 'URL points to a private/internal address' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    // Fetch the webpage
    const pageResponse = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; RecipeParser/1.0)" },
    });
    const html = await pageResponse.text();
    const pageText = extractTextFromHtml(html);

    // Send to OpenAI
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
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${errorBody}`);
    }

    const data = await response.json();
    const recipe = JSON.parse(data.choices[0].message.content);

    return new Response(JSON.stringify(recipe), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error('Edge function error:', error);
    return new Response(JSON.stringify({ error: 'Failed to parse recipe. Please try again.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
});
