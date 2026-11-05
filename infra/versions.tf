terraform {
  required_version = ">= 1.9"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.0"
    }
  }

  # The state holds the Redis auth string: only the operator may read this bucket.
  backend "gcs" {
    bucket = "tamery-prod-tofu-state"
  }
}

provider "google" {
  project = local.project
  region  = local.region

  # Budgets refuse user credentials without an explicit quota project.
  billing_project       = local.project
  user_project_override = true
}
