# Schema coverage register — 2026-09-05

> Supporting evidence for the [database master checklist](MASTER_CHECKLIST.md).
> Findings, status statements and proposed next steps below reflect this document's recorded
> scope and date. Use the master checklist for current priorities and completion status;
> this document is not an independent work queue.

Live catalog reconciliation. Inventory coverage is not semantic approval. Every column is explicitly listed below; “review pending” means its purpose and reader/writer contract have not yet been individually closed in this register. Existing evidence packets remain supporting evidence, not automatic approval.

Includes ordinary and partitioned tables, views, and materialized views. PostgreSQL system schemas are excluded. Managed schemas are inventoried but are not application redesign targets. No row values, tokens, or secrets are exported.

| Relation | Kind | Columns | Disposition |
| --- | --- | ---: | --- |
| `archive.athletes_empty_backup` | table | 19 | preserve recovery evidence |
| `archive.relay_athletes_d3_backup` | table | 7 | preserve recovery evidence |
| `archive.relay_results_20260819_backup` | table | 13 | preserve recovery evidence |
| `archive.relay_results_d3_backup` | table | 13 | preserve recovery evidence |
| `archive.results_accidental_import_20260819_backup` | table | 23 | preserve recovery evidence |
| `archive.results_athlete_merge_backup` | table | 23 | preserve recovery evidence |
| `archive.results_d1_backup` | table | 23 | preserve recovery evidence |
| `archive.results_d2_backup` | table | 23 | preserve recovery evidence |
| `archive.results_xsource_20260819_backup` | table | 23 | preserve recovery evidence |
| `auth.audit_log_entries` | table | 5 | platform managed; preserve |
| `auth.custom_oauth_providers` | table | 25 | platform managed; preserve |
| `auth.flow_state` | table | 17 | platform managed; preserve |
| `auth.identities` | table | 9 | platform managed; preserve |
| `auth.instances` | table | 5 | platform managed; preserve |
| `auth.mfa_amr_claims` | table | 5 | platform managed; preserve |
| `auth.mfa_challenges` | table | 7 | platform managed; preserve |
| `auth.mfa_factors` | table | 13 | platform managed; preserve |
| `auth.oauth_authorizations` | table | 17 | platform managed; preserve |
| `auth.oauth_client_states` | table | 4 | platform managed; preserve |
| `auth.oauth_clients` | table | 13 | platform managed; preserve |
| `auth.oauth_consents` | table | 6 | platform managed; preserve |
| `auth.one_time_tokens` | table | 7 | platform managed; preserve |
| `auth.refresh_tokens` | table | 9 | platform managed; preserve |
| `auth.saml_providers` | table | 9 | platform managed; preserve |
| `auth.saml_relay_states` | table | 8 | platform managed; preserve |
| `auth.schema_migrations` | table | 1 | platform managed; preserve |
| `auth.sessions` | table | 15 | platform managed; preserve |
| `auth.sso_domains` | table | 5 | platform managed; preserve |
| `auth.sso_providers` | table | 5 | platform managed; preserve |
| `auth.users` | table | 35 | platform managed; preserve |
| `auth.webauthn_challenges` | table | 6 | platform managed; preserve |
| `auth.webauthn_credentials` | table | 14 | platform managed; preserve |
| `extensions.pg_stat_statements` | view | 49 | platform managed; preserve |
| `extensions.pg_stat_statements_info` | view | 2 | platform managed; preserve |
| `ingest.athlete_aliases` | table | 12 | review existing evidence and close column contracts |
| `ingest.event_recovery_queue` | table | 25 | review existing evidence and close column contracts |
| `ingest.fact_cleanup_archive` | table | 6 | review existing evidence and close column contracts |
| `ingest.observations` | table | 27 | review existing evidence and close column contracts |
| `ingest.quarantine` | table | 7 | review existing evidence and close column contracts |
| `ingest.recovery_queue` | table | 24 | review existing evidence and close column contracts |
| `ingest.runs` | table | 12 | review existing evidence and close column contracts |
| `ingest.source_links` | table | 7 | review existing evidence and close column contracts |
| `ingest.source_records` | table | 10 | review existing evidence and close column contracts |
| `ingest.team_aliases` | table | 14 | review existing evidence and close column contracts |
| `public.athlete_prs` | table | 11 | review existing evidence and close column contracts |
| `public.athlete_team_seasons` | table | 9 | review existing evidence and close column contracts |
| `public.athletes` | table | 19 | review existing evidence and close column contracts |
| `public.conference_memberships` | table | 6 | review existing evidence and close column contracts |
| `public.conferences` | table | 9 | review existing evidence and close column contracts |
| `public.divisions` | table | 5 | review existing evidence and close column contracts |
| `public.event_aliases` | table | 2 | review existing evidence and close column contracts |
| `public.event_types` | table | 5 | review existing evidence and close column contracts |
| `public.external_ids` | table | 12 | review existing evidence and close column contracts |
| `public.live_results` | table | 21 | deferred by user |
| `public.meets` | table | 22 | review existing evidence and close column contracts |
| `public.push_tokens` | table | 5 | review existing evidence and close column contracts |
| `public.regions` | table | 4 | review existing evidence and close column contracts |
| `public.relay_athletes` | table | 7 | review existing evidence and close column contracts |
| `public.relay_results` | table | 13 | review existing evidence and close column contracts |
| `public.results` | table | 23 | review existing evidence and close column contracts |
| `public.schools` | table | 16 | review existing evidence and close column contracts |
| `public.schools_full` | view | 11 | review existing evidence and close column contracts |
| `public.teams` | table | 11 | review existing evidence and close column contracts |
| `public.teams_summary` | view | 7 | review existing evidence and close column contracts |
| `public.unmapped_events` | table | 3 | review existing evidence and close column contracts |
| `public.unprocessed_live_results` | view | 17 | deferred by user |
| `public.v_athlete_prs` | view | 10 | review existing evidence and close column contracts |
| `public.waitlist` | table | 4 | review existing evidence and close column contracts |
| `realtime.messages` | partitioned table | 10 | platform managed; preserve |
| `realtime.schema_migrations` | table | 2 | platform managed; preserve |
| `realtime.subscription` | table | 9 | platform managed; preserve |
| `storage.buckets` | table | 12 | platform managed; preserve |
| `storage.buckets_analytics` | table | 7 | platform managed; preserve |
| `storage.buckets_vectors` | table | 4 | platform managed; preserve |
| `storage.migrations` | table | 4 | platform managed; preserve |
| `storage.objects` | table | 15 | platform managed; preserve |
| `storage.s3_multipart_uploads` | table | 10 | platform managed; preserve |
| `storage.s3_multipart_uploads_parts` | table | 10 | platform managed; preserve |
| `storage.vector_indexes` | table | 9 | platform managed; preserve |
| `supabase_migrations.schema_migrations` | table | 6 | platform managed; preserve |
| `vault.decrypted_secrets` | view | 9 | platform managed; preserve |
| `vault.secrets` | table | 8 | platform managed; preserve |

## Column checklist

### archive.athletes_empty_backup

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `athlete_id` | bigint | no | preserve historical shape |
| `school_id` | bigint | no | preserve historical shape |
| `full_name` | text | no | preserve historical shape |
| `first_name` | text | yes | preserve historical shape |
| `last_name` | text | yes | preserve historical shape |
| `gender` | text | yes | preserve historical shape |
| `class_year` | text | yes | preserve historical shape |
| `grad_year` | integer | yes | preserve historical shape |
| `primary_events` | text | yes | preserve historical shape |
| `hometown` | text | yes | preserve historical shape |
| `high_school` | text | yes | preserve historical shape |
| `tfrrs_athlete_id` | text | yes | preserve historical shape |
| `tfrrs_profile_url` | text | yes | preserve historical shape |
| `athletic_net_url` | text | yes | preserve historical shape |
| `profile_image_url` | text | yes | preserve historical shape |
| `bio` | text | yes | preserve historical shape |
| `is_active` | boolean | yes | preserve historical shape |
| `created_at` | timestamp with time zone | yes | preserve historical shape |
| `updated_at` | timestamp with time zone | yes | preserve historical shape |

