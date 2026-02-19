import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve((req) => {
  const url = new URL(req.url);

  // Forward all query params to the app via deep link.
  // PKCE flow sends ?code=xxx, which the app exchanges for a session.
  if (url.search) {
    return new Response(null, {
      status: 302,
      headers: { Location: `branger://reset-password${url.search}` },
    });
  }

  // No params — something went wrong
  return new Response("Invalid reset link. Please request a new one from the app.", {
    status: 400,
    headers: { "Content-Type": "text/plain" },
  });
});
