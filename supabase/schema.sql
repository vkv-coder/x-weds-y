-- ==========================================
-- X weds Y - wedding guest PWA
-- All tables prefixed wy_ (shared "rotry_event" Supabase project).
-- Guests authenticate with a family code only (no Supabase Auth, no
-- approval). Admin authenticates with a PIN -> short-lived session token.
-- Every table has RLS enabled with ZERO anon/authenticated grants on the
-- base tables except wy_itinerary/wy_announcements (public read, nothing
-- sensitive) - all other access goes through SECURITY DEFINER RPCs that
-- re-validate the family code / admin token on every call.
-- ==========================================

create table if not exists wy_families (
  code text primary key,
  family_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists wy_members (
  id uuid primary key default gen_random_uuid(),
  family_code text not null references wy_families(code) on delete cascade,
  name text not null,
  room_no text,
  sort_order int not null default 0,
  member_no int,
  created_at timestamptz not null default now()
);
create index if not exists wy_members_family_idx on wy_members(family_code);

-- Guest-editable special-requirement note (wheelchair, creche, etc.) -
-- deliberately a separate concept from wy_travel_details.notes, which is
-- about the journey itself, not accessibility/venue needs.
alter table wy_members add column if not exists remarks text;

-- member_no: a permanent per-family sequence number (v001/1, v001/2, ...)
-- assigned once at creation and never recalculated, so it stays a stable
-- reference for a specific person even if someone else is later removed.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'wy_members' and column_name = 'member_no'
  ) then
    alter table wy_members add column member_no int;
  end if;
end $$;

update wy_members m set member_no = sub.rn
from (
  select id, row_number() over (partition by family_code order by sort_order, created_at) as rn
  from wy_members where member_no is null
) sub
where m.id = sub.id and m.member_no is null;

alter table wy_members alter column member_no set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'wy_members_family_member_no_key'
  ) then
    alter table wy_members add constraint wy_members_family_member_no_key unique (family_code, member_no);
  end if;
end $$;

create table if not exists wy_travel_details (
  member_id uuid primary key references wy_members(id) on delete cascade,
  arrival_date date,
  arrival_time time,
  arrival_mode text,
  arrival_number text,
  departure_date date,
  departure_time time,
  departure_mode text,
  departure_number text,
  notes text,
  updated_at timestamptz not null default now()
);

-- Pickup/drop-off assignment: admin-only fields (never written by the
-- guest-facing wy_save_travel_details RPC), shown read-only to the guest
-- so they know who's collecting them.
alter table wy_travel_details add column if not exists arrival_vehicle_no text;
alter table wy_travel_details add column if not exists arrival_driver_contact text;
alter table wy_travel_details add column if not exists departure_vehicle_no text;
alter table wy_travel_details add column if not exists departure_driver_contact text;

create table if not exists wy_itinerary (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  event_date date,
  start_time time,
  end_time time,
  venue text,
  menu text,
  dress_code text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists wy_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  created_at timestamptz not null default now()
);

-- Two general help-contact numbers shown to every guest. Public read
-- (phone numbers meant to be shared, same reasoning as itinerary/
-- announcements), admin-write only.
create table if not exists wy_contact_info (
  id int primary key default 1,
  contact1_label text,
  contact1_phone text,
  contact2_label text,
  contact2_phone text,
  constraint wy_contact_info_single_row check (id = 1)
);

create table if not exists wy_gallery_photos (
  id uuid primary key default gen_random_uuid(),
  family_code text references wy_families(code) on delete set null,
  uploader_name text,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create table if not exists wy_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  family_code text not null references wy_families(code) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create table if not exists wy_admin_secret (
  id int primary key default 1,
  pin_hash text not null,
  constraint wy_admin_secret_single_row check (id = 1)
);

create table if not exists wy_admin_sessions (
  token uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '12 hours')
);

alter table wy_families enable row level security;
alter table wy_members enable row level security;
alter table wy_travel_details enable row level security;
alter table wy_itinerary enable row level security;
alter table wy_announcements enable row level security;
alter table wy_gallery_photos enable row level security;
alter table wy_push_subscriptions enable row level security;
alter table wy_admin_secret enable row level security;
alter table wy_admin_sessions enable row level security;
alter table wy_contact_info enable row level security;

