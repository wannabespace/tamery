locals {
  hosts = {
    api   = "api.${local.domain}"
    proxy = "proxy.${local.domain}"
    app   = "web.${local.domain}"
    docs  = "docs.${local.domain}"
    share = "share.${local.domain}"
    main  = local.domain
  }
}

resource "google_compute_global_address" "lb" {
  name       = "tamery-lb"
  ip_version = "IPV4"
}

resource "google_compute_region_network_endpoint_group" "this" {
  for_each = local.services

  name                  = "neg-${each.key}"
  region                = local.region
  network_endpoint_type = "SERVERLESS"

  cloud_run {
    service = google_cloud_run_v2_service.this[each.key].name
  }
}

resource "google_compute_backend_service" "this" {
  for_each = local.services

  name                  = "be-${each.key}"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  protocol              = "HTTP"

  connection_draining_timeout_sec = 0

  backend {
    group = google_compute_region_network_endpoint_group.this[each.key].id
  }
}

resource "google_compute_url_map" "tamery" {
  name            = "tamery"
  default_service = google_compute_backend_service.this["main"].id

  dynamic "host_rule" {
    for_each = local.hosts
    content {
      hosts        = [host_rule.value]
      path_matcher = "pm-${host_rule.key}"
    }
  }

  dynamic "path_matcher" {
    for_each = ["api", "proxy", "app", "docs", "share", "main"]
    content {
      name            = "pm-${path_matcher.value}"
      default_service = google_compute_backend_service.this[path_matcher.value].id
    }
  }
}

resource "google_certificate_manager_dns_authorization" "tamery" {
  name   = "tamery-app"
  domain = local.domain
}

resource "google_certificate_manager_certificate" "tamery" {
  name = "tamery-app"

  managed {
    domains            = [local.domain, "*.${local.domain}"]
    dns_authorizations = [google_certificate_manager_dns_authorization.tamery.id]
  }
}

resource "google_certificate_manager_certificate_map" "tamery" {
  name = "tamery"
}

resource "google_certificate_manager_certificate_map_entry" "this" {
  for_each = {
    apex     = local.domain
    wildcard = "*.${local.domain}"
  }

  name         = each.key
  map          = google_certificate_manager_certificate_map.tamery.name
  hostname     = each.value
  certificates = [google_certificate_manager_certificate.tamery.id]
}

resource "google_certificate_manager_trust_config" "cloudflare" {
  name     = "cloudflare-origin-pull"
  location = "global"

  trust_stores {
    trust_anchors {
      pem_certificate = file("${path.module}/cloudflare-origin-pull-ca.pem")
    }
  }
}

# Cloudflare presents this CA's client certificate, so nothing else can reach the load balancer and forge x-real-ip.
resource "google_network_security_server_tls_policy" "cloudflare_only" {
  name     = "cloudflare-only"
  location = "global"

  mtls_policy {
    client_validation_mode = "REJECT_INVALID"
    # The API stores the project number, and a project ID here replaces the policy on every plan.
    client_validation_trust_config = "projects/${data.google_project.current.number}/locations/global/trustConfigs/${google_certificate_manager_trust_config.cloudflare.name}"
  }

  depends_on = [google_project_service.this["networksecurity.googleapis.com"]]
}

resource "google_compute_target_https_proxy" "tamery" {
  name              = "tamery"
  url_map           = google_compute_url_map.tamery.id
  certificate_map   = "https://certificatemanager.googleapis.com/v1/${google_certificate_manager_certificate_map.tamery.id}"
  server_tls_policy = google_network_security_server_tls_policy.cloudflare_only.id
}

resource "google_compute_global_forwarding_rule" "https" {
  name                  = "tamery-https"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  ip_address            = google_compute_global_address.lb.address
  target                = google_compute_target_https_proxy.tamery.id
  port_range            = "443"
}
