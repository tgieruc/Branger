from pydantic import BaseModel, field_validator


# ── Input schemas ─────────────────────────────────────────────────

class IngredientIn(BaseModel):
    name: str
    description: str = ""
    position: int = 0


class StepIn(BaseModel):
    step_number: int
    instruction: str


class RecipeCreate(BaseModel):
    title: str
    ingredients: list[IngredientIn] = []
    steps: list[StepIn] = []
    photo_url: str | None = None
    source_type: str = "manual"
    source_url: str | None = None
    servings: str | None = None
    prep_time: str | None = None
    cook_time: str | None = None

    @field_validator("title")
    @classmethod
    def title_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Title must not be empty")
        return v


class RecipeUpdate(RecipeCreate):
    pass


# ── Output schemas ────────────────────────────────────────────────

class IngredientOut(BaseModel):
    id: str
    name: str
    description: str
    position: int


class StepOut(BaseModel):
    id: str
    step_number: int
    instruction: str


class RecipeOut(BaseModel):
    id: str
    title: str
    photo_url: str | None
    share_token: str | None
    source_type: str
    source_url: str | None
    servings: str | None
    prep_time: str | None
    cook_time: str | None
    created_at: str
    updated_at: str
    ingredients: list[IngredientOut]
    steps: list[StepOut]


class RecipeListOut(BaseModel):
    recipes: list[RecipeOut]
    has_more: bool


class ShareOut(BaseModel):
    share_token: str
    share_url: str
