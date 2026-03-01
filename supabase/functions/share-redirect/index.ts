import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve((req) => {
  const url = new URL(req.url);
  // Path after /share-redirect/ e.g. "recipe/abc-123" or "list/abc-123"
  const pathMatch = url.pathname.match(/\/share-redirect\/(.+)/);
  const subpath = pathMatch?.[1] ?? "";

  let deepLink: string | null = null;

  // Recipe: /share-redirect/recipe/{token}
  const recipeMatch = subpath.match(/^recipe\/([a-f0-9-]+)$/i);
  if (recipeMatch) {
    deepLink = `branger://share/${recipeMatch[1]}`;
  }

  // List: /share-redirect/list/{id}?token={invite_token}
  const listMatch = subpath.match(/^list\/([a-f0-9-]+)$/i);
  if (listMatch) {
    const token = url.searchParams.get("token");
    if (token) {
      deepLink = `branger://list/${listMatch[1]}?token=${token}`;
    }
  }

  if (!deepLink) {
    return new Response("Invalid share link.", {
      status: 400,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="1;url=${deepLink}">
  <title>Branger</title>
  <style>
    body { font-family: -apple-system, system-ui, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f5f5f5; color: #333; text-align: center; }
    .container { padding: 2rem; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    p { color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Opening Branger...</h1>
    <p>If nothing happens, you may need to install the app.</p>
  </div>
  <script>window.location.href = "${deepLink}";</script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
});