revoke all on wy_families, wy_members, wy_travel_details, wy_gallery_photos,
  wy_push_subscriptions, wy_admin_secret, wy_admin_sessions
  from anon, authenticated;

-- Itinerary, announcements & contact info: nothing sensitive, readable
-- without a code so the admin panel preview and any future "public
-- teaser" page both work.
drop policy if exists wy_itinerary_read on wy_itinerary;
create policy wy_itinerary_read on wy_itinerary for select using (true);
revoke insert, update, delete on wy_itinerary from anon, authenticated;

drop policy if exists wy_announcements_read on wy_announcements;
create policy wy_announcements_read on wy_announcements for select using (true);
revoke insert, update, delete on wy_announcements from anon, authenticated;

drop policy if exists wy_contact_info_read on wy_contact_info;
create policy wy_contact_info_read on wy_contact_info for select using (true);
revoke insert, update, delete on wy_contact_info from anon, authenticated;

grant select on wy_itinerary, wy_announcements, wy_contact_info to anon, authenticated;

-- ==========================================
-- Internal helpers (not granted to anon/authenticated directly)
-- ==========================================

create or replace function wy_assert_admin(p_token uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_token is null or not exists (
    select 1 from wy_admin_sessions where token = p_token and expires_at > now()
  ) then
    raise exception 'Not authorised.';
  end if;
end;
$$;
revoke all on function wy_assert_admin(uuid) from public;

create or replace function wy_assert_family(p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_code is null or not exists (select 1 from wy_families where code = lower(p_code)) then
    raise exception 'Invalid code.';
  end if;
end;
$$;
revoke all on function wy_assert_family(text) from public;

-- ==========================================
-- Guest-facing RPCs
-- ==========================================

create or replace function wy_guest_login(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := lower(trim(p_code));
  v_family wy_families;
  v_result jsonb;
begin
  select * into v_family from wy_families where code = v_code;
  if v_family is null then
    raise exception 'Family code not found.';
  end if;

  select jsonb_build_object(
    'code', v_family.code,
    'family_name', v_family.family_name,
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'name', m.name,
        'room_no', m.room_no,
        'member_code', v_family.code || '/' || m.member_no,
        'remarks', m.remarks,
        'travel', (
          select jsonb_build_object(
            'arrival_date', t.arrival_date, 'arrival_time', t.arrival_time,
            'arrival_mode', t.arrival_mode, 'arrival_number', t.arrival_number,
            'arrival_vehicle_no', t.arrival_vehicle_no, 'arrival_driver_contact', t.arrival_driver_contact,
            'departure_date', t.departure_date, 'departure_time', t.departure_time,
            'departure_mode', t.departure_mode, 'departure_number', t.departure_number,
            'departure_vehicle_no', t.departure_vehicle_no, 'departure_driver_contact', t.departure_driver_contact,
            'notes', t.notes
          ) from wy_travel_details t where t.member_id = m.id
        )
      ) order by m.sort_order, m.name)
      from wy_members m where m.family_code = v_family.code
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;
revoke all on function wy_guest_login(text) from public;
grant execute on function wy_guest_login(text) to anon, authenticated;

create or replace function wy_save_travel_details(
  p_code text, p_member_id uuid,
  p_arrival_date date, p_arrival_time time, p_arrival_mode text, p_arrival_number text,
  p_departure_date date, p_departure_time time, p_departure_mode text, p_departure_number text,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := lower(trim(p_code));
begin
  if not exists (select 1 from wy_members where id = p_member_id and family_code = v_code) then
    raise exception 'Member does not belong to this family code.';
  end if;

  insert into wy_travel_details (
    member_id, arrival_date, arrival_time, arrival_mode, arrival_number,
    departure_date, departure_time, departure_mode, departure_number, notes, updated_at
  ) values (
    p_member_id, p_arrival_date, p_arrival_time, p_arrival_mode, p_arrival_number,
    p_departure_date, p_departure_time, p_departure_mode, p_departure_number, p_notes, now()
  )
  on conflict (member_id) do update set
    arrival_date = excluded.arrival_date, arrival_time = excluded.arrival_time,
    arrival_mode = excluded.arrival_mode, arrival_number = excluded.arrival_number,
    departure_date = excluded.departure_date, departure_time = excluded.departure_time,
    departure_mode = excluded.departure_mode, departure_number = excluded.departure_number,
    notes = excluded.notes, updated_at = now();
end;
$$;
revoke all on function wy_save_travel_details(text, uuid, date, time, text, text, date, time, text, text, text) from public;
grant execute on function wy_save_travel_details(text, uuid, date, time, text, text, date, time, text, text, text) to anon, authenticated;

create or replace function wy_save_remarks(p_code text, p_member_id uuid, p_remarks text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := lower(trim(p_code));
begin
  if not exists (select 1 from wy_members where id = p_member_id and family_code = v_code) then
    raise exception 'Member does not belong to this family code.';
  end if;
  update wy_members set remarks = nullif(trim(p_remarks), '') where id = p_member_id;
end;
$$;
revoke all on function wy_save_remarks(text, uuid, text) from public;
grant execute on function wy_save_remarks(text, uuid, text) to anon, authenticated;

create or replace function wy_subscribe_push(p_code text, p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := lower(trim(p_code));
begin
  perform wy_assert_family(v_code);
  insert into wy_push_subscriptions (family_code, endpoint, p256dh, auth)
  values (v_code, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set family_code = excluded.family_code, p256dh = excluded.p256dh, auth = excluded.auth;
end;
$$;
revoke all on function wy_subscribe_push(text, text, text, text) from public;
grant execute on function wy_subscribe_push(text, text, text, text) to anon, authenticated;

create or replace function wy_get_gallery(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := lower(trim(p_code));
begin
  perform wy_assert_family(v_code);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', id, 'uploader_name', uploader_name, 'storage_path', storage_path, 'created_at', created_at
    ) order by created_at desc)
    from wy_gallery_photos
  ), '[]'::jsonb);
end;
$$;
revoke all on function wy_get_gallery(text) from public;
grant execute on function wy_get_gallery(text) to anon, authenticated;

create or replace function wy_add_gallery_photo(p_code text, p_uploader_name text, p_storage_path text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := lower(trim(p_code));
  v_id uuid;
begin
  perform wy_assert_family(v_code);
  insert into wy_gallery_photos (family_code, uploader_name, storage_path)
  values (v_code, p_uploader_name, p_storage_path)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function wy_add_gallery_photo(text, text, text) from public;
grant execute on function wy_add_gallery_photo(text, text, text) to anon, authenticated;

-- ==========================================
-- Admin RPCs
-- ==========================================

create or replace function wy_admin_login(p_pin text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
  v_token uuid;
begin
  select pin_hash into v_hash from wy_admin_secret where id = 1;
  if v_hash is null or v_hash <> extensions.crypt(p_pin, v_hash) then
    raise exception 'Incorrect PIN.';
  end if;
  delete from wy_admin_sessions where expires_at < now();
  insert into wy_admin_sessions default values returning token into v_token;
  return v_token;
end;
$$;
revoke all on function wy_admin_login(text) from public;
grant execute on function wy_admin_login(text) to anon, authenticated;

create or replace function wy_admin_list_families(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform wy_assert_admin(p_token);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'code', f.code, 'family_name', f.family_name,
      'members', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', m.id, 'name', m.name, 'room_no', m.room_no, 'sort_order', m.sort_order,
          'member_code', f.code || '/' || m.member_no, 'remarks', m.remarks
        ) order by m.sort_order, m.name)
        from wy_members m where m.family_code = f.code
      ), '[]'::jsonb)
    ) order by f.created_at desc)
    from wy_families f
  ), '[]'::jsonb);
