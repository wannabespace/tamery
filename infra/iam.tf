locals {
  service_accounts = {
    tamery-api       = "API runtime"
    tamery-proxy     = "Proxy runtime"
    tamery-web       = "App, main, docs, share runtime"
    tamery-jobs      = "Migrate and purge jobs"
    tamery-scheduler = "Invokes the purge job"
    tamery-deploy    = "GitHub Actions deploys"
  }

  runtime_accounts = toset(["tamery-api", "tamery-proxy", "tamery-web", "tamery-jobs"])
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

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github"
  display_name              = "GitHub Actions"
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"

  # Pull requests run this repo's workflows too: only main may sign in as the deploy account.
  attribute_condition = "assertion.repository == 'wannabespace/tamery' && assertion.ref == 'refs/heads/main'"
  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
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
