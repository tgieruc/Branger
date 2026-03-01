import json
import ipaddress
import re
import socket

import httpx

from app.config import settings

MISTRAL_CHAT_URL = "https://api.mistral.ai/v1/chat/completions"
MISTRAL_OCR_URL = "https://api.mistral.ai/v1/ocr"

# ── System prompts (ported from Supabase edge functions) ─────────

TEXT_SYSTEM_PROMPT = """You are a recipe parser. Given free-form text about a recipe, extract it into a structured JSON format.

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
- Steps should be clear, concise instructions
- If the text is unclear, make reasonable assumptions
- Return ONLY the JSON, no markdown, no explanation"""

URL_SYSTEM_PROMPT = """You are a recipe parser. Given the text content scraped from a recipe webpage, extract it into a structured JSON format.

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
- Return ONLY the JSON, no markdown, no explanation"""

PHOTO_SYSTEM_PROMPT = """You are a recipe parser. Given OCR-extracted text from a recipe photo, extract it into a structured JSON format.

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
- OCR text may have errors \u2014 correct obvious misspellings
- The text may come from multiple overlapping screenshots \u2014 deduplicate any repeated content
- Steps should be clear, concise instructions
- Return ONLY the JSON, no markdown, no explanation"""

# ── DNS rebinding domains to block ───────────────────────────────

REBINDING_DOMAINS = [".nip.io", ".sslip.io", ".xip.io", ".localtest.me", ".lvh.me"]


# ── Helpers ──────────────────────────────────────────────────────

def is_private_ip(ip_str: str) -> bool:
    """Check if an IP address is private, loopback, or link-local."""
    try:
        ip = ipaddress.ip_address(ip_str)
        return ip.is_private or ip.is_loopback or ip.is_link_local
    except ValueError:
        return False


def validate_url(url: str) -> str:
    """Validate URL for SSRF protection. Returns the URL if valid, raises ValueError otherwise."""
    from urllib.parse import urlparse

    parsed = urlparse(url)

    if parsed.scheme not in ("http", "https"):
        raise ValueError("Only HTTP/HTTPS URLs are allowed")

    hostname = parsed.hostname
    if not hostname:
        raise ValueError("Invalid URL format")

    # Block localhost
    if hostname.lower() == "localhost":
        raise ValueError("URL points to a private/internal address")

    # Block IPv6
    if hostname.startswith("["):
        raise ValueError("IPv6 addresses are not allowed")

    # Check direct IP addresses
    try:
        ip = ipaddress.ip_address(hostname)
        if ip.is_private or ip.is_loopback or ip.is_link_local:
            raise ValueError("URL points to a private/internal address")
        return url
    except ValueError as e:
        if "private" in str(e) or "internal" in str(e):
            raise
        # Not an IP address, continue with hostname checks

    # Block known DNS rebinding services
    for domain in REBINDING_DOMAINS:
        if hostname.lower().endswith(domain):
            raise ValueError("URL points to a disallowed domain")

    # Resolve DNS and check for private IPs (both IPv4 and IPv6)
    try:
        resolved = socket.getaddrinfo(hostname, None)
        ips = [addr[4][0] for addr in resolved]
        if ips and all(is_private_ip(ip) for ip in ips):
            raise ValueError("URL resolves to a private/internal address")
    except socket.gaierror:
        raise ValueError("Could not resolve hostname")

    return url


def strip_html(html: str) -> str:
    """Convert HTML to plain text, stripping scripts, styles, and tags."""
    text = re.sub(r"<script[^>]*>.*?</script>", "", html, flags=re.DOTALL)
    text = re.sub(r"<style[^>]*>.*?</style>", "", text, flags=re.DOTALL)
    text = re.sub(r"<[^>]+>", " ", text)
    text = text.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
    text = text.replace("&nbsp;", " ")
    text = re.sub(r"&#\d+;", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:15000]


def _normalize_recipe(raw: dict) -> dict:
    """Validate and normalize the AI response into a clean recipe dict."""
    if (
        not isinstance(raw.get("title"), str)
        or not isinstance(raw.get("ingredients"), list)
        or not isinstance(raw.get("steps"), list)
    ):
        raise ValueError("Invalid response format from AI")

    return {
        "title": raw["title"],
        "ingredients": [
            {
                "name": str(i.get("name", "") if isinstance(i, dict) else ""),
                "description": str(
                    i.get("description", "") if isinstance(i, dict) else ""
                ),
            }
            for i in raw["ingredients"]
        ],
        "steps": [str(s) for s in raw["steps"]],
    }


# ── Mistral API calls ───────────────────────────────────────────

async def call_mistral_chat(text: str, system_prompt: str) -> dict:
    """Call Mistral Large to structure recipe text."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            MISTRAL_CHAT_URL,
            headers={"Authorization": f"Bearer {settings.mistral_api_key}"},
            json={
                "model": "mistral-large-latest",
                "temperature": 0.3,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": text},
                ],
            },
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]
        raw = json.loads(content)
        return _normalize_recipe(raw)


async def call_mistral_ocr(image_url: str) -> str:
    """Call Mistral OCR to extract text from an image."""
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            MISTRAL_OCR_URL,
            headers={"Authorization": f"Bearer {settings.mistral_api_key}"},
            json={
                "model": "mistral-ocr-latest",
                "document": {
                    "type": "image_url",
                    "image_url": image_url,
                },
            },
        )
        resp.raise_for_status()
        data = resp.json()
        pages = []
        for page in data.get("pages", []):
            if page.get("markdown"):
                pages.append(page["markdown"])
        return "\n\n".join(pages)


# ── Public entry points ─────────────────────────────────────────

async def parse_text(text: str) -> dict:
    """Parse free-form recipe text."""
    return await call_mistral_chat(text, TEXT_SYSTEM_PROMPT)


async def parse_url(url: str) -> dict:
    """Fetch a URL, strip HTML, and parse the recipe."""
    validate_url(url)

    async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
        resp = await client.get(
            url,
            headers={"User-Agent": "Mozilla/5.0 (compatible; RecipeParser/1.0)"},
        )
        resp.raise_for_status()

        # Check final URL after redirects for SSRF
        final_url = str(resp.url)
        if final_url != url:
            validate_url(final_url)

        page_text = strip_html(resp.text)

    user_content = f"URL: {url}\n\nPage content:\n{page_text}"
    return await call_mistral_chat(user_content, URL_SYSTEM_PROMPT)


async def parse_photos(image_urls: list[str]) -> dict:
    """OCR images then structure the extracted text as a recipe."""
    ocr_texts = []
    for image_url in image_urls:
        text = await call_mistral_ocr(image_url)
        if text:
            ocr_texts.append(text)

    extracted_text = "\n\n".join(ocr_texts)
    user_content = f"OCR extracted text:\n\n{extracted_text}"
    return await call_mistral_chat(user_content, PHOTO_SYSTEM_PROMPT)
