-- InfraLynx Chunk 30
-- MariaDB query optimization and index strategy baseline

CREATE UNIQUE INDEX `idx_sites_tenant_slug` ON `sites` (`tenant_id`, `slug`);

CREATE UNIQUE INDEX `idx_racks_site_name` ON `racks` (`site_id`, `name`);

CREATE INDEX `idx_devices_site_role_status_name` ON `devices` (`site_id`, `role`, `status`, `name`);
CREATE INDEX `idx_devices_rack_position` ON `devices` (`rack_id`, `starting_unit`);

CREATE UNIQUE INDEX `idx_prefixes_vrf_cidr` ON `prefixes` (`vrf_id`, `cidr`);
CREATE INDEX `idx_prefixes_parent_prefix` ON `prefixes` (`parent_prefix_id`, `cidr`);

CREATE INDEX `idx_ip_addresses_prefix_status_address` ON `ip_addresses` (`prefix_id`, `status`, `address`);
CREATE INDEX `idx_ip_addresses_interface_id` ON `ip_addresses` (`interface_id`);

CREATE INDEX `idx_auth_providers_enabled_default` ON `auth_providers` (`enabled`, `is_default`, `type`);
CREATE INDEX `idx_sessions_user_expires_at` ON `sessions` (`user_id`, `expires_at`);

CREATE INDEX `idx_role_assignments_user_scope` ON `role_assignments` (`user_id`, `scope_type`, `scope_id`);
CREATE INDEX `idx_provider_role_mappings_provider_claim` ON `provider_role_mappings` (`provider_id`, `claim_type`, `claim_key`, `claim_value`);

CREATE INDEX `idx_audit_timestamp_action` ON `audit_logs` (`timestamp`, `action`);
CREATE INDEX `idx_jobs_status_created_at` ON `jobs` (`status`, `created_at`);