### archive.relay_athletes_d3_backup

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `relay_athlete_id` | integer | no | preserve historical shape |
| `relay_result_id` | integer | yes | preserve historical shape |
| `athlete_id` | integer | yes | preserve historical shape |
| `tfrrs_athlete_id` | text | yes | preserve historical shape |
| `athlete_name` | text | yes | preserve historical shape |
| `leg_order` | integer | yes | preserve historical shape |
| `created_at` | timestamp with time zone | yes | preserve historical shape |

### archive.relay_results_20260819_backup

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `relay_result_id` | integer | no | preserve historical shape |
| `team_id` | integer | yes | preserve historical shape |
| `event_name` | text | no | preserve historical shape |
| `mark_raw` | text | yes | preserve historical shape |
| `mark_seconds` | numeric(10,2) | yes | preserve historical shape |
| `place` | integer | yes | preserve historical shape |
| `meet_name` | text | yes | preserve historical shape |
| `meet_id` | integer | yes | preserve historical shape |
| `event_id` | integer | yes | preserve historical shape |
| `date` | date | yes | preserve historical shape |
| `round` | text | yes | preserve historical shape |
| `created_at` | timestamp with time zone | yes | preserve historical shape |
| `event_type_id` | integer | yes | preserve historical shape |

### archive.relay_results_d3_backup

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `relay_result_id` | integer | no | preserve historical shape |
| `team_id` | integer | yes | preserve historical shape |
| `event_name` | text | no | preserve historical shape |
| `mark_raw` | text | yes | preserve historical shape |
| `mark_seconds` | numeric(10,2) | yes | preserve historical shape |
| `place` | integer | yes | preserve historical shape |
| `meet_name` | text | yes | preserve historical shape |
| `meet_id` | integer | yes | preserve historical shape |
| `event_id` | integer | yes | preserve historical shape |
| `date` | date | yes | preserve historical shape |
| `round` | text | yes | preserve historical shape |
| `created_at` | timestamp with time zone | yes | preserve historical shape |
| `event_type_id` | integer | yes | preserve historical shape |

### archive.results_accidental_import_20260819_backup

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `result_id` | bigint | no | preserve historical shape |
| `athlete_id` | bigint | no | preserve historical shape |
| `team_id` | bigint | yes | preserve historical shape |
| `event_name` | text | no | preserve historical shape |
| `mark_raw` | text | no | preserve historical shape |
| `mark_seconds` | double precision | yes | preserve historical shape |
| `mark_meters` | double precision | yes | preserve historical shape |
| `mark_feet` | text | yes | preserve historical shape |
| `wind` | text | yes | preserve historical shape |
| `round` | text | yes | preserve historical shape |
| `date` | date | yes | preserve historical shape |
| `season_code` | text | yes | preserve historical shape |
| `meet_name` | text | yes | preserve historical shape |
| `meet_location` | text | yes | preserve historical shape |
| `place` | integer | yes | preserve historical shape |
| `total_competitors` | integer | yes | preserve historical shape |
| `is_pr` | boolean | yes | preserve historical shape |
| `is_season_best` | boolean | yes | preserve historical shape |
| `created_at` | timestamp with time zone | yes | preserve historical shape |
| `meet_id` | integer | yes | preserve historical shape |
| `event_id` | integer | yes | preserve historical shape |
| `event_type_id` | integer | yes | preserve historical shape |
| `environment` | text | yes | preserve historical shape |

### archive.results_athlete_merge_backup

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `result_id` | bigint | no | preserve historical shape |
| `athlete_id` | bigint | no | preserve historical shape |
| `team_id` | bigint | yes | preserve historical shape |
| `event_name` | text | no | preserve historical shape |
| `mark_raw` | text | no | preserve historical shape |
| `mark_seconds` | double precision | yes | preserve historical shape |
| `mark_meters` | double precision | yes | preserve historical shape |
| `mark_feet` | text | yes | preserve historical shape |
| `wind` | text | yes | preserve historical shape |
| `round` | text | yes | preserve historical shape |
| `date` | date | yes | preserve historical shape |
| `season_code` | text | yes | preserve historical shape |
| `meet_name` | text | yes | preserve historical shape |
| `meet_location` | text | yes | preserve historical shape |
| `place` | integer | yes | preserve historical shape |
| `total_competitors` | integer | yes | preserve historical shape |
| `is_pr` | boolean | yes | preserve historical shape |
| `is_season_best` | boolean | yes | preserve historical shape |
| `created_at` | timestamp with time zone | yes | preserve historical shape |
| `meet_id` | integer | yes | preserve historical shape |
| `event_id` | integer | yes | preserve historical shape |
| `event_type_id` | integer | yes | preserve historical shape |
| `environment` | text | yes | preserve historical shape |

### archive.results_d1_backup

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `result_id` | bigint | no | preserve historical shape |
| `athlete_id` | bigint | no | preserve historical shape |
| `team_id` | bigint | yes | preserve historical shape |
| `event_name` | text | no | preserve historical shape |
| `mark_raw` | text | no | preserve historical shape |
| `mark_seconds` | double precision | yes | preserve historical shape |
| `mark_meters` | double precision | yes | preserve historical shape |
| `mark_feet` | text | yes | preserve historical shape |
| `wind` | text | yes | preserve historical shape |
| `round` | text | yes | preserve historical shape |
| `date` | date | yes | preserve historical shape |
| `season_code` | text | yes | preserve historical shape |
| `meet_name` | text | yes | preserve historical shape |
| `meet_location` | text | yes | preserve historical shape |
| `place` | integer | yes | preserve historical shape |
| `total_competitors` | integer | yes | preserve historical shape |
| `is_pr` | boolean | yes | preserve historical shape |
| `is_season_best` | boolean | yes | preserve historical shape |
| `created_at` | timestamp with time zone | yes | preserve historical shape |
| `meet_id` | integer | yes | preserve historical shape |
| `event_id` | integer | yes | preserve historical shape |
| `event_type_id` | integer | yes | preserve historical shape |
| `environment` | text | yes | preserve historical shape |

### archive.results_d2_backup

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `result_id` | bigint | no | preserve historical shape |
| `athlete_id` | bigint | no | preserve historical shape |
| `team_id` | bigint | yes | preserve historical shape |
| `event_name` | text | no | preserve historical shape |
| `mark_raw` | text | no | preserve historical shape |
| `mark_seconds` | double precision | yes | preserve historical shape |
| `mark_meters` | double precision | yes | preserve historical shape |
| `mark_feet` | text | yes | preserve historical shape |
| `wind` | text | yes | preserve historical shape |
| `round` | text | yes | preserve historical shape |
| `date` | date | yes | preserve historical shape |
| `season_code` | text | yes | preserve historical shape |
| `meet_name` | text | yes | preserve historical shape |
| `meet_location` | text | yes | preserve historical shape |
| `place` | integer | yes | preserve historical shape |
| `total_competitors` | integer | yes | preserve historical shape |
| `is_pr` | boolean | yes | preserve historical shape |
| `is_season_best` | boolean | yes | preserve historical shape |
| `created_at` | timestamp with time zone | yes | preserve historical shape |
| `meet_id` | integer | yes | preserve historical shape |
| `event_id` | integer | yes | preserve historical shape |
| `event_type_id` | integer | yes | preserve historical shape |
| `environment` | text | yes | preserve historical shape |

