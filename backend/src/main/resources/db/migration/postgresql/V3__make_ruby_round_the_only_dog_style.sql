-- The Ruby Round pack is now the only published dog artwork collection.
-- Keep every user-created variety and breed binding, but remove references to
-- retired CDN assets so all of them inherit the one supported style.
update appearance_varieties
set style = null
where style is not null;

delete from appearance_breed_styles;
delete from appearance_deleted_styles;

update appearance_settings
set default_style = 'ruby-round-scenes',
    revision = revision + 1,
    row_version = row_version + 1,
    updated_at = (extract(epoch from clock_timestamp()) * 1000)::bigint;
