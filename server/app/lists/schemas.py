from pydantic import BaseModel, field_validator


# ── Input schemas ─────────────────────────────────────────────────

class ListCreate(BaseModel):
    name: str

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Name must not be empty")
        if len(v) > 100:
            raise ValueError("Name must be at most 100 characters")
        return v


class ListUpdate(BaseModel):
    name: str

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Name must not be empty")
        if len(v) > 100:
            raise ValueError("Name must be at most 100 characters")
        return v


class ItemCreate(BaseModel):
    name: str
    description: str | None = None
    recipe_id: str | None = None


class ItemUpdate(BaseModel):
    checked: bool | None = None
    name: str | None = None


class BatchDeleteItems(BaseModel):
    item_ids: list[str]


# ── Output schemas ────────────────────────────────────────────────

class MemberOut(BaseModel):
    user_id: str
    email: str
    joined_at: str


class ItemOut(BaseModel):
    id: str
    list_id: str
    name: str
    description: str | None
    checked: bool
    recipe_id: str | None
    position: int
    created_at: str


class ListDetailOut(BaseModel):
    id: str
    name: str
    created_at: str
    updated_at: str
    items: list[ItemOut]
    members: list[MemberOut]


class ListSummaryOut(BaseModel):
    id: str
    name: str
    item_count: int
    unchecked_count: int
