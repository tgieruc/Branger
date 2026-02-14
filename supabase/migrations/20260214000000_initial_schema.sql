-- ============================================
-- RECIPES
-- ============================================
create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  photo_url text,
  source_type text not null default 'manual'
    check (source_type in ('manual', 'text_ai', 'url_ai', 'photo_ai')),
  source_url text,
  share_token text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index recipes_user_id_idx on public.recipes(user_id);
create index recipes_share_token_idx on public.recipes(share_token) where share_token is not null;

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid references public.recipes(id) on delete cascade not null,
  name text not null,
  description text not null default '',
  position integer not null default 0
);

create index recipe_ingredients_recipe_id_idx on public.recipe_ingredients(recipe_id);

create table public.recipe_steps (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid references public.recipes(id) on delete cascade not null,
  step_number integer not null,
  instruction text not null
);

create index recipe_steps_recipe_id_idx on public.recipe_steps(recipe_id);

-- ============================================
-- SHOPPING LISTS (collaborative, no single owner)
-- ============================================
create table public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.list_members (
  id uuid primary key default gen_random_uuid(),
  list_id uuid references public.shopping_lists(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  joined_at timestamptz not null default now(),
  unique(list_id, user_id)
);

create index list_members_user_id_idx on public.list_members(user_id);
create index list_members_list_id_idx on public.list_members(list_id);

create table public.list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid references public.shopping_lists(id) on delete cascade not null,
  name text not null,
  description text,
  checked boolean not null default false,
  recipe_id uuid references public.recipes(id) on delete set null,
  position integer not null default 0
);

create index list_items_list_id_idx on public.list_items(list_id);

-- ============================================
-- AUTO-DELETE LIST WHEN LAST MEMBER LEAVES
-- ============================================
create or replace function public.delete_empty_lists()
returns trigger as $$
begin
  if not exists (
    select 1 from public.list_members where list_id = OLD.list_id
  ) then
    delete from public.shopping_lists where id = OLD.list_id;
  end if;
  return OLD;
end;
$$ language plpgsql security definer;

create trigger on_last_member_leaves
  after delete on public.list_members
  for each row execute function public.delete_empty_lists();

-- ============================================
-- AUTO-UPDATE updated_at
-- ============================================
create or replace function public.update_updated_at()
returns trigger as $$
begin
  NEW.updated_at = now();
  return NEW;
end;
$$ language plpgsql;

create trigger recipes_updated_at
  before update on public.recipes
  for each row execute function public.update_updated_at();

create trigger shopping_lists_updated_at
  before update on public.shopping_lists
  for each row execute function public.update_updated_at();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.recipe_steps enable row level security;
alter table public.shopping_lists enable row level security;
alter table public.list_members enable row level security;
alter table public.list_items enable row level security;

-- RECIPES: owner can CRUD, anyone with share_token can SELECT
create policy "Users can view own recipes"
  on public.recipes for select
  using (auth.uid() = user_id);

create policy "Anyone can view shared recipes"
  on public.recipes for select
  using (share_token is not null);

create policy "Users can insert own recipes"
  on public.recipes for insert
  with check (auth.uid() = user_id);

create policy "Users can update own recipes"
  on public.recipes for update
  using (auth.uid() = user_id);

create policy "Users can delete own recipes"
  on public.recipes for delete
  using (auth.uid() = user_id);

-- RECIPE INGREDIENTS: same as parent recipe
create policy "Users can view own recipe ingredients"
  on public.recipe_ingredients for select
  using (
    exists (
      select 1 from public.recipes
      where recipes.id = recipe_ingredients.recipe_id
        and (recipes.user_id = auth.uid() or recipes.share_token is not null)
    )
  );

create policy "Users can manage own recipe ingredients"
  on public.recipe_ingredients for insert
  with check (
    exists (
      select 1 from public.recipes
      where recipes.id = recipe_ingredients.recipe_id
        and recipes.user_id = auth.uid()
    )
  );

create policy "Users can update own recipe ingredients"
  on public.recipe_ingredients for update
  using (
    exists (
      select 1 from public.recipes
      where recipes.id = recipe_ingredients.recipe_id
        and recipes.user_id = auth.uid()
    )
  );

