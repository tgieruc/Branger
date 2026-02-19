import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(() => {
  const html = `<!DOCTYPE html>
<html>
<head><title>Redirecting...</title></head>
<body>
<p>Redirecting to Branger...</p>
<script>
  const hash = window.location.hash.substring(1);
  if (hash) {
    window.location.replace('branger://reset-password?' + hash);
  } else {
    document.body.innerHTML = '<p>Invalid reset link.</p>';
  }
</script>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html" },
  });
});
