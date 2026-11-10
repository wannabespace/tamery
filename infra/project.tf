locals {
  apis = toset([
    "artifactregistry.googleapis.com",
    "billingbudgets.googleapis.com",
    "certificatemanager.googleapis.com",
    "cloudbilling.googleapis.com",
    "cloudkms.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "cloudscheduler.googleapis.com",
    "compute.googleapis.com",
    "iamcredentials.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "networksecurity.googleapis.com",
    "redis.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "servicenetworking.googleapis.com",
    "serviceusage.googleapis.com",
    "sqladmin.googleapis.com",
    "sts.googleapis.com",
  ])
}

resource "google_project_service" "this" {
  for_each = local.apis

  service            = each.value
  disable_on_destroy = false
}

resource "google_artifact_registry_repository" "tamery" {
  repository_id = "tamery"
  location      = local.region
  format        = "DOCKER"

  # Rollback puts a service on an earlier image, so the newest ones stay however old they are.
  cleanup_policies {
    id     = "keep-recent"
    action = "KEEP"
    most_recent_versions {
      keep_count = 10
    }
  }
  cleanup_policies {
    id     = "delete-old"
    action = "DELETE"
    condition {
      older_than = "2592000s"
    }
  }
}

resource "google_billing_budget" "monthly" {
  billing_account = var.billing_account
  display_name    = "Tamery monthly"

  budget_filter {
    projects               = ["projects/${data.google_project.current.number}"]
    calendar_period        = "MONTH"
    credit_types_treatment = "INCLUDE_ALL_CREDITS"
  }

  amount {
    specified_amount {
      currency_code = "USD"
      units         = "250"
    }
  }

  dynamic "threshold_rules" {
    for_each = [[0.5, "CURRENT_SPEND"], [0.9, "CURRENT_SPEND"], [1.0, "CURRENT_SPEND"], [1.0, "FORECASTED_SPEND"]]
    content {
      threshold_percent = threshold_rules.value[0]
      spend_basis       = threshold_rules.value[1]
    }
  }
}
