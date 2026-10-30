import { fetchRecipeHtml, isPublicAddress } from "./recipe-fetch.ts";
function assert(value: unknown, message = "assertion failed"): asserts value {
  if (!value) throw new Error(message);
}
async function rejects(action: () => Promise<unknown>) {
  let failed = false;
  try {
    await action();
  } catch {
    failed = true;
  }
  assert(failed, "expected rejection");
}
const publicDns = () => Promise.resolve(["93.184.216.34"]);
Deno.test("blocks private, metadata, CGNAT, IPv6, and special-use addresses", () => {
  for (
    const ip of [
      "127.0.0.1",
      "10.0.0.1",
      "169.254.169.254",
      "192.168.1.1",
      "100.64.0.1",
      "::1",
      "224.0.0.1",
    ]
  ) {
    assert(!isPublicAddress(ip), ip);
  }
  assert(isPublicAddress("93.184.216.34"));
  assert(isPublicAddress("2606:4700:4700::1111"));
  assert(!isPublicAddress("::ffff:127.0.0.1"));
  assert(!isPublicAddress("2001:db8::1"));
});
Deno.test("unconfigured host is rejected before network request", async () => {
  let calls = 0;
  await rejects(() =>
    fetchRecipeHtml(
      "https://recipes.example.com",
      [],
      (() => {
        calls++;
        return Promise.resolve(new Response(""));
      }) as typeof fetch,
      publicDns,
    )
  );
  assert(calls === 0);
});
Deno.test("redirect to private destination is rejected before fetching destination", async () => {
  let calls = 0;
  await rejects(() =>
    fetchRecipeHtml(
      "https://recipes.example.com",
      ["recipes.example.com"],
      (() => {
        calls++;
        return Promise.resolve(
          new Response(null, {
            status: 302,
            headers: { location: "https://127.0.0.1/private" },
          }),
        );
      }) as typeof fetch,
      publicDns,
    )
  );
  assert(calls === 1);
});
Deno.test("mixed public/private DNS answers are rejected", async () => {
  let calls = 0;
  await rejects(() =>
    fetchRecipeHtml(
      "https://recipes.example.com",
      ["recipes.example.com"],
      (() => {
        calls++;
        return Promise.resolve(new Response(""));
      }) as typeof fetch,
      () => Promise.resolve(["93.184.216.34", "10.0.0.1"]),
    )
  );
  assert(calls === 0);
});
Deno.test("DNS failure is rejected without fetching", async () => {
  let calls = 0;
  await rejects(() =>
    fetchRecipeHtml(
      "https://recipes.example.com",
      ["recipes.example.com"],
      (() => {
        calls++;
        return Promise.resolve(new Response(""));
      }) as typeof fetch,
      () => Promise.reject(new Error("DNS unavailable")),
    )
  );
  assert(calls === 0);
});
Deno.test("reads permitted pages and bounds streamed response size", async () => {
  const host = ["recipes.example.com"];
  const html = await fetchRecipeHtml(
    "https://recipes.example.com",
    host,
    (() => Promise.resolve(new Response("<h1>Recipe</h1>"))) as typeof fetch,
    publicDns,
  );
  assert(html === "<h1>Recipe</h1>");
  await rejects(() =>
    fetchRecipeHtml(
      "https://recipes.example.com",
      host,
      (() =>
        Promise.resolve(
          new Response("x".repeat(2 * 1024 * 1024 + 1)),
        )) as typeof fetch,
      publicDns,
    )
  );
});
