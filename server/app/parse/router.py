from fastapi import APIRouter, Depends, HTTPException, status

from app.auth.dependencies import get_current_user
from app.models import User

from .schemas import (
    ParsedRecipeOut,
    ParsePhotoRequest,
    ParseTextRequest,
    ParseUrlRequest,
)
from . import service

router = APIRouter(prefix="/api/recipes/parse", tags=["parse"])


@router.post("/text", response_model=ParsedRecipeOut)
async def parse_text(
    body: ParseTextRequest,
    _user: User = Depends(get_current_user),
):
    try:
        result = await service.parse_text(body.text)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to parse recipe: {e}",
        )


@router.post("/url", response_model=ParsedRecipeOut)
async def parse_url(
    body: ParseUrlRequest,
    _user: User = Depends(get_current_user),
):
    try:
        result = await service.parse_url(body.url)
        return result
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to parse recipe: {e}",
        )


@router.post("/photo", response_model=ParsedRecipeOut)
async def parse_photo(
    body: ParsePhotoRequest,
    _user: User = Depends(get_current_user),
):
    try:
        urls = body.get_urls()
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    try:
        result = await service.parse_photos(urls)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to parse recipe: {e}",
        )
