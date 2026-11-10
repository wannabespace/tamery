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

  # The key lives outside OpenTofu, like the bucket: destroying it makes the state unreadable for good.
  encryption {
    key_provider "gcp_kms" "state" {
      kms_encryption_key = "projects/gen-lang-client-0721016191/locations/europe-west3/keyRings/tamery/cryptoKeys/state"
      key_length         = 32
    }

    method "aes_gcm" "state" {
      keys = key_provider.gcp_kms.state
    }

    # Only while the existing plaintext state is rewritten by the first apply; then drop it and enforce.
    method "unencrypted" "migrate" {}

    state {
      method = method.aes_gcm.state

      fallback {
        method = method.unencrypted.migrate
      }
    }
  }
}

provider "google" {
  project = local.project
  region  = local.region
}
