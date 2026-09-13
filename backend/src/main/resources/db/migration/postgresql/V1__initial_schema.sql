-- Initial Puppy Ruby application schema: 23 entities and 7 collection tables.
-- Matches the Hibernate 7.4 entity model; no application data is inserted here.
-- The configured default schema/search path determines the destination.
-- Java field initializers are deliberately not SQL defaults.
-- Collection order columns and their composite keys preserve list order.
-- PostgreSQL uses VARCHAR plus CHECK for the existing string-enumerated attributes.
-- No IF EXISTS/IF NOT EXISTS: unexpected existing objects must fail migration.

create table accounts (
        id varchar(36) not null,
        created_at bigint not null,
        display_name varchar(40) not null,
        email varchar(254) unique,
        email_verified boolean not null,
        kakao_id varchar(40) unique,
        password_hash varchar(100),
        player_id varchar(36) not null unique,
        role varchar(16) not null check ((role in ('USER','ADMIN'))),
        status varchar(16) not null check ((status in ('ACTIVE','SUSPENDED'))),
        primary key (id)
    );

create table admin_audit (
        id varchar(36) not null,
        action varchar(32) not null,
        actor_id varchar(36) not null,
        created_at bigint not null,
        reason varchar(600) not null,
        target_id varchar(80) not null,
        target_type varchar(24) not null,
        primary key (id)
    );

create table appearance_breed_styles (
        settings_id varchar(16) not null,
        style varchar(24) not null,
        breed varchar(24) not null,
        primary key (settings_id, breed)
    );

create table appearance_breed_varieties (
        settings_id varchar(16) not null,
        variety_id varchar(36) not null,
        breed varchar(24) not null,
        primary key (settings_id, breed)
    );

create table appearance_deleted_styles (
        settings_id varchar(16) not null,
        style varchar(24) not null,
        unique (settings_id, style)
    );

create table appearance_settings (
        id varchar(16) not null,
        default_style varchar(24) not null,
        revision bigint not null,
        row_version bigint not null,
        updated_at bigint,
        primary key (id)
    );

create table appearance_varieties (
        settings_id varchar(16) not null,
        breed varchar(24) not null,
        coat_color varchar(7),
        variety_id varchar(36) not null,
        name varchar(48) not null,
        pattern varchar(16) not null,
        pattern_color varchar(7) not null,
        shape varchar(16) not null,
        style varchar(24),
        position integer not null check ((position>=0)),
        primary key (settings_id, position)
    );

create table auth_email_tokens (
        token_hash varchar(64) not null,
        account_id varchar(36) not null,
        created_at bigint not null,
        expires_at bigint not null,
        kind varchar(10) not null check ((kind in ('VERIFY','RESET'))),
        primary key (token_hash)
    );

create table auth_mutex (
        id varchar(16) not null,
        primary key (id)
    );

create table auth_sessions (
        token_hash varchar(64) not null,
        account_id varchar(36) not null,
        created_at bigint not null,
        expires_at bigint not null,
        primary key (token_hash)
    );

create table commerce_draws (
        id varchar(36) not null,
        account_id varchar(36) not null,
        breed integer,
        catalog_revision bigint not null,
        created_at bigint not null,
        duplicate boolean not null,
        entry_id varchar(64) not null,
        grade varchar(8) not null,
        item_id varchar(40),
        kind varchar(12) not null,
        label varchar(100) not null,
        puppy_id varchar(36),
        request_key varchar(80) not null unique,
        primary key (id)
    );

create table commerce_items (
        account_id varchar(36) not null,
        quantity bigint not null,
        item_key varchar(64) not null,
        primary key (account_id, item_key)
    );

create table commerce_settings (
        id varchar(16) not null,
        products_json varchar(32000) not null,
        revision bigint not null,
        row_version bigint not null,
        sales_enabled boolean not null,
        updated_at bigint,
        weights_json varchar(32000) not null,
        primary key (id)
    );

create table commerce_ticket_ledger (
        id varchar(64) not null,
        account_id varchar(36) not null,
        action varchar(12) not null,
        created_at bigint not null,
        kind varchar(12) not null,
        operation_id varchar(200) not null,
        quantity integer not null,
        primary key (id)
    );

create table commerce_wallets (
        account_id varchar(36) not null,
        accessory bigint not null,
        aura bigint not null,
        dog bigint not null,
        row_version bigint not null,
        primary key (account_id)
    );

create table desktop_devices (
        id varchar(255) not null,
        created_at bigint not null,
        last_seen bigint not null,
        name varchar(80) not null,
        player_id varchar(255) not null,
        revoked_at bigint,
        token_hash varchar(255) not null unique,
        primary key (id)
    );

create table desktop_mutex (
        id varchar(255) not null,
        primary key (id)
    );

create table desktop_pairings (
        code_hash varchar(255) not null,
        consumed_at bigint,
        created_at bigint not null,
        expires_at bigint not null,
        player_id varchar(255) not null,
        primary key (code_hash)
    );

create table desktop_receipts (
        id varchar(255) not null,
        created_at bigint not null,
        device_id varchar(255) not null,
        fingerprint varchar(255) not null,
        message varchar(2000) not null,
        success boolean not null,
        primary key (id)
    );

create table media_uploads (
        id varchar(36) not null,
        bucket varchar(63) not null,
        completed_at bigint,
        content_type varchar(32) not null,
        created_at bigint not null,
        expires_at bigint not null,
        object_key varchar(256) not null unique,
        owner_player_id varchar(36) not null,
        purpose varchar(24),
        sha256 varchar(44) not null,
        size bigint not null,
        primary key (id)
    );

