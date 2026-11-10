locals {
  service_accounts = {
    tamery-api       = "API runtime"
    tamery-proxy     = "Proxy runtime"
    tamery-web       = "App, main, docs, share runtime"
    tamery-jobs      = "Migrate and purge jobs"
    tamery-scheduler = "Invokes the purge job"
    tamery-deploy    = "GitHub Actions deploys"
    tamery-tofu      = "Applies infra/ from GitHub Actions after approval"
    tamery-tofu-plan = "Plans infra/ from GitHub Actions"
    viewer           = "Read-only for agents"
  }

  # Not roles/reader: that one also reads bucket objects and BigQuery rows.
  project_roles = {
    tamery-tofu      = ["roles/owner"]
    tamery-tofu-plan = ["roles/viewer", "roles/serviceusage.serviceUsageConsumer"]
    viewer           = ["roles/viewer"]
  }

  runtime_accounts = toset([for workload in values(merge(local.services, local.jobs)) : workload.account])
}

import {
  to = google_service_account.this["viewer"]
  id = "projects/${local.project}/serviceAccounts/viewer@${local.project}.iam.gserviceaccount.com"
}

resource "google_service_account" "this" {
  for_each = local.service_accounts

  account_id   = each.key
  display_name = each.value
}

resource "google_artifact_registry_repository_iam_member" "deploy_pushes" {
  repository = google_artifact_registry_repository.tamery.name
  location   = local.region
  role       = "roles/artifactregistry.writer"
  member     = google_service_account.this["tamery-deploy"].member
}

resource "google_project_iam_member" "deploy_runs" {
  project = local.project
  role    = "roles/run.developer"
  member  = google_service_account.this["tamery-deploy"].member
}

resource "google_service_account_iam_member" "deploy_acts_as" {
  for_each = local.runtime_accounts

  service_account_id = google_service_account.this[each.value].name
  role               = "roles/iam.serviceAccountUser"
  member             = google_service_account.this["tamery-deploy"].member
}

resource "google_project_iam_member" "this" {
  for_each = merge([
    for account, roles in local.project_roles : { for role in roles : "${account}/${role}" => { account = account, role = role } }
  ]...)

  project = local.project
  role    = each.value.role
  member  = google_service_account.this[each.value.account].member
}

# Created outside OpenTofu, and it holds the Redis auth string; the plan runs with -lock=false, so reading is enough.
resource "google_storage_bucket_iam_member" "tofu_plan_reads_state" {
  bucket = "${local.project}-tofu-state"
  role   = "roles/storage.objectViewer"
  member = google_service_account.this["tamery-tofu-plan"].member
}

resource "google_billing_account_iam_member" "tofu_budgets" {
  for_each = {
    tamery-tofu      = "roles/billing.costsManager"
    tamery-tofu-plan = "roles/billing.viewer"
  }

  billing_account_id = var.billing_account
  role               = each.value
  member             = google_service_account.this[each.key].member

  depends_on = [google_project_service.this["cloudbilling.googleapis.com"]]
}

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github"
  display_name              = "GitHub Actions"
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"

  # Any workflow can ask GitHub for a token, and publish-cli.yml does: only deploy.yml on main may sign in as the deploy account.
  attribute_condition = "assertion.workflow_ref == 'wannabespace/tamery/.github/workflows/deploy.yml@refs/heads/main'"
  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
  }

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account_iam_member" "github_deploys" {
  service_account_id = google_service_account.this["tamery-deploy"].name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/wannabespace/tamery"
}

# Compute's default account starts as a project editor, and nothing here runs as it.
resource "google_project_iam_member_remove" "default_compute_editor" {
  project = local.project
  role    = "roles/editor"
  member  = "serviceAccount:${data.google_project.current.number}-compute@developer.gserviceaccount.com"
}

# Its own pool: a principalSet on the deploy pool would also admit deploy.yml's tokens.
resource "google_iam_workload_identity_pool" "github_infra" {
  workload_identity_pool_id = "github-infra"
  display_name              = "GitHub Actions infra"
}

resource "google_iam_workload_identity_pool_provider" "github_infra" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github_infra.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"

  attribute_condition = "assertion.workflow_ref == 'wannabespace/tamery/.github/workflows/infra.yml@refs/heads/main'"
  attribute_mapping = {
    "google.subject" = "assertion.sub"
  }

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# GitHub puts the environment in the subject only for a job that declares one, and the infra environment's required reviewer gates that job.
resource "google_service_account_iam_member" "github_tofu" {
  for_each = {
    tamery-tofu      = "repo:wannabespace/tamery:environment:infra"
    tamery-tofu-plan = "repo:wannabespace/tamery:ref:refs/heads/main"
  }

  service_account_id = google_service_account.this[each.key].name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principal://iam.googleapis.com/${google_iam_workload_identity_pool.github_infra.name}/subject/${each.value}"
}
