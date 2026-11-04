resource "google_kms_key_ring" "tamery" {
  name     = "tamery"
  location = local.region

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_kms_crypto_key" "secrets" {
  name                       = "secrets"
  key_ring                   = google_kms_key_ring.tamery.id
  purpose                    = "ENCRYPT_DECRYPT"
  destroy_scheduled_duration = "10368000s"

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_kms_crypto_key_iam_member" "api_decrypts" {
  crypto_key_id = google_kms_crypto_key.secrets.id
  role          = "roles/cloudkms.cryptoKeyDecrypter"
  member        = google_service_account.this["tamery-api"].member
}

resource "google_kms_crypto_key_iam_member" "operator_encrypts" {
  crypto_key_id = google_kms_crypto_key.secrets.id
  role          = "roles/cloudkms.cryptoKeyEncrypter"
  member        = var.operator
}

locals {
  api_secrets = [
    "ALERTS_EMAIL",
    "BETTER_AUTH_SECRET",
    "CONTEXT7_API_KEY",
    "DATABASE_URL",
    "ENCRYPTION_SECRET_WRAPPED",
    "EXA_API_KEY",
    "GITHUB_CLIENT_ID",
    "GITHUB_CLIENT_SECRET",
    "GITHUB_TOKEN",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "MIN_DESKTOP_VERSION",
    "MISTRAL_API_KEY",
    "OPENROUTER_API_KEY",
    "POSTHOG_TOKEN",
    "PROXY_SHARED_SECRET",
    "REDIS_URL",
    "RESEND_API_KEY",
    "STRIPE_ANNUAL_PRICE_ID",
    "STRIPE_MONTH_PRICE_ID",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "TODESKTOP_WEBHOOK_SECRET",
    "USER_KEY_SECRET_WRAPPED",
  ]

  secret_access = merge(
    { for name in local.api_secrets : "tamery-api/${name}" => { account = "tamery-api", secret = name } },
    {
      "tamery-proxy/PROXY_SHARED_SECRET" = { account = "tamery-proxy", secret = "PROXY_SHARED_SECRET" }
      "tamery-jobs/DATABASE_URL"         = { account = "tamery-jobs", secret = "DATABASE_URL" }
    },
  )
}

# Containers only: secret values are added with `gcloud secrets versions add`, so they stay out of the state.
resource "google_secret_manager_secret" "this" {
  for_each = toset(concat(local.api_secrets, ["sql-postgres-password", "sql-tamery-app-password"]))

  secret_id = each.value

  replication {
    user_managed {
      replicas {
        location = local.region
      }
    }
  }
}

resource "google_secret_manager_secret_iam_member" "access" {
  for_each = local.secret_access

  secret_id = google_secret_manager_secret.this[each.value.secret].id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.this[each.value.account].member
}
