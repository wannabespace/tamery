variable "billing_account" {
  type = string
}

variable "alerts_email" {
  type = string
}

variable "operator" {
  description = "IAM member who may impersonate the viewer account, such as user:you@example.com."
  type        = string
}

variable "sql_authorized_networks" {
  description = "CIDRs allowed on Cloud SQL's public address, by name. Keep it to services outside the VPC that still need the database."
  type        = map(string)
  default     = {}
}

locals {
  project  = "gen-lang-client-0721016191"
  region   = "europe-west3"
  registry = "${local.region}-docker.pkg.dev/${local.project}/tamery"
  domain   = "tamery.app"
}

data "google_project" "current" {}