create policy "Users can delete own recipe ingredients"
  on public.recipe_ingredients for delete
  using (
    exists (
      select 1 from public.recipes
      where recipes.id = recipe_ingredients.recipe_id
        and recipes.user_id = auth.uid()
    )
  );

-- RECIPE STEPS: same pattern
create policy "Users can view own recipe steps"
  on public.recipe_steps for select
  using (
    exists (
      select 1 from public.recipes
      where recipes.id = recipe_steps.recipe_id
        and (recipes.user_id = auth.uid() or recipes.share_token is not null)
    )
  );

create policy "Users can manage own recipe steps"
  on public.recipe_steps for insert
  with check (
    exists (
      select 1 from public.recipes
      where recipes.id = recipe_steps.recipe_id
        and recipes.user_id = auth.uid()
    )
  );

create policy "Users can update own recipe steps"
  on public.recipe_steps for update
  using (
    exists (
      select 1 from public.recipes
      where recipes.id = recipe_steps.recipe_id
        and recipes.user_id = auth.uid()
    )
  );

create policy "Users can delete own recipe steps"
  on public.recipe_steps for delete
  using (
    exists (
      select 1 from public.recipes
      where recipes.id = recipe_steps.recipe_id
        and recipes.user_id = auth.uid()
    )
  );

-- SHOPPING LISTS: members can view
create policy "Members can view their lists"
  on public.shopping_lists for select
  using (
    exists (
      select 1 from public.list_members
      where list_members.list_id = shopping_lists.id
        and list_members.user_id = auth.uid()
    )
  );

create policy "Authenticated users can create lists"
  on public.shopping_lists for insert
  with check (auth.uid() is not null);

create policy "Members can update their lists"
  on public.shopping_lists for update
  using (
    exists (
      select 1 from public.list_members
      where list_members.list_id = shopping_lists.id
        and list_members.user_id = auth.uid()
    )
  );

create policy "Members can delete their lists"
  on public.shopping_lists for delete
  using (
    exists (
      select 1 from public.list_members
      where list_members.list_id = shopping_lists.id
        and list_members.user_id = auth.uid()
    )
  );

-- LIST MEMBERS: members can view/manage membership
create policy "Members can view list members"
  on public.list_members for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.list_members lm
      where lm.list_id = list_members.list_id
        and lm.user_id = auth.uid()
    )
  );

create policy "Authenticated users can join lists"
  on public.list_members for insert
  with check (auth.uid() is not null);

create policy "Members can remove members"
  on public.list_members for delete
  using (
    exists (
      select 1 from public.list_members lm
      where lm.list_id = list_members.list_id
        and lm.user_id = auth.uid()
    )
  );

-- LIST ITEMS: members of the list can CRUD
create policy "Members can view list items"
  on public.list_items for select
  using (
    exists (
      select 1 from public.list_members
      where list_members.list_id = list_items.list_id
        and list_members.user_id = auth.uid()
    )
  );

create policy "Members can add list items"
  on public.list_items for insert
  with check (
    exists (
      select 1 from public.list_members
      where list_members.list_id = list_items.list_id
        and list_members.user_id = auth.uid()
    )
  );

create policy "Members can update list items"
  on public.list_items for update
  using (
    exists (
      select 1 from public.list_members
      where list_members.list_id = list_items.list_id
        and list_members.user_id = auth.uid()
    )
  );

create policy "Members can delete list items"
  on public.list_items for delete
  using (
    exists (
      select 1 from public.list_members
      where list_members.list_id = list_items.list_id
        and list_members.user_id = auth.uid()
    )
  );

-- ============================================
-- STORAGE BUCKET for recipe photos
-- ============================================
insert into storage.buckets (id, name, public)
  values ('recipe-photos', 'recipe-photos', true);

create policy "Authenticated users can upload recipe photos"
  on storage.objects for insert
  with check (
    bucket_id = 'recipe-photos'
    and auth.uid() is not null
  );

create policy "Anyone can view recipe photos"
  on storage.objects for select
  using (bucket_id = 'recipe-photos');

create policy "Users can delete own recipe photos"
  on storage.objects for delete
  using (
    bucket_id = 'recipe-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
