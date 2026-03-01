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

  return new Response(null, {
    status: 302,
    headers: { Location: deepLink },
  });
});