end;
$$;
revoke all on function wy_admin_list_families(uuid) from public;
grant execute on function wy_admin_list_families(uuid) to anon, authenticated;

-- Flat member list across ALL families, with room + travel details, for the
-- admin Rooms and Travel views (room-wise/guest-wise lookup, arrival-
-- /departure-sorted manifest). wy_admin_list_families stays family-grouped
-- for the Families tab; this is the cross-family flat shape those two
-- reports actually need.
create or replace function wy_admin_list_members(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform wy_assert_admin(p_token);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', m.id,
      'name', m.name,
      'room_no', m.room_no,
      'member_code', m.family_code || '/' || m.member_no,
      'family_code', m.family_code,
      'family_name', f.family_name,
      'remarks', m.remarks,
      'travel', (
        select jsonb_build_object(
          'arrival_date', t.arrival_date, 'arrival_time', t.arrival_time,
          'arrival_mode', t.arrival_mode, 'arrival_number', t.arrival_number,
          'arrival_vehicle_no', t.arrival_vehicle_no, 'arrival_driver_contact', t.arrival_driver_contact,
          'departure_date', t.departure_date, 'departure_time', t.departure_time,
          'departure_mode', t.departure_mode, 'departure_number', t.departure_number,
          'departure_vehicle_no', t.departure_vehicle_no, 'departure_driver_contact', t.departure_driver_contact,
          'notes', t.notes
        ) from wy_travel_details t where t.member_id = m.id
      )
    ) order by f.family_name, m.sort_order, m.name)
    from wy_members m
    join wy_families f on f.code = m.family_code
  ), '[]'::jsonb);
