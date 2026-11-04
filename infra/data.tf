resource "google_sql_database_instance" "tamery" {
  name                = "tamery"
  region              = local.region
  database_version    = "POSTGRES_18"
  deletion_protection = true

  settings {
    tier                        = "db-custom-1-3840"
    edition                     = "ENTERPRISE"
    availability_type           = "ZONAL"
    disk_type                   = "PD_SSD"
    disk_autoresize             = true
    deletion_protection_enabled = true
    enable_dataplex_integration = true

    backup_configuration {
      enabled                        = true
      start_time                     = "02:00"
      point_in_time_recovery_enabled = true
      transaction_log_retention_days = 7

      backup_retention_settings {
        retained_backups = 14
        retention_unit   = "COUNT"
      }
    }

    ip_configuration {
      ipv4_enabled    = true
      private_network = google_compute_network.tamery.id
      ssl_mode        = "ENCRYPTED_ONLY"

      dynamic "authorized_networks" {
        for_each = var.sql_authorized_networks
        content {
          name  = authorized_networks.key
          value = authorized_networks.value
        }
      }
    }

    maintenance_window {
      day  = 7
      hour = 3
    }
  }

  lifecycle {
    prevent_destroy = true
    # Autoresize grows the disk, and it cannot shrink.
    ignore_changes = [settings[0].disk_size]
  }

  depends_on = [google_service_networking_connection.private_services]
}

resource "google_sql_database" "tamery" {
  name     = "tamery"
  instance = google_sql_database_instance.tamery.name
}

# Passwords stay out of the state: they live in Secret Manager, set outside OpenTofu.
resource "google_sql_user" "this" {
  for_each = toset(["postgres", "tamery_app"])

  name     = each.value
  instance = google_sql_database_instance.tamery.name

  lifecycle {
    ignore_changes = [password]
  }
}

resource "google_redis_instance" "tamery" {
  name                    = "tamery"
  region                  = local.region
  tier                    = "BASIC"
  memory_size_gb          = 1
  redis_version           = "REDIS_7_2"
  authorized_network      = google_compute_network.tamery.id
  connect_mode            = "PRIVATE_SERVICE_ACCESS"
  auth_enabled            = true
  transit_encryption_mode = "DISABLED"

  lifecycle {
    prevent_destroy = true
    # The API does not return it, and a diff here replaces the instance.
    ignore_changes = [reserved_ip_range]
  }

  depends_on = [google_service_networking_connection.private_services]
}