### archive.results_xsource_20260819_backup

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `result_id` | bigint | no | preserve historical shape |
| `athlete_id` | bigint | no | preserve historical shape |
| `team_id` | bigint | yes | preserve historical shape |
| `event_name` | text | no | preserve historical shape |
| `mark_raw` | text | no | preserve historical shape |
| `mark_seconds` | double precision | yes | preserve historical shape |
| `mark_meters` | double precision | yes | preserve historical shape |
| `mark_feet` | text | yes | preserve historical shape |
| `wind` | text | yes | preserve historical shape |
| `round` | text | yes | preserve historical shape |
| `date` | date | yes | preserve historical shape |
| `season_code` | text | yes | preserve historical shape |
| `meet_name` | text | yes | preserve historical shape |
| `meet_location` | text | yes | preserve historical shape |
| `place` | integer | yes | preserve historical shape |
| `total_competitors` | integer | yes | preserve historical shape |
| `is_pr` | boolean | yes | preserve historical shape |
| `is_season_best` | boolean | yes | preserve historical shape |
| `created_at` | timestamp with time zone | yes | preserve historical shape |
| `meet_id` | integer | yes | preserve historical shape |
| `event_id` | integer | yes | preserve historical shape |
| `event_type_id` | integer | yes | preserve historical shape |
| `environment` | text | yes | preserve historical shape |

### auth.audit_log_entries

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `instance_id` | uuid | yes | managed; no application redesign |
| `id` | uuid | no | managed; no application redesign |
| `payload` | json | yes | managed; no application redesign |
| `created_at` | timestamp with time zone | yes | managed; no application redesign |
| `ip_address` | character varying(64) | no | managed; no application redesign |

### auth.custom_oauth_providers

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `id` | uuid | no | managed; no application redesign |
| `provider_type` | text | no | managed; no application redesign |
| `identifier` | text | no | managed; no application redesign |
| `name` | text | no | managed; no application redesign |
| `client_id` | text | no | managed; no application redesign |
| `client_secret` | text | no | managed; no application redesign |
| `acceptable_client_ids` | text[] | no | managed; no application redesign |
| `scopes` | text[] | no | managed; no application redesign |
| `pkce_enabled` | boolean | no | managed; no application redesign |
| `attribute_mapping` | jsonb | no | managed; no application redesign |
| `authorization_params` | jsonb | no | managed; no application redesign |
| `enabled` | boolean | no | managed; no application redesign |
| `email_optional` | boolean | no | managed; no application redesign |
| `issuer` | text | yes | managed; no application redesign |
| `discovery_url` | text | yes | managed; no application redesign |
| `skip_nonce_check` | boolean | no | managed; no application redesign |
| `cached_discovery` | jsonb | yes | managed; no application redesign |
| `discovery_cached_at` | timestamp with time zone | yes | managed; no application redesign |
| `authorization_url` | text | yes | managed; no application redesign |
| `token_url` | text | yes | managed; no application redesign |
| `userinfo_url` | text | yes | managed; no application redesign |
| `jwks_uri` | text | yes | managed; no application redesign |
| `created_at` | timestamp with time zone | no | managed; no application redesign |
| `updated_at` | timestamp with time zone | no | managed; no application redesign |
| `custom_claims_allowlist` | text[] | no | managed; no application redesign |

### auth.flow_state

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `id` | uuid | no | managed; no application redesign |
| `user_id` | uuid | yes | managed; no application redesign |
| `auth_code` | text | yes | managed; no application redesign |
| `code_challenge_method` | auth.code_challenge_method | yes | managed; no application redesign |
| `code_challenge` | text | yes | managed; no application redesign |
| `provider_type` | text | no | managed; no application redesign |
| `provider_access_token` | text | yes | managed; no application redesign |
| `provider_refresh_token` | text | yes | managed; no application redesign |
| `created_at` | timestamp with time zone | yes | managed; no application redesign |
| `updated_at` | timestamp with time zone | yes | managed; no application redesign |
| `authentication_method` | text | no | managed; no application redesign |
| `auth_code_issued_at` | timestamp with time zone | yes | managed; no application redesign |
| `invite_token` | text | yes | managed; no application redesign |
| `referrer` | text | yes | managed; no application redesign |
| `oauth_client_state_id` | uuid | yes | managed; no application redesign |
| `linking_target_id` | uuid | yes | managed; no application redesign |
| `email_optional` | boolean | no | managed; no application redesign |

### auth.identities

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `provider_id` | text | no | managed; no application redesign |
| `user_id` | uuid | no | managed; no application redesign |
| `identity_data` | jsonb | no | managed; no application redesign |
| `provider` | text | no | managed; no application redesign |
| `last_sign_in_at` | timestamp with time zone | yes | managed; no application redesign |
| `created_at` | timestamp with time zone | yes | managed; no application redesign |
| `updated_at` | timestamp with time zone | yes | managed; no application redesign |
| `email` | text | yes | managed; no application redesign |
| `id` | uuid | no | managed; no application redesign |

### auth.instances

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `id` | uuid | no | managed; no application redesign |
| `uuid` | uuid | yes | managed; no application redesign |
| `raw_base_config` | text | yes | managed; no application redesign |
| `created_at` | timestamp with time zone | yes | managed; no application redesign |
| `updated_at` | timestamp with time zone | yes | managed; no application redesign |

### auth.mfa_amr_claims

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `session_id` | uuid | no | managed; no application redesign |
| `created_at` | timestamp with time zone | no | managed; no application redesign |
| `updated_at` | timestamp with time zone | no | managed; no application redesign |
| `authentication_method` | text | no | managed; no application redesign |
| `id` | uuid | no | managed; no application redesign |

### auth.mfa_challenges

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `id` | uuid | no | managed; no application redesign |
| `factor_id` | uuid | no | managed; no application redesign |
| `created_at` | timestamp with time zone | no | managed; no application redesign |
| `verified_at` | timestamp with time zone | yes | managed; no application redesign |
| `ip_address` | inet | no | managed; no application redesign |
| `otp_code` | text | yes | managed; no application redesign |
| `web_authn_session_data` | jsonb | yes | managed; no application redesign |

### auth.mfa_factors

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `id` | uuid | no | managed; no application redesign |
| `user_id` | uuid | no | managed; no application redesign |
| `friendly_name` | text | yes | managed; no application redesign |
| `factor_type` | auth.factor_type | no | managed; no application redesign |
| `status` | auth.factor_status | no | managed; no application redesign |
| `created_at` | timestamp with time zone | no | managed; no application redesign |
| `updated_at` | timestamp with time zone | no | managed; no application redesign |
| `secret` | text | yes | managed; no application redesign |
| `phone` | text | yes | managed; no application redesign |
| `last_challenged_at` | timestamp with time zone | yes | managed; no application redesign |
| `web_authn_credential` | jsonb | yes | managed; no application redesign |
| `web_authn_aaguid` | uuid | yes | managed; no application redesign |
| `last_webauthn_challenge_data` | jsonb | yes | managed; no application redesign |

### auth.oauth_authorizations

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `id` | uuid | no | managed; no application redesign |
| `authorization_id` | text | no | managed; no application redesign |
| `client_id` | uuid | no | managed; no application redesign |
| `user_id` | uuid | yes | managed; no application redesign |
| `redirect_uri` | text | no | managed; no application redesign |
| `scope` | text | no | managed; no application redesign |
| `state` | text | yes | managed; no application redesign |
| `resource` | text | yes | managed; no application redesign |
| `code_challenge` | text | yes | managed; no application redesign |
| `code_challenge_method` | auth.code_challenge_method | yes | managed; no application redesign |
| `response_type` | auth.oauth_response_type | no | managed; no application redesign |
| `status` | auth.oauth_authorization_status | no | managed; no application redesign |
| `authorization_code` | text | yes | managed; no application redesign |
| `created_at` | timestamp with time zone | no | managed; no application redesign |
| `expires_at` | timestamp with time zone | no | managed; no application redesign |
| `approved_at` | timestamp with time zone | yes | managed; no application redesign |
| `nonce` | text | yes | managed; no application redesign |

### auth.oauth_client_states

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `id` | uuid | no | managed; no application redesign |
| `provider_type` | text | no | managed; no application redesign |
| `code_verifier` | text | yes | managed; no application redesign |
| `created_at` | timestamp with time zone | no | managed; no application redesign |