create table payment_orders (
        id varchar(64) not null,
        account_id varchar(36) not null,
        amount integer not null,
        approval_sent_at bigint,
        catalog_revision bigint not null,
        checked_at bigint,
        claim_token varchar(36),
        claim_until bigint not null,
        confirmation_requested_at bigint,
        created_at bigint not null,
        customer_key varchar(36) not null,
        idempotency_key varchar(36) not null,
        kind varchar(32) not null,
        last_failure varchar(40),
        mode varchar(8) not null,
        order_name varchar(100) not null,
        paid_at bigint,
        payment_key varchar(200),
        product_id varchar(80) not null,
        quantity integer not null,
        receipt_url varchar(2048),
        refunded_amount integer not null,
        request_id varchar(36) not null,
        reversed_quantity integer not null,
        status varchar(32) not null,
        terms_accepted_at bigint not null,
        terms_version varchar(32) not null,
        tickets_granted boolean not null,
        primary key (id),
        constraint payment_account_request_unique unique (account_id, request_id),
        constraint payment_key_unique unique (payment_key)
    );

create table players (
        id varchar(255) not null,
        care_count integer not null,
        coins integer not null,
        last_gift_date date,
        selected_id varchar(255),
        training_count integer not null,
        primary key (id)
    );

create table puppies (
        player_id varchar(255) not null,
        accessory varchar(255),
        aura varchar(255),
        breed integer,
        energy integer,
        eyes varchar(255),
        fur varchar(255),
        grade varchar(255) check ((grade in ('N','R','SR','SSR'))),
        happiness integer,
        hunger integer,
        id varchar(255),
        last_feed bigint,
        last_play bigint,
        last_rest bigint,
        last_train bigint,
        name varchar(255),
        xp integer,
        puppy_order integer not null check ((puppy_order>=0)),
        primary key (player_id, puppy_order)
    );

create table seo_pages (
        settings_id varchar(16) not null,
        description varchar(600) not null,
        indexable boolean not null,
        title varchar(200) not null,
        page_key varchar(16) not null,
        primary key (settings_id, page_key)
    );

create table seo_settings (
        id varchar(16) not null,
        default_description varchar(600) not null,
        default_title varchar(200) not null,
        google_verification varchar(200) not null,
        indexing_enabled boolean not null,
        naver_verification varchar(200) not null,
        og_image_alt varchar(320) not null,
        og_image_url varchar(2048) not null,
        revision bigint not null,
        row_version bigint not null,
        site_name varchar(120) not null,
        site_url varchar(300) not null,
        updated_at bigint,
        primary key (id)
    );

create table walk_friendships (
        id varchar(255) not null,
        accepted boolean not null,
        created_at bigint not null,
        recipient_id varchar(255) not null,
        requester_id varchar(255) not null,
        primary key (id)
    );

create table walk_messages (
        id varchar(255) not null,
        author_id varchar(255) not null,
        created_at bigint not null,
        dedupe_key varchar(255) not null unique,
        hidden_at bigint,
        room_id varchar(255) not null,
        text varchar(1000) not null,
        primary key (id)
    );

create table walk_mutex (
        id varchar(255) not null,
        primary key (id)
    );

create table walk_profiles (
        id varchar(255) not null,
        age integer,
        configured boolean not null,
        joined_at bigint not null,
        last_message bigint not null,
        last_move bigint not null,
        last_seen bigint not null,
        nickname varchar(48) not null,
        photo varchar(200000),
        player_id varchar(255) not null unique,
        puppy_accessory varchar(255),
        puppy_aura varchar(255),
        puppy_breed integer not null,
        puppy_eyes varchar(255),
        puppy_fur varchar(255),
        puppy_grade varchar(255),
        puppy_id varchar(255),
        puppy_name varchar(255),
        real_name varchar(80),
        room_id varchar(255),
        x float(53) not null,
        y float(53) not null,
        primary key (id)
    );

create table walk_rooms (
        id varchar(255) not null,
        capacity integer not null,
        closed_at bigint,
        created_at bigint not null,
        description varchar(240) not null,
        owner_id varchar(255),
        theme varchar(16) not null,
        title varchar(80) not null,
        primary key (id)
    );

create index auth_email_account
       on auth_email_tokens (account_id);

create index auth_session_account
       on auth_sessions (account_id);

create index commerce_draw_account
       on commerce_draws (account_id, created_at);

create index media_owner_idx
       on media_uploads (owner_player_id);

create index payment_account_created
       on payment_orders (account_id, created_at);

alter table appearance_breed_styles
       add constraint FKj6xwcue6p3w9tssan9w90e4eg
       foreign key (settings_id)
       references appearance_settings;

alter table appearance_breed_varieties
       add constraint FKrlqb1jrfrsve5y49ir8r0ij6d
       foreign key (settings_id)
       references appearance_settings;

alter table appearance_deleted_styles
       add constraint FKbrh63kwignyjclelg5pqw38wj
       foreign key (settings_id)
       references appearance_settings;

alter table appearance_varieties
       add constraint FKgftiobr99g9prcpgykpocemrl
       foreign key (settings_id)
       references appearance_settings;

alter table commerce_items
       add constraint FKswbc8h3d6at045bip9dq01g3y
       foreign key (account_id)
       references commerce_wallets;

alter table puppies
       add constraint FK8sysnoc651orccylm2jivcovs
       foreign key (player_id)
       references players;

alter table seo_pages
       add constraint FK8c4i24pl12elxndy48li90446
       foreign key (settings_id)
       references seo_settings;

