terraform {
  required_version = ">= 1.9"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.0"
    }
  }

  # The state holds the Redis auth string: only the owner and infra.yml's accounts may read this bucket.
  backend "gcs" {
    bucket = "gen-lang-client-0721016191-tofu-state"
  }
}

provider "google" {
  project = local.project
  region  = local.region
}