### auth.oauth_clients

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `id` | uuid | no | managed; no application redesign |
| `client_secret_hash` | text | yes | managed; no application redesign |
| `registration_type` | auth.oauth_registration_type | no | managed; no application redesign |
| `redirect_uris` | text | no | managed; no application redesign |
| `grant_types` | text | no | managed; no application redesign |
| `client_name` | text | yes | managed; no application redesign |
| `client_uri` | text | yes | managed; no application redesign |
| `logo_uri` | text | yes | managed; no application redesign |
| `created_at` | timestamp with time zone | no | managed; no application redesign |
| `updated_at` | timestamp with time zone | no | managed; no application redesign |
| `deleted_at` | timestamp with time zone | yes | managed; no application redesign |
| `client_type` | auth.oauth_client_type | no | managed; no application redesign |
| `token_endpoint_auth_method` | text | no | managed; no application redesign |

### auth.oauth_consents

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `id` | uuid | no | managed; no application redesign |
| `user_id` | uuid | no | managed; no application redesign |
| `client_id` | uuid | no | managed; no application redesign |
| `scopes` | text | no | managed; no application redesign |
| `granted_at` | timestamp with time zone | no | managed; no application redesign |
| `revoked_at` | timestamp with time zone | yes | managed; no application redesign |

### auth.one_time_tokens

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `id` | uuid | no | managed; no application redesign |
| `user_id` | uuid | no | managed; no application redesign |
| `token_type` | auth.one_time_token_type | no | managed; no application redesign |
| `token_hash` | text | no | managed; no application redesign |
| `relates_to` | text | no | managed; no application redesign |
| `created_at` | timestamp without time zone | no | managed; no application redesign |
| `updated_at` | timestamp without time zone | no | managed; no application redesign |

### auth.refresh_tokens

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `instance_id` | uuid | yes | managed; no application redesign |
| `id` | bigint | no | managed; no application redesign |
| `token` | character varying(255) | yes | managed; no application redesign |
| `user_id` | character varying(255) | yes | managed; no application redesign |
| `revoked` | boolean | yes | managed; no application redesign |
| `created_at` | timestamp with time zone | yes | managed; no application redesign |
| `updated_at` | timestamp with time zone | yes | managed; no application redesign |
| `parent` | character varying(255) | yes | managed; no application redesign |
| `session_id` | uuid | yes | managed; no application redesign |

### auth.saml_providers

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `id` | uuid | no | managed; no application redesign |
| `sso_provider_id` | uuid | no | managed; no application redesign |
| `entity_id` | text | no | managed; no application redesign |
| `metadata_xml` | text | no | managed; no application redesign |
| `metadata_url` | text | yes | managed; no application redesign |
| `attribute_mapping` | jsonb | yes | managed; no application redesign |
| `created_at` | timestamp with time zone | yes | managed; no application redesign |
| `updated_at` | timestamp with time zone | yes | managed; no application redesign |
| `name_id_format` | text | yes | managed; no application redesign |

### auth.saml_relay_states

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `id` | uuid | no | managed; no application redesign |
| `sso_provider_id` | uuid | no | managed; no application redesign |
| `request_id` | text | no | managed; no application redesign |
| `for_email` | text | yes | managed; no application redesign |
| `redirect_to` | text | yes | managed; no application redesign |
| `created_at` | timestamp with time zone | yes | managed; no application redesign |
| `updated_at` | timestamp with time zone | yes | managed; no application redesign |
| `flow_state_id` | uuid | yes | managed; no application redesign |

### auth.schema_migrations

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `version` | character varying(255) | no | managed; no application redesign |

### auth.sessions

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `id` | uuid | no | managed; no application redesign |
| `user_id` | uuid | no | managed; no application redesign |
| `created_at` | timestamp with time zone | yes | managed; no application redesign |
| `updated_at` | timestamp with time zone | yes | managed; no application redesign |
| `factor_id` | uuid | yes | managed; no application redesign |
| `aal` | auth.aal_level | yes | managed; no application redesign |
| `not_after` | timestamp with time zone | yes | managed; no application redesign |
| `refreshed_at` | timestamp without time zone | yes | managed; no application redesign |
| `user_agent` | text | yes | managed; no application redesign |
| `ip` | inet | yes | managed; no application redesign |
| `tag` | text | yes | managed; no application redesign |
| `oauth_client_id` | uuid | yes | managed; no application redesign |
| `refresh_token_hmac_key` | text | yes | managed; no application redesign |
| `refresh_token_counter` | bigint | yes | managed; no application redesign |
| `scopes` | text | yes | managed; no application redesign |

### auth.sso_domains

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `id` | uuid | no | managed; no application redesign |
| `sso_provider_id` | uuid | no | managed; no application redesign |
| `domain` | text | no | managed; no application redesign |
| `created_at` | timestamp with time zone | yes | managed; no application redesign |
| `updated_at` | timestamp with time zone | yes | managed; no application redesign |

### auth.sso_providers

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `id` | uuid | no | managed; no application redesign |
| `resource_id` | text | yes | managed; no application redesign |
| `created_at` | timestamp with time zone | yes | managed; no application redesign |
| `updated_at` | timestamp with time zone | yes | managed; no application redesign |
| `disabled` | boolean | yes | managed; no application redesign |

### auth.users

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `instance_id` | uuid | yes | managed; no application redesign |
| `id` | uuid | no | managed; no application redesign |
| `aud` | character varying(255) | yes | managed; no application redesign |
| `role` | character varying(255) | yes | managed; no application redesign |
| `email` | character varying(255) | yes | managed; no application redesign |
| `encrypted_password` | character varying(255) | yes | managed; no application redesign |
| `email_confirmed_at` | timestamp with time zone | yes | managed; no application redesign |
| `invited_at` | timestamp with time zone | yes | managed; no application redesign |
| `confirmation_token` | character varying(255) | yes | managed; no application redesign |
| `confirmation_sent_at` | timestamp with time zone | yes | managed; no application redesign |
| `recovery_token` | character varying(255) | yes | managed; no application redesign |
| `recovery_sent_at` | timestamp with time zone | yes | managed; no application redesign |
| `email_change_token_new` | character varying(255) | yes | managed; no application redesign |
| `email_change` | character varying(255) | yes | managed; no application redesign |
| `email_change_sent_at` | timestamp with time zone | yes | managed; no application redesign |
| `last_sign_in_at` | timestamp with time zone | yes | managed; no application redesign |
| `raw_app_meta_data` | jsonb | yes | managed; no application redesign |
| `raw_user_meta_data` | jsonb | yes | managed; no application redesign |
| `is_super_admin` | boolean | yes | managed; no application redesign |
| `created_at` | timestamp with time zone | yes | managed; no application redesign |
| `updated_at` | timestamp with time zone | yes | managed; no application redesign |
| `phone` | text | yes | managed; no application redesign |
| `phone_confirmed_at` | timestamp with time zone | yes | managed; no application redesign |
| `phone_change` | text | yes | managed; no application redesign |
| `phone_change_token` | character varying(255) | yes | managed; no application redesign |
| `phone_change_sent_at` | timestamp with time zone | yes | managed; no application redesign |
| `confirmed_at` | timestamp with time zone | yes | managed; no application redesign |
| `email_change_token_current` | character varying(255) | yes | managed; no application redesign |
| `email_change_confirm_status` | smallint | yes | managed; no application redesign |
| `banned_until` | timestamp with time zone | yes | managed; no application redesign |
| `reauthentication_token` | character varying(255) | yes | managed; no application redesign |
| `reauthentication_sent_at` | timestamp with time zone | yes | managed; no application redesign |
| `is_sso_user` | boolean | no | managed; no application redesign |
| `deleted_at` | timestamp with time zone | yes | managed; no application redesign |
| `is_anonymous` | boolean | no | managed; no application redesign |

### auth.webauthn_challenges

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `id` | uuid | no | managed; no application redesign |
| `user_id` | uuid | yes | managed; no application redesign |
| `challenge_type` | text | no | managed; no application redesign |
| `session_data` | jsonb | no | managed; no application redesign |
| `created_at` | timestamp with time zone | no | managed; no application redesign |
| `expires_at` | timestamp with time zone | no | managed; no application redesign |

