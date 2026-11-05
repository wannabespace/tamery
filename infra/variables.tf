variable "billing_account" {
  type = string
}

variable "alerts_email" {
  type = string
}

locals {
  project  = "gen-lang-client-0721016191"
  region   = "europe-west3"
  registry = "${local.region}-docker.pkg.dev/${local.project}/tamery"
  domain   = "tamery.app"
}

data "google_project" "current" {}
