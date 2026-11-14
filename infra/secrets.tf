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
  rotation_period            = "7776000s"
  destroy_scheduled_duration = "10368000s"

  lifecycle {
    prevent_destroy = true
  }
}

# Secret Manager's own service agent, not the runtime accounts: revoking this stops every new instance from booting.
resource "google_kms_crypto_key_iam_member" "secret_manager_uses_key" {
  crypto_key_id = google_kms_crypto_key.secrets.id
  role          = "roles/cloudkms.cryptoKeyEncrypterDecrypter"
  member        = "serviceAccount:service-${data.google_project.current.number}@gcp-sa-secretmanager.iam.gserviceaccount.com"
}

locals {
  api_secrets = [
    "ALERTS_EMAIL",
    "BETTER_AUTH_SECRET",
    "CONTEXT7_API_KEY",
    "DATABASE_URL",
    "ENCRYPTION_SECRET",
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
    "STRIPE_PRO_ANNUAL_PRICE_ID",
    "STRIPE_PRO_MONTH_PRICE_ID",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "TODESKTOP_WEBHOOK_SECRET",
    "USER_KEY_SECRET",
  ]

  secret_access = merge([
    for workload in values(merge(local.services, local.jobs)) : {
      for secret in workload.secrets : "${workload.account}/${secret}" => { account = workload.account, secret = secret }
    }
  ]...)
}

# Containers only: secret values are added with `gcloud secrets versions add`, so they stay out of the state.
resource "google_secret_manager_secret" "this" {
  for_each = toset(concat(local.api_secrets, ["sql-postgres-password", "sql-tamery-app-password"]))

  secret_id = each.value

  replication {
    user_managed {
      replicas {
        location = local.region
        customer_managed_encryption {
          kms_key_name = google_kms_crypto_key.secrets.id
        }
      }
    }
  }

  # Destroying a secret deletes every value it holds while running revisions still mount it, so a rename or a dropped name fails the plan: SECRETS.md → Adding, renaming or retiring a secret.
  lifecycle {
    prevent_destroy = true
  }

  depends_on = [google_kms_crypto_key_iam_member.secret_manager_uses_key]
}

resource "google_secret_manager_secret_iam_member" "access" {
  for_each = local.secret_access

  secret_id = google_secret_manager_secret.this[each.value.secret].id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.this[each.value.account].member
}