### auth.webauthn_credentials

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `id` | uuid | no | managed; no application redesign |
| `user_id` | uuid | no | managed; no application redesign |
| `credential_id` | bytea | no | managed; no application redesign |
| `public_key` | bytea | no | managed; no application redesign |
| `attestation_type` | text | no | managed; no application redesign |
| `aaguid` | uuid | yes | managed; no application redesign |
| `sign_count` | bigint | no | managed; no application redesign |
| `transports` | jsonb | no | managed; no application redesign |
| `backup_eligible` | boolean | no | managed; no application redesign |
| `backed_up` | boolean | no | managed; no application redesign |
| `friendly_name` | text | no | managed; no application redesign |
| `created_at` | timestamp with time zone | no | managed; no application redesign |
| `updated_at` | timestamp with time zone | no | managed; no application redesign |
| `last_used_at` | timestamp with time zone | yes | managed; no application redesign |

### extensions.pg_stat_statements

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `userid` | oid | yes | managed; no application redesign |
| `dbid` | oid | yes | managed; no application redesign |
| `toplevel` | boolean | yes | managed; no application redesign |
| `queryid` | bigint | yes | managed; no application redesign |
| `query` | text | yes | managed; no application redesign |
| `plans` | bigint | yes | managed; no application redesign |
| `total_plan_time` | double precision | yes | managed; no application redesign |
| `min_plan_time` | double precision | yes | managed; no application redesign |
| `max_plan_time` | double precision | yes | managed; no application redesign |
| `mean_plan_time` | double precision | yes | managed; no application redesign |
| `stddev_plan_time` | double precision | yes | managed; no application redesign |
| `calls` | bigint | yes | managed; no application redesign |
| `total_exec_time` | double precision | yes | managed; no application redesign |
| `min_exec_time` | double precision | yes | managed; no application redesign |
| `max_exec_time` | double precision | yes | managed; no application redesign |
| `mean_exec_time` | double precision | yes | managed; no application redesign |
| `stddev_exec_time` | double precision | yes | managed; no application redesign |
| `rows` | bigint | yes | managed; no application redesign |
| `shared_blks_hit` | bigint | yes | managed; no application redesign |
| `shared_blks_read` | bigint | yes | managed; no application redesign |
| `shared_blks_dirtied` | bigint | yes | managed; no application redesign |
| `shared_blks_written` | bigint | yes | managed; no application redesign |
| `local_blks_hit` | bigint | yes | managed; no application redesign |
| `local_blks_read` | bigint | yes | managed; no application redesign |
| `local_blks_dirtied` | bigint | yes | managed; no application redesign |
| `local_blks_written` | bigint | yes | managed; no application redesign |
| `temp_blks_read` | bigint | yes | managed; no application redesign |
| `temp_blks_written` | bigint | yes | managed; no application redesign |
| `shared_blk_read_time` | double precision | yes | managed; no application redesign |
| `shared_blk_write_time` | double precision | yes | managed; no application redesign |
| `local_blk_read_time` | double precision | yes | managed; no application redesign |
| `local_blk_write_time` | double precision | yes | managed; no application redesign |
| `temp_blk_read_time` | double precision | yes | managed; no application redesign |
| `temp_blk_write_time` | double precision | yes | managed; no application redesign |
| `wal_records` | bigint | yes | managed; no application redesign |
| `wal_fpi` | bigint | yes | managed; no application redesign |
| `wal_bytes` | numeric | yes | managed; no application redesign |
| `jit_functions` | bigint | yes | managed; no application redesign |
| `jit_generation_time` | double precision | yes | managed; no application redesign |
| `jit_inlining_count` | bigint | yes | managed; no application redesign |
| `jit_inlining_time` | double precision | yes | managed; no application redesign |
| `jit_optimization_count` | bigint | yes | managed; no application redesign |
| `jit_optimization_time` | double precision | yes | managed; no application redesign |
| `jit_emission_count` | bigint | yes | managed; no application redesign |
| `jit_emission_time` | double precision | yes | managed; no application redesign |
| `jit_deform_count` | bigint | yes | managed; no application redesign |
| `jit_deform_time` | double precision | yes | managed; no application redesign |
| `stats_since` | timestamp with time zone | yes | managed; no application redesign |
| `minmax_stats_since` | timestamp with time zone | yes | managed; no application redesign |

### extensions.pg_stat_statements_info

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `dealloc` | bigint | yes | managed; no application redesign |
| `stats_reset` | timestamp with time zone | yes | managed; no application redesign |

### ingest.athlete_aliases

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `athlete_alias_id` | bigint | no | review pending |
| `source` | text | no | review pending |
| `source_athlete_key` | text | no | review pending |
| `source_athlete_name` | text | yes | review pending |
| `source_gender` | text | no | review pending |
| `target_athlete_id` | bigint | no | review pending |
| `match_method` | text | no | review pending |
| `status` | text | no | review pending |
| `notes` | text | yes | review pending |
| `verified_at` | timestamp with time zone | no | review pending |
| `created_at` | timestamp with time zone | no | review pending |
| `updated_at` | timestamp with time zone | no | review pending |

### ingest.event_recovery_queue

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `job_id` | bigint | no | review pending |
| `scope_key` | text | no | review pending |
| `meet_id` | integer | no | review pending |
| `event_type_id` | integer | no | review pending |
| `event_code` | text | no | review pending |
| `status` | text | no | review pending |
| `priority` | integer | no | review pending |
| `individual_fact_count` | bigint | no | review pending |
| `parent_fact_count` | bigint | no | review pending |
| `numeric_parent_fact_count` | bigint | no | review pending |
| `leg_fact_count` | bigint | no | review pending |
| `source_candidates` | jsonb | no | review pending |
| `attempts` | integer | no | review pending |
| `next_attempt_at` | timestamp with time zone | no | review pending |
| `lease_token` | uuid | yes | review pending |
| `leased_until` | timestamp with time zone | yes | review pending |
| `last_run_id` | uuid | yes | review pending |
| `last_source` | text | yes | review pending |
| `last_source_status` | text | yes | review pending |
| `last_error` | text | yes | review pending |
| `last_parent_count` | integer | no | review pending |
| `last_numeric_parent_count` | integer | no | review pending |
| `last_leg_count` | integer | no | review pending |
| `created_at` | timestamp with time zone | no | review pending |
| `updated_at` | timestamp with time zone | no | review pending |

### ingest.fact_cleanup_archive

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `archive_id` | bigint | no | review pending |
| `operation_key` | text | no | review pending |
| `source_table` | text | no | review pending |
| `source_pk` | text | no | review pending |
| `row_data` | jsonb | no | review pending |
| `archived_at` | timestamp with time zone | no | review pending |

### ingest.observations

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `observation_id` | bigint | no | review pending |
| `run_id` | uuid | no | review pending |
| `source_record_id` | bigint | no | review pending |
| `source` | text | no | review pending |
| `entity_type` | text | no | review pending |
| `target_meet_id` | integer | yes | review pending |
| `target_athlete_id` | bigint | yes | review pending |
| `target_team_id` | bigint | yes | review pending |
| `event_type_id` | integer | yes | review pending |
| `raw_event_name` | text | yes | review pending |
| `measure` | text | yes | review pending |
| `mark_raw` | text | yes | review pending |
| `mark_seconds` | double precision | yes | review pending |
| `mark_meters` | double precision | yes | review pending |
| `points` | double precision | yes | review pending |
| `place` | integer | yes | review pending |
| `round` | text | yes | review pending |
| `result_date` | date | yes | review pending |
| `performance_key` | text | yes | review pending |
| `canonical_key` | text | yes | review pending |
| `decision` | text | no | review pending |
| `decision_reason` | text | yes | review pending |
| `confidence` | numeric(5,4) | yes | review pending |
| `canonical_result_id` | bigint | yes | review pending |
| `canonical_relay_id` | integer | yes | review pending |
| `validation_errors` | jsonb | no | review pending |
| `created_at` | timestamp with time zone | no | review pending |