end;
$$;
revoke all on function wy_admin_list_members(uuid) from public;
grant execute on function wy_admin_list_members(uuid) to anon, authenticated;

create or replace function wy_admin_create_family(p_token uuid, p_code text, p_family_name text, p_member_names text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := lower(trim(p_code));
  v_name text;
  v_i int := 0;
begin
  perform wy_assert_admin(p_token);
  insert into wy_families (code, family_name) values (v_code, p_family_name);
  foreach v_name in array p_member_names loop
    if trim(v_name) <> '' then
      v_i := v_i + 1;
      insert into wy_members (family_code, name, sort_order, member_no) values (v_code, trim(v_name), v_i - 1, v_i);
    end if;
  end loop;
end;
$$;
revoke all on function wy_admin_create_family(uuid, text, text, text[]) from public;
grant execute on function wy_admin_create_family(uuid, text, text, text[]) to anon, authenticated;

create or replace function wy_admin_delete_family(p_token uuid, p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform wy_assert_admin(p_token);
  delete from wy_families where code = lower(trim(p_code));
end;
$$;
revoke all on function wy_admin_delete_family(uuid, text) from public;
grant execute on function wy_admin_delete_family(uuid, text) to anon, authenticated;

create or replace function wy_admin_add_member(p_token uuid, p_code text, p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_code text := lower(trim(p_code));
  v_next_sort int;
  v_next_member_no int;
begin
  perform wy_assert_admin(p_token);
  select coalesce(max(sort_order) + 1, 0), coalesce(max(member_no) + 1, 1)
    into v_next_sort, v_next_member_no
    from wy_members where family_code = v_code;
  insert into wy_members (family_code, name, sort_order, member_no) values (v_code, trim(p_name), v_next_sort, v_next_member_no)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function wy_admin_add_member(uuid, text, text) from public;
grant execute on function wy_admin_add_member(uuid, text, text) to anon, authenticated;

create or replace function wy_admin_delete_member(p_token uuid, p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform wy_assert_admin(p_token);
  delete from wy_members where id = p_member_id;
end;
$$;
revoke all on function wy_admin_delete_member(uuid, uuid) from public;
grant execute on function wy_admin_delete_member(uuid, uuid) to anon, authenticated;

create or replace function wy_admin_set_room(p_token uuid, p_member_id uuid, p_room_no text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform wy_assert_admin(p_token);
  update wy_members set room_no = p_room_no where id = p_member_id;
end;
$$;
revoke all on function wy_admin_set_room(uuid, uuid, text) from public;
grant execute on function wy_admin_set_room(uuid, uuid, text) to anon, authenticated;

-- Pickup/drop-off assignment (vehicle no. + driver contact). Upserts an
-- empty wy_travel_details row first so admin can assign a pickup even
-- before the guest has submitted their own arrival/departure details.
create or replace function wy_admin_set_pickup(p_token uuid, p_member_id uuid, p_leg text, p_vehicle_no text, p_driver_contact text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform wy_assert_admin(p_token);
  if p_leg not in ('arrival', 'departure') then
    raise exception 'Invalid leg - must be arrival or departure.';
  end if;

  insert into wy_travel_details (member_id) values (p_member_id)
  on conflict (member_id) do nothing;

  if p_leg = 'arrival' then
    update wy_travel_details set arrival_vehicle_no = p_vehicle_no, arrival_driver_contact = p_driver_contact, updated_at = now()
    where member_id = p_member_id;
  else
    update wy_travel_details set departure_vehicle_no = p_vehicle_no, departure_driver_contact = p_driver_contact, updated_at = now()
    where member_id = p_member_id;
  end if;
end;
$$;
revoke all on function wy_admin_set_pickup(uuid, uuid, text, text, text) from public;
grant execute on function wy_admin_set_pickup(uuid, uuid, text, text, text) to anon, authenticated;

create or replace function wy_admin_set_contacts(p_token uuid, p_c1_label text, p_c1_phone text, p_c2_label text, p_c2_phone text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform wy_assert_admin(p_token);
  insert into wy_contact_info (id, contact1_label, contact1_phone, contact2_label, contact2_phone)
  values (1, p_c1_label, p_c1_phone, p_c2_label, p_c2_phone)
  on conflict (id) do update set
    contact1_label = excluded.contact1_label, contact1_phone = excluded.contact1_phone,
    contact2_label = excluded.contact2_label, contact2_phone = excluded.contact2_phone;
end;
$$;
revoke all on function wy_admin_set_contacts(uuid, text, text, text, text) from public;
grant execute on function wy_admin_set_contacts(uuid, text, text, text, text) to anon, authenticated;

create or replace function wy_admin_upsert_itinerary(
  p_token uuid, p_id uuid, p_event_name text, p_event_date date,
  p_start_time time, p_end_time time, p_venue text, p_menu text, p_dress_code text, p_sort_order int
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform wy_assert_admin(p_token);
  if p_id is null then
    insert into wy_itinerary (event_name, event_date, start_time, end_time, venue, menu, dress_code, sort_order)
    values (p_event_name, p_event_date, p_start_time, p_end_time, p_venue, p_menu, p_dress_code, coalesce(p_sort_order, 0))
    returning id into v_id;
  else
    update wy_itinerary set
      event_name = p_event_name, event_date = p_event_date, start_time = p_start_time, end_time = p_end_time,
      venue = p_venue, menu = p_menu, dress_code = p_dress_code, sort_order = coalesce(p_sort_order, sort_order)
    where id = p_id
    returning id into v_id;
  end if;
  return v_id;
end;
$$;
revoke all on function wy_admin_upsert_itinerary(uuid, uuid, text, date, time, time, text, text, text, int) from public;
grant execute on function wy_admin_upsert_itinerary(uuid, uuid, text, date, time, time, text, text, text, int) to anon, authenticated;

create or replace function wy_admin_delete_itinerary(p_token uuid, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform wy_assert_admin(p_token);
  delete from wy_itinerary where id = p_id;
end;
$$;
revoke all on function wy_admin_delete_itinerary(uuid, uuid) from public;
grant execute on function wy_admin_delete_itinerary(uuid, uuid) to anon, authenticated;

create or replace function wy_admin_post_announcement(p_token uuid, p_title text, p_message text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform wy_assert_admin(p_token);
  insert into wy_announcements (title, message) values (p_title, p_message) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function wy_admin_post_announcement(uuid, text, text) from public;
grant execute on function wy_admin_post_announcement(uuid, text, text) to anon, authenticated;

create or replace function wy_admin_list_gallery(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform wy_assert_admin(p_token);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', id, 'family_code', family_code, 'uploader_name', uploader_name, 'storage_path', storage_path, 'created_at', created_at
    ) order by created_at desc)
    from wy_gallery_photos
  ), '[]'::jsonb);
end;
$$;
revoke all on function wy_admin_list_gallery(uuid) from public;
grant execute on function wy_admin_list_gallery(uuid) to anon, authenticated;

-- Photo deletion (DB row + storage object) is handled entirely by the
-- wy-admin-delete-photo Edge Function (service role), not a Postgres RPC -
-- an RPC here could only ever delete the metadata row, not the storage
-- object itself, leaving orphaned files.

-- One-time: set the admin PIN (bcrypt via pgcrypto, lives in `extensions` schema on this project).
insert into wy_admin_secret (id, pin_hash) values (1, extensions.crypt('demo2027', extensions.gen_salt('bf')))
on conflict (id) do update set pin_hash = excluded.pin_hash;
