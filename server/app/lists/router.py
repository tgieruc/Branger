from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models import User

from .schemas import (
    BatchDeleteItems,
    ItemCreate,
    ItemOut,
    ItemUpdate,
    ListCreate,
    ListDetailOut,
    ListSummaryOut,
    ListUpdate,
)
from .service import (
    add_items,
    batch_delete_items,
    create_list,
    delete_item,
    get_list_detail,
    get_user_lists,
    is_member,
    join_list,
    leave_list,
    update_item,
    update_list,
)

router = APIRouter(prefix="/api/lists", tags=["lists"])


async def _check_membership(
    db: AsyncSession, list_id: str, user_id: str
) -> None:
    if not await is_member(db, list_id, user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this list",
        )


@router.get("/", response_model=list[ListSummaryOut])
async def list_my_lists(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_user_lists(db, user.id)


@router.post("/", status_code=status.HTTP_201_CREATED, response_model=ListDetailOut)
async def create_list_endpoint(
    body: ListCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await create_list(db, user.id, body.name)
    await db.commit()
    return result


@router.get("/{list_id}", response_model=ListDetailOut)
async def get_list_detail_endpoint(
    list_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_membership(db, list_id, user.id)
    detail = await get_list_detail(db, list_id)
    if detail is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="List not found",
        )
    return detail


@router.put("/{list_id}", response_model=ListDetailOut)
async def update_list_endpoint(
    list_id: str,
    body: ListUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_membership(db, list_id, user.id)
    result = await update_list(db, list_id, body.name)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="List not found",
        )
    await db.commit()
    return result


@router.delete("/{list_id}", status_code=status.HTTP_204_NO_CONTENT)
async def leave_list_endpoint(
    list_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await leave_list(db, list_id, user.id)
    await db.commit()


@router.post(
    "/{list_id}/items",
    status_code=status.HTTP_201_CREATED,
    response_model=list[ItemOut],
)
async def add_items_endpoint(
    list_id: str,
    body: list[ItemCreate],
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_membership(db, list_id, user.id)
    items = await add_items(db, list_id, body)
    await db.commit()
    return items


@router.put("/{list_id}/items/{item_id}", response_model=ItemOut)
async def update_item_endpoint(
    list_id: str,
    item_id: str,
    body: ItemUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_membership(db, list_id, user.id)
    result = await update_item(db, item_id, body)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Item not found",
        )
    await db.commit()
    return result


@router.delete(
    "/{list_id}/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_item_endpoint(
    list_id: str,
    item_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_membership(db, list_id, user.id)
    deleted = await delete_item(db, item_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Item not found",
        )
    await db.commit()


@router.delete("/{list_id}/items", status_code=status.HTTP_204_NO_CONTENT)
async def batch_delete_items_endpoint(
    list_id: str,
    body: BatchDeleteItems,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_membership(db, list_id, user.id)
    await batch_delete_items(db, body.item_ids)
    await db.commit()


@router.post("/{list_id}/join")
async def join_list_endpoint(
    list_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await join_list(db, list_id, user.id)
    await db.commit()
    return {"status": "joined"}