### ingest.quarantine

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `quarantine_id` | bigint | no | review pending |
| `observation_id` | bigint | no | review pending |
| `reason_code` | text | no | review pending |
| `status` | text | no | review pending |
| `resolution_note` | text | yes | review pending |
| `resolved_at` | timestamp with time zone | yes | review pending |
| `created_at` | timestamp with time zone | no | review pending |

### ingest.recovery_queue

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `queue_id` | bigint | no | review pending |
| `scope_key` | text | no | review pending |
| `meet_id` | integer | no | review pending |
| `coverage_status` | text | no | review pending |
| `needs_individual` | boolean | no | review pending |
| `needs_relays` | boolean | no | review pending |
| `individual_fact_count` | bigint | no | review pending |
| `relay_fact_count` | bigint | no | review pending |
| `source_candidates` | jsonb | no | review pending |
| `priority` | integer | no | review pending |
| `status` | text | no | review pending |
| `attempts` | integer | no | review pending |
| `last_run_id` | uuid | yes | review pending |
| `last_error` | text | yes | review pending |
| `created_at` | timestamp with time zone | no | review pending |
| `updated_at` | timestamp with time zone | no | review pending |
| `relay_coverage_status` | text | no | review pending |
| `relay_checked_at` | timestamp with time zone | yes | review pending |
| `relay_probe_run_id` | uuid | yes | review pending |
| `quarantined_observation_count` | integer | no | review pending |
| `canonical_meet_id` | integer | yes | review pending |
| `canonical_match_method` | text | yes | review pending |
| `canonical_match_notes` | text | yes | review pending |
| `canonical_match_evidence` | jsonb | no | review pending |

### ingest.runs

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `run_id` | uuid | no | review pending |
| `source` | text | no | review pending |
| `mode` | text | no | review pending |
| `status` | text | no | review pending |
| `scope` | jsonb | no | review pending |
| `parser_version` | text | no | review pending |
| `code_revision` | text | yes | review pending |
| `started_at` | timestamp with time zone | yes | review pending |
| `finished_at` | timestamp with time zone | yes | review pending |
| `metrics` | jsonb | no | review pending |
| `error_message` | text | yes | review pending |
| `created_at` | timestamp with time zone | no | review pending |

### ingest.source_links

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `source_record_id` | bigint | no | review pending |
| `entity_type` | text | no | review pending |
| `result_id` | bigint | yes | review pending |
| `relay_result_id` | integer | yes | review pending |
| `link_status` | text | no | review pending |
| `first_linked_at` | timestamp with time zone | yes | review pending |
| `last_seen_at` | timestamp with time zone | no | review pending |

### ingest.source_records

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `source_record_id` | bigint | no | review pending |
| `source` | text | no | review pending |
| `source_record_key` | text | no | review pending |
| `source_meet_key` | text | yes | review pending |
| `source_event_key` | text | yes | review pending |
| `source_url` | text | yes | review pending |
| `payload_hash` | text | yes | review pending |
| `payload` | jsonb | no | review pending |
| `first_seen_at` | timestamp with time zone | no | review pending |
| `last_seen_at` | timestamp with time zone | no | review pending |

### ingest.team_aliases

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `team_alias_id` | bigint | no | review pending |
| `source` | text | no | review pending |
| `source_team_key` | text | no | review pending |
| `source_team_name` | text | yes | review pending |
| `source_gender` | text | no | review pending |
| `normalized_source_team_key` | text | no | review pending |
| `normalized_source_team_name` | text | yes | review pending |
| `team_id` | bigint | no | review pending |
| `match_method` | text | no | review pending |
| `status` | text | no | review pending |
| `notes` | text | yes | review pending |
| `verified_at` | timestamp with time zone | no | review pending |
| `created_at` | timestamp with time zone | no | review pending |
| `updated_at` | timestamp with time zone | no | review pending |

### public.athlete_prs

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `id` | integer | no | review pending |
| `athlete_id` | integer | no | review pending |
| `event_name` | character varying(100) | no | review pending |
| `mark_raw` | character varying(50) | no | review pending |
| `mark_seconds` | numeric(10,3) | yes | review pending |
| `mark_meters` | numeric(10,3) | yes | review pending |
| `set_at` | date | yes | review pending |
| `meet_name` | character varying(255) | yes | review pending |
| `season` | character varying(20) | yes | review pending |
| `created_at` | timestamp with time zone | yes | review pending |
| `updated_at` | timestamp with time zone | yes | review pending |

### public.athlete_team_seasons

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `ats_id` | bigint | no | review pending |
| `athlete_id` | bigint | no | review pending |
| `team_id` | bigint | no | review pending |
| `season_code` | text | no | review pending |
| `year_in_school` | text | yes | review pending |
| `jersey_number` | text | yes | review pending |
| `status` | text | yes | review pending |
| `is_redshirt` | boolean | yes | review pending |
| `created_at` | timestamp with time zone | yes | review pending |

### public.athletes

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `athlete_id` | bigint | no | review pending |
| `school_id` | bigint | no | review pending |
| `full_name` | text | no | review pending |
| `first_name` | text | yes | review pending |
| `last_name` | text | yes | review pending |
| `gender` | text | yes | review pending |
| `class_year` | text | yes | review pending |
| `grad_year` | integer | yes | review pending |
| `primary_events` | text | yes | review pending |
| `hometown` | text | yes | review pending |
| `high_school` | text | yes | review pending |
| `tfrrs_athlete_id` | text | yes | review pending |
| `tfrrs_profile_url` | text | yes | review pending |
| `athletic_net_url` | text | yes | review pending |
| `profile_image_url` | text | yes | review pending |
| `bio` | text | yes | review pending |
| `is_active` | boolean | yes | review pending |
| `created_at` | timestamp with time zone | yes | review pending |
| `updated_at` | timestamp with time zone | yes | review pending |

### public.conference_memberships

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `membership_id` | bigint | no | review pending |
| `school_id` | bigint | no | review pending |
| `conference_id` | bigint | no | review pending |
| `start_year` | integer | yes | review pending |
| `end_year` | integer | yes | review pending |
| `created_at` | timestamp with time zone | yes | review pending |

### public.conferences

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `conference_id` | bigint | no | review pending |
| `name` | text | no | review pending |
| `abbreviation` | text | yes | review pending |
| `division` | text | yes | review pending |
| `region` | text | yes | review pending |
| `website` | text | yes | review pending |
| `created_at` | timestamp with time zone | yes | review pending |
| `updated_at` | timestamp with time zone | yes | review pending |
| `division_id` | integer | yes | review pending |

### public.divisions

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `division_id` | integer | no | review pending |
| `code` | text | no | review pending |
| `display_name` | text | no | review pending |
| `governing_body` | text | no | review pending |
| `sort_order` | integer | no | review pending |

### public.event_aliases

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `raw_name` | text | no | review pending |
| `event_type_id` | integer | no | review pending |

### public.event_types

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `event_type_id` | integer | no | review pending |
| `code` | text | no | review pending |
| `category` | text | yes | review pending |
| `measure` | text | yes | review pending |
| `environment_scope` | text | yes | review pending |

### public.external_ids

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `external_id` | bigint | no | review pending |
| `school_id` | bigint | yes | review pending |
| `athlete_id` | bigint | yes | review pending |
| `team_id` | bigint | yes | review pending |
| `conference_id` | bigint | yes | review pending |
| `source` | text | no | review pending |
| `external_name` | text | yes | review pending |
| `external_key` | text | yes | review pending |
| `external_url` | text | yes | review pending |
| `verified` | boolean | yes | review pending |
| `created_at` | timestamp with time zone | yes | review pending |
| `updated_at` | timestamp with time zone | yes | review pending |

