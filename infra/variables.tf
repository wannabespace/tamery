variable "billing_account" {
  type = string
}

variable "operator" {
  description = "IAM member who wraps secrets, e.g. user:someone@example.com"
  type        = string
}

variable "sql_authorized_networks" {
  description = "CIDRs allowed on Cloud SQL's public IP, by name"
  type        = map(string)
  default     = {}
}

locals {
  project    = "gen-lang-client-0721016191"
  region     = "europe-west3"
  subnet     = "tamery-${local.region}"
  registry   = "${local.region}-docker.pkg.dev/${local.project}/tamery"
  domain     = "tamery.app"
  bootstrap  = "e0ef02695d0eb2783b1c660b7cf916ea7715c2ce"
  kms_key_id = "projects/${local.project}/locations/${local.region}/keyRings/tamery/cryptoKeys/secrets"
}

data "google_project" "current" {}
