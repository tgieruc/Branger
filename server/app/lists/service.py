from sqlalchemy import case, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import ListItem, ListMember, ShoppingList, User

from .schemas import (
    ItemCreate,
    ItemOut,
    ItemUpdate,
    ListDetailOut,
    ListSummaryOut,
    MemberOut,
)


async def create_list(
    db: AsyncSession, user_id: str, name: str
) -> ListDetailOut:
    shopping_list = ShoppingList(name=name)
    db.add(shopping_list)
    await db.flush()

    member = ListMember(list_id=shopping_list.id, user_id=user_id)
    db.add(member)
    await db.flush()

    # Fetch back with relationships
    return await get_list_detail(db, shopping_list.id)


async def get_user_lists(
    db: AsyncSession, user_id: str
) -> list[ListSummaryOut]:
    # Subquery: lists the user is a member of
    member_list_ids = (
        select(ListMember.list_id)
        .where(ListMember.user_id == user_id)
        .subquery()
    )

    # For each list, get item_count and unchecked_count
    stmt = (
        select(
            ShoppingList.id,
            ShoppingList.name,
            func.count(ListItem.id).label("item_count"),
            func.sum(
                case((ListItem.checked == False, 1), else_=0)  # noqa: E712
            ).label("unchecked_count"),
        )
        .outerjoin(ListItem, ListItem.list_id == ShoppingList.id)
        .where(ShoppingList.id.in_(select(member_list_ids.c.list_id)))
        .group_by(ShoppingList.id)
    )

    result = await db.execute(stmt)
    rows = result.all()
    return [
        ListSummaryOut(
            id=row.id,
            name=row.name,
            item_count=row.item_count,
            unchecked_count=int(row.unchecked_count or 0),
        )
        for row in rows
    ]


async def get_list_detail(
    db: AsyncSession, list_id: str
) -> ListDetailOut | None:
    result = await db.execute(
        select(ShoppingList)
        .options(
            selectinload(ShoppingList.items),
            selectinload(ShoppingList.members).selectinload(ListMember.user),
        )
        .where(ShoppingList.id == list_id)
    )
    shopping_list = result.scalar_one_or_none()
    if shopping_list is None:
        return None

    items_sorted = sorted(shopping_list.items, key=lambda i: i.position)
    return ListDetailOut(
        id=shopping_list.id,
        name=shopping_list.name,
        created_at=shopping_list.created_at.isoformat(),
        updated_at=shopping_list.updated_at.isoformat(),
        items=[
            ItemOut(
                id=item.id,
                list_id=item.list_id,
                name=item.name,
                description=item.description,
                checked=item.checked,
                recipe_id=item.recipe_id,
                position=item.position,
                created_at=item.created_at.isoformat(),
            )
            for item in items_sorted
        ],
        members=[
            MemberOut(
                user_id=m.user_id,
                email=m.user.email,
                joined_at=m.joined_at.isoformat(),
            )
            for m in shopping_list.members
        ],
    )


async def is_member(
    db: AsyncSession, list_id: str, user_id: str
) -> bool:
    result = await db.execute(
        select(ListMember).where(
            ListMember.list_id == list_id,
            ListMember.user_id == user_id,
        )
    )
    return result.scalar_one_or_none() is not None


async def add_items(
    db: AsyncSession, list_id: str, items: list[ItemCreate]
) -> list[ItemOut]:
    # Get the current max position
    result = await db.execute(
        select(func.coalesce(func.max(ListItem.position), -1)).where(
            ListItem.list_id == list_id
        )
    )
    max_pos = result.scalar()

    created_items = []
    for i, item_data in enumerate(items):
        item = ListItem(
            list_id=list_id,
            name=item_data.name,
            description=item_data.description,
            recipe_id=item_data.recipe_id,
            position=max_pos + 1 + i,
        )
        db.add(item)
        created_items.append(item)

    await db.flush()

    return [
        ItemOut(
            id=item.id,
            list_id=item.list_id,
            name=item.name,
            description=item.description,
            checked=item.checked,
            recipe_id=item.recipe_id,
            position=item.position,
            created_at=item.created_at.isoformat(),
        )
        for item in created_items
    ]


async def update_item(
    db: AsyncSession, list_id: str, item_id: str, data: ItemUpdate
) -> ItemOut | None:
    result = await db.execute(
        select(ListItem).where(ListItem.id == item_id, ListItem.list_id == list_id)
    )
    item = result.scalar_one_or_none()
    if item is None:
        return None

    if data.checked is not None:
        item.checked = data.checked
    if data.name is not None:
        item.name = data.name

    await db.flush()

    return ItemOut(
        id=item.id,
        list_id=item.list_id,
        name=item.name,
        description=item.description,
        checked=item.checked,
        recipe_id=item.recipe_id,
        position=item.position,
        created_at=item.created_at.isoformat(),
    )


async def delete_item(db: AsyncSession, list_id: str, item_id: str) -> bool:
    result = await db.execute(
        select(ListItem).where(ListItem.id == item_id, ListItem.list_id == list_id)
    )
    item = result.scalar_one_or_none()
    if item is None:
        return False
    await db.delete(item)
    await db.flush()
    return True


async def batch_delete_items(db: AsyncSession, list_id: str, item_ids: list[str]) -> None:
    await db.execute(
        delete(ListItem).where(ListItem.id.in_(item_ids), ListItem.list_id == list_id)
    )
    await db.flush()


async def join_list(
    db: AsyncSession, list_id: str, user_id: str
) -> None:
    # Check if already a member (idempotent)
    existing = await db.execute(
        select(ListMember).where(
            ListMember.list_id == list_id,
            ListMember.user_id == user_id,
        )
    )
    if existing.scalar_one_or_none() is not None:
        return

    member = ListMember(list_id=list_id, user_id=user_id)
    db.add(member)
    await db.flush()


async def leave_list(
    db: AsyncSession, list_id: str, user_id: str
) -> None:
    # Remove the member
    await db.execute(
        delete(ListMember).where(
            ListMember.list_id == list_id,
            ListMember.user_id == user_id,
        )
    )
    await db.flush()

    # Check if any members remain
    result = await db.execute(
        select(func.count()).select_from(ListMember).where(
            ListMember.list_id == list_id
        )
    )
    remaining = result.scalar()

    if remaining == 0:
        # Delete the list (cascade will delete items)
        result = await db.execute(
            select(ShoppingList).where(ShoppingList.id == list_id)
        )
        shopping_list = result.scalar_one_or_none()
        if shopping_list:
            await db.delete(shopping_list)
            await db.flush()


async def update_list(
    db: AsyncSession, list_id: str, name: str
) -> ListDetailOut | None:
    result = await db.execute(
        select(ShoppingList).where(ShoppingList.id == list_id)
    )
    shopping_list = result.scalar_one_or_none()
    if shopping_list is None:
        return None

    shopping_list.name = name
    await db.flush()

    return await get_list_detail(db, list_id)
