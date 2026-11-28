locals {
  attachments_env = {
    S3_BUCKET   = google_storage_bucket.attachments.name
    S3_ENDPOINT = "https://storage.googleapis.com"
  }
}

resource "google_kms_crypto_key" "attachments" {
  name                       = "attachments"
  key_ring                   = google_kms_key_ring.tamery.id
  rotation_period            = "7776000s"
  destroy_scheduled_duration = "10368000s"

  lifecycle {
    prevent_destroy = true
  }
}

data "google_storage_project_service_account" "this" {}

# Cloud Storage's own service agent, not the runtime accounts: revoking this stops every attachment from opening.
resource "google_kms_crypto_key_iam_member" "storage_uses_attachments_key" {
  crypto_key_id = google_kms_crypto_key.attachments.id
  role          = "roles/cloudkms.cryptoKeyEncrypterDecrypter"
  member        = "serviceAccount:${data.google_storage_project_service_account.this.email_address}"
}

resource "google_storage_bucket" "attachments" {
  name                        = "${local.project}-attachments"
  location                    = local.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  encryption {
    default_kms_key_name = google_kms_crypto_key.attachments.id
  }

  # The purge job erases a chat's files with its deleted copy, as the privacy policy promises; a soft-deleted object would outlive that.
  soft_delete_policy {
    retention_duration_seconds = 0
  }

  lifecycle {
    prevent_destroy = true
  }

  depends_on = [google_kms_crypto_key_iam_member.storage_uses_attachments_key, google_project_service.this["storage.googleapis.com"]]
}

# The api and the purge job reach the bucket through this account's HMAC key (SECRETS.md → Attachments), the one credential Bun's S3 client takes.
resource "google_storage_bucket_iam_member" "attachments_account_uses_bucket" {
  bucket = google_storage_bucket.attachments.name
  role   = "roles/storage.objectUser"
  member = google_service_account.this["tamery-attachments"].member
}
