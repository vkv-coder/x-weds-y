alter table wy_itinerary
  add column if not exists map_link text,
  add column if not exists coordinator_name text,
  add column if not exists coordinator_phone text;

create or replace function wy_admin_upsert_itinerary(
  p_token uuid, p_id uuid, p_event_name text, p_event_date date,
  p_start_time time, p_end_time time, p_venue text, p_menu text, p_dress_code text, p_sort_order int,
  p_map_link text default null, p_coordinator_name text default null, p_coordinator_phone text default null
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
    insert into wy_itinerary (event_name, event_date, start_time, end_time, venue, menu, dress_code, sort_order, map_link, coordinator_name, coordinator_phone)
    values (p_event_name, p_event_date, p_start_time, p_end_time, p_venue, p_menu, p_dress_code, coalesce(p_sort_order, 0), p_map_link, p_coordinator_name, p_coordinator_phone)
    returning id into v_id;
  else
    update wy_itinerary set
      event_name = p_event_name, event_date = p_event_date, start_time = p_start_time, end_time = p_end_time,
      venue = p_venue, menu = p_menu, dress_code = p_dress_code, sort_order = coalesce(p_sort_order, sort_order),
      map_link = p_map_link, coordinator_name = p_coordinator_name, coordinator_phone = p_coordinator_phone
    where id = p_id
    returning id into v_id;
  end if;
  return v_id;
end;
$$;
revoke all on function wy_admin_upsert_itinerary(uuid, uuid, text, date, time, time, text, text, text, int, text, text, text) from public;
grant execute on function wy_admin_upsert_itinerary(uuid, uuid, text, date, time, time, text, text, text, int, text, text, text) to anon, authenticated;
alter table wy_families
  add column if not exists stay_place_name text,
  add column if not exists stay_map_link text;

create or replace function wy_admin_set_family_stay(p_token uuid, p_code text, p_stay_place_name text, p_stay_map_link text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform wy_assert_admin(p_token);
  update wy_families set stay_place_name = p_stay_place_name, stay_map_link = p_stay_map_link where code = lower(trim(p_code));
end;
$$;
revoke all on function wy_admin_set_family_stay(uuid, text, text, text) from public;
grant execute on function wy_admin_set_family_stay(uuid, text, text, text) to anon, authenticated;

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
    'stay_place_name', v_family.stay_place_name,
    'stay_map_link', v_family.stay_map_link,
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
      'stay_place_name', f.stay_place_name, 'stay_map_link', f.stay_map_link,
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
alter table wy_families
  add column if not exists stay_coordinator_name text,
  add column if not exists stay_coordinator_phone text;

create or replace function wy_admin_set_family_stay(
  p_token uuid, p_code text, p_stay_place_name text, p_stay_map_link text,
  p_stay_coordinator_name text default null, p_stay_coordinator_phone text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform wy_assert_admin(p_token);
  update wy_families set
    stay_place_name = p_stay_place_name, stay_map_link = p_stay_map_link,
    stay_coordinator_name = p_stay_coordinator_name, stay_coordinator_phone = p_stay_coordinator_phone
  where code = lower(trim(p_code));
end;
$$;
revoke all on function wy_admin_set_family_stay(uuid, text, text, text, text, text) from public;
grant execute on function wy_admin_set_family_stay(uuid, text, text, text, text, text) to anon, authenticated;

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
    'stay_place_name', v_family.stay_place_name,
    'stay_map_link', v_family.stay_map_link,
    'stay_coordinator_name', v_family.stay_coordinator_name,
    'stay_coordinator_phone', v_family.stay_coordinator_phone,
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
      'stay_place_name', f.stay_place_name, 'stay_map_link', f.stay_map_link,
      'stay_coordinator_name', f.stay_coordinator_name, 'stay_coordinator_phone', f.stay_coordinator_phone,
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
create table if not exists wy_travel_routes (
  id uuid primary key default gen_random_uuid(),
  from_place text not null,
  train_no text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists wy_travel_note (
  id int primary key default 1,
  airport_name text,
  road_time text,
  constraint wy_travel_note_single_row check (id = 1)
);

alter table wy_travel_routes enable row level security;
alter table wy_travel_note enable row level security;

drop policy if exists wy_travel_routes_read on wy_travel_routes;
create policy wy_travel_routes_read on wy_travel_routes for select using (true);
revoke insert, update, delete on wy_travel_routes from anon, authenticated;

drop policy if exists wy_travel_note_read on wy_travel_note;
create policy wy_travel_note_read on wy_travel_note for select using (true);
revoke insert, update, delete on wy_travel_note from anon, authenticated;

grant select on wy_travel_routes, wy_travel_note to anon, authenticated;

create or replace function wy_admin_upsert_travel_route(p_token uuid, p_id uuid, p_from_place text, p_train_no text, p_sort_order int)
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
    insert into wy_travel_routes (from_place, train_no, sort_order)
    values (p_from_place, p_train_no, coalesce(p_sort_order, 0))
    returning id into v_id;
  else
    update wy_travel_routes set
      from_place = p_from_place, train_no = p_train_no, sort_order = coalesce(p_sort_order, sort_order)
    where id = p_id
    returning id into v_id;
  end if;
  return v_id;
end;
$$;
revoke all on function wy_admin_upsert_travel_route(uuid, uuid, text, text, int) from public;
grant execute on function wy_admin_upsert_travel_route(uuid, uuid, text, text, int) to anon, authenticated;

create or replace function wy_admin_delete_travel_route(p_token uuid, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform wy_assert_admin(p_token);
  delete from wy_travel_routes where id = p_id;
end;
$$;
revoke all on function wy_admin_delete_travel_route(uuid, uuid) from public;
grant execute on function wy_admin_delete_travel_route(uuid, uuid) to anon, authenticated;

create or replace function wy_admin_set_travel_note(p_token uuid, p_airport_name text, p_road_time text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform wy_assert_admin(p_token);
  insert into wy_travel_note (id, airport_name, road_time) values (1, p_airport_name, p_road_time)
  on conflict (id) do update set airport_name = excluded.airport_name, road_time = excluded.road_time;
end;
$$;
revoke all on function wy_admin_set_travel_note(uuid, text, text) from public;
grant execute on function wy_admin_set_travel_note(uuid, text, text) to anon, authenticated;

create or replace function wy_guest_add_member(p_code text, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := lower(trim(p_code));
  v_id uuid;
  v_next_sort int;
  v_next_member_no int;
  v_name text := trim(p_name);
begin
  if not exists (select 1 from wy_families where code = v_code) then
    raise exception 'Family code not found.';
  end if;
  if v_name = '' then
    raise exception 'Name is required.';
  end if;
  select coalesce(max(sort_order) + 1, 0), coalesce(max(member_no) + 1, 1)
    into v_next_sort, v_next_member_no
    from wy_members where family_code = v_code;
  insert into wy_members (family_code, name, sort_order, member_no)
    values (v_code, v_name, v_next_sort, v_next_member_no)
    returning id into v_id;
  return jsonb_build_object(
    'id', v_id, 'name', v_name, 'room_no', null, 'remarks', null,
    'member_code', v_code || '/' || v_next_member_no, 'travel', null
  );
end;
$$;
revoke all on function wy_guest_add_member(text, text) from public;
grant execute on function wy_guest_add_member(text, text) to anon, authenticated;
create table if not exists wy_meals (
  id uuid primary key default gen_random_uuid(),
  meal_name text not null,
  meal_date date,
  meal_time time,
  venue text,
  details text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table wy_meals enable row level security;

drop policy if exists wy_meals_read on wy_meals;
create policy wy_meals_read on wy_meals for select using (true);
revoke insert, update, delete on wy_meals from anon, authenticated;
grant select on wy_meals to anon, authenticated;

create or replace function wy_admin_upsert_meal(
  p_token uuid, p_id uuid, p_meal_name text, p_meal_date date,
  p_meal_time time, p_venue text, p_details text, p_sort_order int
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
    insert into wy_meals (meal_name, meal_date, meal_time, venue, details, sort_order)
    values (p_meal_name, p_meal_date, p_meal_time, p_venue, p_details, coalesce(p_sort_order, 0))
    returning id into v_id;
  else
    update wy_meals set
      meal_name = p_meal_name, meal_date = p_meal_date, meal_time = p_meal_time,
      venue = p_venue, details = p_details, sort_order = coalesce(p_sort_order, sort_order)
    where id = p_id
    returning id into v_id;
  end if;
  return v_id;
end;
$$;
revoke all on function wy_admin_upsert_meal(uuid, uuid, text, date, time, text, text, int) from public;
grant execute on function wy_admin_upsert_meal(uuid, uuid, text, date, time, text, text, int) to anon, authenticated;

create or replace function wy_admin_delete_meal(p_token uuid, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform wy_assert_admin(p_token);
  delete from wy_meals where id = p_id;
end;
$$;
revoke all on function wy_admin_delete_meal(uuid, uuid) from public;
grant execute on function wy_admin_delete_meal(uuid, uuid) to anon, authenticated;
alter table wy_travel_note
  add column if not exists railway_station_name text,
  add column if not exists airport_to_venue_link text,
  add column if not exists airport_to_stay_link text,
  add column if not exists railway_to_venue_link text,
  add column if not exists railway_to_stay_link text;

create or replace function wy_admin_set_travel_note(
  p_token uuid, p_airport_name text, p_road_time text,
  p_railway_station_name text default null,
  p_airport_to_venue_link text default null,
  p_airport_to_stay_link text default null,
  p_railway_to_venue_link text default null,
  p_railway_to_stay_link text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform wy_assert_admin(p_token);
  insert into wy_travel_note (
    id, airport_name, road_time, railway_station_name,
    airport_to_venue_link, airport_to_stay_link, railway_to_venue_link, railway_to_stay_link
  ) values (
    1, p_airport_name, p_road_time, p_railway_station_name,
    p_airport_to_venue_link, p_airport_to_stay_link, p_railway_to_venue_link, p_railway_to_stay_link
  )
  on conflict (id) do update set
    airport_name = excluded.airport_name,
    road_time = excluded.road_time,
    railway_station_name = excluded.railway_station_name,
    airport_to_venue_link = excluded.airport_to_venue_link,
    airport_to_stay_link = excluded.airport_to_stay_link,
    railway_to_venue_link = excluded.railway_to_venue_link,
    railway_to_stay_link = excluded.railway_to_stay_link;
end;
$$;
revoke all on function wy_admin_set_travel_note(uuid, text, text, text, text, text, text, text) from public;
grant execute on function wy_admin_set_travel_note(uuid, text, text, text, text, text, text, text) to anon, authenticated;