### public.live_results

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `live_result_id` | bigint | no | review pending |
| `meet_url` | text | no | review pending |
| `meet_name` | text | yes | review pending |
| `event_name` | text | no | review pending |
| `participant_name` | text | no | review pending |
| `place` | integer | yes | review pending |
| `mark_raw` | text | no | review pending |
| `mark_seconds` | double precision | yes | review pending |
| `splits` | text[] | yes | review pending |
| `scraped_at` | timestamp with time zone | no | review pending |
| `date` | date | yes | review pending |
| `round` | text | yes | review pending |
| `is_processed` | boolean | yes | review pending |
| `athlete_id` | bigint | yes | review pending |
| `team_id` | bigint | yes | review pending |
| `created_at` | timestamp with time zone | yes | review pending |
| `updated_at` | timestamp with time zone | yes | review pending |
| `team_name` | text | yes | review pending |
| `is_final` | boolean | yes | review pending |
| `meet_id` | bigint | yes | review pending |
| `result_type` | text | yes | review pending |

### public.meets

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `meet_id` | integer | no | review pending |
| `name` | text | no | review pending |
| `date` | date | no | review pending |
| `location` | text | yes | review pending |
| `meet_url` | text | yes | review pending |
| `status` | text | yes | review pending |
| `level` | text | yes | review pending |
| `season` | text | yes | review pending |
| `created_at` | timestamp with time zone | no | review pending |
| `updated_at` | timestamp with time zone | no | review pending |
| `timing_platform` | text | yes | review pending |
| `source_url` | text | yes | review pending |
| `tfrrs_meet_id` | text | yes | review pending |
| `end_date` | date | yes | review pending |
| `tfrrs_url` | text | yes | review pending |
| `athletic_net_results_url` | text | yes | review pending |
| `wa_results_url` | text | yes | review pending |
| `results_status` | text | yes | review pending |
| `results_last_checked_at` | timestamp with time zone | yes | review pending |
| `results_imported_at` | timestamp with time zone | yes | review pending |
| `results_error` | text | yes | review pending |
| `results_source` | text | yes | review pending |

### public.push_tokens

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `id` | uuid | no | review pending |
| `expo_push_token` | text | no | review pending |
| `platform` | text | yes | review pending |
| `created_at` | timestamp with time zone | yes | review pending |
| `is_active` | boolean | yes | review pending |

### public.regions

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `region_id` | bigint | no | review pending |
| `region_name` | text | no | review pending |
| `created_at` | timestamp with time zone | yes | review pending |
| `division_id` | integer | yes | review pending |

### public.relay_athletes

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `relay_athlete_id` | integer | no | review pending |
| `relay_result_id` | integer | yes | review pending |
| `athlete_id` | integer | yes | review pending |
| `tfrrs_athlete_id` | text | yes | review pending |
| `athlete_name` | text | yes | review pending |
| `leg_order` | integer | yes | review pending |
| `created_at` | timestamp with time zone | yes | review pending |

### public.relay_results

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `relay_result_id` | integer | no | review pending |
| `team_id` | integer | yes | review pending |
| `event_name` | text | no | review pending |
| `mark_raw` | text | yes | review pending |
| `mark_seconds` | numeric(10,2) | yes | review pending |
| `place` | integer | yes | review pending |
| `meet_name` | text | yes | review pending |
| `meet_id` | integer | yes | review pending |
| `event_id` | integer | yes | review pending |
| `date` | date | yes | review pending |
| `round` | text | yes | review pending |
| `created_at` | timestamp with time zone | yes | review pending |
| `event_type_id` | integer | yes | review pending |

### public.results

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `result_id` | bigint | no | review pending |
| `athlete_id` | bigint | no | review pending |
| `team_id` | bigint | yes | review pending |
| `event_name` | text | no | review pending |
| `mark_raw` | text | no | review pending |
| `mark_seconds` | double precision | yes | review pending |
| `mark_meters` | double precision | yes | review pending |
| `mark_feet` | text | yes | review pending |
| `wind` | text | yes | review pending |
| `round` | text | yes | review pending |
| `date` | date | yes | review pending |
| `season_code` | text | yes | review pending |
| `meet_name` | text | yes | review pending |
| `meet_location` | text | yes | review pending |
| `place` | integer | yes | review pending |
| `total_competitors` | integer | yes | review pending |
| `is_pr` | boolean | yes | review pending |
| `is_season_best` | boolean | yes | review pending |
| `created_at` | timestamp with time zone | yes | review pending |
| `meet_id` | integer | yes | review pending |
| `event_id` | integer | yes | review pending |
| `event_type_id` | integer | yes | review pending |
| `environment` | text | yes | review pending |

### public.schools

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `school_id` | bigint | no | review pending |
| `official_name` | text | no | review pending |
| `short_name` | text | yes | review pending |
| `city` | text | yes | review pending |
| `state` | text | yes | review pending |
| `division` | text | yes | review pending |
| `ncaa_region` | text | yes | review pending |
| `current_conference_id` | bigint | yes | review pending |
| `region_id` | bigint | yes | review pending |
| `is_active` | boolean | yes | review pending |
| `logo_url` | text | yes | review pending |
| `logo_file_path` | text | yes | review pending |
| `logo_source` | text | yes | review pending |
| `created_at` | timestamp with time zone | yes | review pending |
| `updated_at` | timestamp with time zone | yes | review pending |
| `division_id` | integer | yes | review pending |

### public.schools_full

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `school_id` | bigint | yes | review pending |
| `official_name` | text | yes | review pending |
| `short_name` | text | yes | review pending |
| `city` | text | yes | review pending |
| `state` | text | yes | review pending |
| `division` | text | yes | review pending |
| `region_name` | text | yes | review pending |
| `conference_name` | text | yes | review pending |
| `conference_abbrev` | text | yes | review pending |
| `logo_url` | text | yes | review pending |
| `is_active` | boolean | yes | review pending |

### public.teams

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `team_id` | bigint | no | review pending |
| `school_id` | bigint | no | review pending |
| `gender` | text | no | review pending |
| `tfrrs_team_url` | text | yes | review pending |
| `athletic_net_url` | text | yes | review pending |
| `coach_name` | text | yes | review pending |
| `is_active` | boolean | yes | review pending |
| `created_at` | timestamp with time zone | yes | review pending |
| `updated_at` | timestamp with time zone | yes | review pending |
| `team_name` | text | yes | review pending |
| `team_type` | text | yes | review pending |

### public.teams_summary

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `team_id` | bigint | yes | review pending |
| `school_name` | text | yes | review pending |
| `division` | text | yes | review pending |
| `gender` | text | yes | review pending |
| `region_name` | text | yes | review pending |
| `conference_name` | text | yes | review pending |
| `athlete_count` | bigint | yes | review pending |

### public.unmapped_events

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `raw_name` | text | no | review pending |
| `first_seen` | timestamp with time zone | yes | review pending |
| `seen_count` | integer | yes | review pending |

### public.unprocessed_live_results

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `live_result_id` | bigint | yes | review pending |
| `meet_url` | text | yes | review pending |
| `meet_name` | text | yes | review pending |
| `event_name` | text | yes | review pending |
| `participant_name` | text | yes | review pending |
| `place` | integer | yes | review pending |
| `mark_raw` | text | yes | review pending |
| `mark_seconds` | double precision | yes | review pending |
| `splits` | text[] | yes | review pending |
| `scraped_at` | timestamp with time zone | yes | review pending |
| `date` | date | yes | review pending |
| `round` | text | yes | review pending |
| `is_processed` | boolean | yes | review pending |
| `athlete_id` | bigint | yes | review pending |
| `team_id` | bigint | yes | review pending |
| `created_at` | timestamp with time zone | yes | review pending |
| `updated_at` | timestamp with time zone | yes | review pending |

### public.v_athlete_prs

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `athlete_id` | bigint | yes | review pending |
| `event_type_id` | integer | yes | review pending |
| `environment` | text | yes | review pending |
| `mark_raw` | text | yes | review pending |
| `mark_seconds` | double precision | yes | review pending |
| `mark_meters` | double precision | yes | review pending |
| `mark_points` | numeric | yes | review pending |
| `achieved_on` | date | yes | review pending |
| `achieved_at_meet_id` | integer | yes | review pending |
| `source_result_id` | bigint | yes | review pending |

### public.waitlist

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `id` | integer | no | review pending |
| `email` | character varying(255) | no | review pending |
| `feature` | character varying(100) | yes | review pending |
| `created_at` | timestamp with time zone | yes | review pending |

