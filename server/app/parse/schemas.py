from pydantic import BaseModel, field_validator


# ── Input schemas ─────────────────────────────────────────────────

class ParseTextRequest(BaseModel):
    text: str

    @field_validator("text")
    @classmethod
    def text_not_too_long(cls, v: str) -> str:
        if len(v) > 15000:
            raise ValueError("Text is too long. Maximum 15,000 characters.")
        if not v.strip():
            raise ValueError("Text must not be empty.")
        return v


class ParseUrlRequest(BaseModel):
    url: str

    @field_validator("url")
    @classmethod
    def url_must_be_valid(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("URL must not be empty.")
        if not v.startswith(("http://", "https://")):
            raise ValueError("Only HTTP/HTTPS URLs are allowed.")
        return v


class ParsePhotoRequest(BaseModel):
    image_url: str | None = None
    image_urls: list[str] | None = None

    @field_validator("image_urls")
    @classmethod
    def validate_image_urls(cls, v: list[str] | None) -> list[str] | None:
        if v is not None:
            if len(v) < 1 or len(v) > 10:
                raise ValueError("Between 1 and 10 images are required.")
            for url in v:
                if not url or len(url) > 2000:
                    raise ValueError(
                        "Each image URL must be a non-empty string of at most 2,000 characters."
                    )
        return v

    def get_urls(self) -> list[str]:
        """Normalize to a list of URLs."""
        if self.image_urls:
            return self.image_urls
        if self.image_url:
            return [self.image_url]
        raise ValueError("image_url or image_urls is required")


# ── Output schemas ────────────────────────────────────────────────

class ParsedIngredientOut(BaseModel):
    name: str
    description: str


class ParsedRecipeOut(BaseModel):
    title: str
    ingredients: list[ParsedIngredientOut]
    steps: list[str]