### realtime.messages

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `topic` | text | no | managed; no application redesign |
| `extension` | text | no | managed; no application redesign |
| `payload` | jsonb | yes | managed; no application redesign |
| `event` | text | yes | managed; no application redesign |
| `private` | boolean | yes | managed; no application redesign |
| `updated_at` | timestamp without time zone | no | managed; no application redesign |
| `inserted_at` | timestamp without time zone | no | managed; no application redesign |
| `id` | uuid | no | managed; no application redesign |
| `binary_payload` | bytea | yes | managed; no application redesign |
| `skip_broadcast` | boolean | no | managed; no application redesign |

### realtime.schema_migrations

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `version` | bigint | no | managed; no application redesign |
| `inserted_at` | timestamp(0) without time zone | yes | managed; no application redesign |

### realtime.subscription

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `id` | bigint | no | managed; no application redesign |
| `subscription_id` | uuid | no | managed; no application redesign |
| `entity` | regclass | no | managed; no application redesign |
| `filters` | realtime.user_defined_filter[] | no | managed; no application redesign |
| `claims` | jsonb | no | managed; no application redesign |
| `claims_role` | regrole | no | managed; no application redesign |
| `created_at` | timestamp without time zone | no | managed; no application redesign |
| `action_filter` | text | yes | managed; no application redesign |
| `selected_columns` | text[] | yes | managed; no application redesign |

### storage.buckets

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `id` | text | no | managed; no application redesign |
| `name` | text | no | managed; no application redesign |
| `owner` | uuid | yes | managed; no application redesign |
| `created_at` | timestamp with time zone | yes | managed; no application redesign |
| `updated_at` | timestamp with time zone | yes | managed; no application redesign |
| `public` | boolean | yes | managed; no application redesign |
| `avif_autodetection` | boolean | yes | managed; no application redesign |
| `file_size_limit` | bigint | yes | managed; no application redesign |
| `allowed_mime_types` | text[] | yes | managed; no application redesign |
| `owner_id` | text | yes | managed; no application redesign |
| `type` | storage.buckettype | no | managed; no application redesign |
| `versioning_status` | text | no | managed; no application redesign |

### storage.buckets_analytics

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `name` | text | no | managed; no application redesign |
| `type` | storage.buckettype | no | managed; no application redesign |
| `format` | text | no | managed; no application redesign |
| `created_at` | timestamp with time zone | no | managed; no application redesign |
| `updated_at` | timestamp with time zone | no | managed; no application redesign |
| `id` | uuid | no | managed; no application redesign |
| `deleted_at` | timestamp with time zone | yes | managed; no application redesign |

### storage.buckets_vectors

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `id` | text | no | managed; no application redesign |
| `type` | storage.buckettype | no | managed; no application redesign |
| `created_at` | timestamp with time zone | no | managed; no application redesign |
| `updated_at` | timestamp with time zone | no | managed; no application redesign |

### storage.migrations

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `id` | integer | no | managed; no application redesign |
| `name` | character varying(100) | no | managed; no application redesign |
| `hash` | character varying(40) | no | managed; no application redesign |
| `executed_at` | timestamp without time zone | yes | managed; no application redesign |

### storage.objects

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `id` | uuid | no | managed; no application redesign |
| `bucket_id` | text | yes | managed; no application redesign |
| `name` | text | yes | managed; no application redesign |
| `owner` | uuid | yes | managed; no application redesign |
| `created_at` | timestamp with time zone | yes | managed; no application redesign |
| `updated_at` | timestamp with time zone | yes | managed; no application redesign |
| `last_accessed_at` | timestamp with time zone | yes | managed; no application redesign |
| `metadata` | jsonb | yes | managed; no application redesign |
| `path_tokens` | text[] | yes | managed; no application redesign |
| `version` | text | yes | managed; no application redesign |
| `owner_id` | text | yes | managed; no application redesign |
| `user_metadata` | jsonb | yes | managed; no application redesign |
| `archived_at` | timestamp with time zone | yes | managed; no application redesign |
| `is_delete_marker` | boolean | no | managed; no application redesign |
| `is_versioned` | boolean | no | managed; no application redesign |

### storage.s3_multipart_uploads

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `id` | text | no | managed; no application redesign |
| `in_progress_size` | bigint | no | managed; no application redesign |
| `upload_signature` | text | no | managed; no application redesign |
| `bucket_id` | text | no | managed; no application redesign |
| `key` | text | no | managed; no application redesign |
| `version` | text | no | managed; no application redesign |
| `owner_id` | text | yes | managed; no application redesign |
| `created_at` | timestamp with time zone | no | managed; no application redesign |
| `user_metadata` | jsonb | yes | managed; no application redesign |
| `metadata` | jsonb | yes | managed; no application redesign |

### storage.s3_multipart_uploads_parts

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `id` | uuid | no | managed; no application redesign |
| `upload_id` | text | no | managed; no application redesign |
| `size` | bigint | no | managed; no application redesign |
| `part_number` | integer | no | managed; no application redesign |
| `bucket_id` | text | no | managed; no application redesign |
| `key` | text | no | managed; no application redesign |
| `etag` | text | no | managed; no application redesign |
| `owner_id` | text | yes | managed; no application redesign |
| `version` | text | no | managed; no application redesign |
| `created_at` | timestamp with time zone | no | managed; no application redesign |

### storage.vector_indexes

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `id` | text | no | managed; no application redesign |
| `name` | text | no | managed; no application redesign |
| `bucket_id` | text | no | managed; no application redesign |
| `data_type` | text | no | managed; no application redesign |
| `dimension` | integer | no | managed; no application redesign |
| `distance_metric` | text | no | managed; no application redesign |
| `metadata_configuration` | jsonb | yes | managed; no application redesign |
| `created_at` | timestamp with time zone | no | managed; no application redesign |
| `updated_at` | timestamp with time zone | no | managed; no application redesign |

### supabase_migrations.schema_migrations

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `version` | text | no | managed; no application redesign |
| `statements` | text[] | yes | managed; no application redesign |
| `name` | text | yes | managed; no application redesign |
| `created_by` | text | yes | managed; no application redesign |
| `idempotency_key` | text | yes | managed; no application redesign |
| `rollback` | text[] | yes | managed; no application redesign |

### vault.decrypted_secrets

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `id` | uuid | yes | managed; no application redesign |
| `name` | text | yes | managed; no application redesign |
| `description` | text | yes | managed; no application redesign |
| `secret` | text | yes | managed; no application redesign |
| `decrypted_secret` | text | yes | managed; no application redesign |
| `key_id` | uuid | yes | managed; no application redesign |
| `nonce` | bytea | yes | managed; no application redesign |
| `created_at` | timestamp with time zone | yes | managed; no application redesign |
| `updated_at` | timestamp with time zone | yes | managed; no application redesign |

### vault.secrets

| Column | Type | Nullable | Review status |
| --- | --- | --- | --- |
| `id` | uuid | no | managed; no application redesign |
| `name` | text | yes | managed; no application redesign |
| `description` | text | no | managed; no application redesign |
| `secret` | text | no | managed; no application redesign |
| `key_id` | uuid | yes | managed; no application redesign |
| `nonce` | bytea | yes | managed; no application redesign |
| `created_at` | timestamp with time zone | no | managed; no application redesign |
| `updated_at` | timestamp with time zone | no | managed; no application redesign |

## Next implementation order

1. Reconcile migration files with the two known live migration versions; verify statement equivalence before changing filenames or ledger metadata.
2. Close column contracts for the four public views and their underlying fields, including security, active consumers, and compatibility.
3. Close reference and affiliation columns, then meet/event/result columns, then ingestion lifecycle columns. Ambiguous row repairs remain separately tracked.
4. For each proposed schema change, identify active readers/writers and prove preservation and rollback before applying it.

## Coverage correction

The previous 74-table total omitted `realtime.messages`, a partitioned table. This is an inventory-query omission, not evidence that a new table was added. The live inventory here contains 75 tables (including that partitioned parent) and 7 views. Historical reports retain their original dated counts.
