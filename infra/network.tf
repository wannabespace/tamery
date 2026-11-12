resource "google_compute_network" "tamery" {
  name                    = "tamery"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "tamery" {
  name                     = "tamery-${local.region}"
  region                   = local.region
  network                  = google_compute_network.tamery.id
  ip_cidr_range            = "10.10.0.0/24"
  private_ip_google_access = true
}

resource "google_compute_global_address" "private_services" {
  name          = "google-managed-services-tamery"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  address       = "10.20.0.0"
  prefix_length = 20
  network       = google_compute_network.tamery.id
}

resource "google_service_networking_connection" "private_services" {
  network                 = google_compute_network.tamery.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_services.name]
}

# Customers allowlist these in their database firewalls: replacing one breaks their connections.
resource "google_compute_address" "nat" {
  for_each = toset(["tamery-nat-1", "tamery-nat-2"])

  name   = each.value
  region = local.region

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_compute_router" "tamery" {
  name    = "tamery"
  region  = local.region
  network = google_compute_network.tamery.id
}

resource "google_compute_router_nat" "tamery" {
  name                               = "tamery"
  router                             = google_compute_router.tamery.name
  region                             = local.region
  nat_ip_allocate_option             = "MANUAL_ONLY"
  nat_ips                            = [for address in google_compute_address.nat : address.self_link]
  source_subnetwork_ip_ranges_to_nat = "LIST_OF_SUBNETWORKS"
  min_ports_per_vm                   = 1024

  subnetwork {
    name                    = google_compute_subnetwork.tamery.id
    source_ip_ranges_to_nat = ["PRIMARY_IP_RANGE"]
  }
}

# The proxy dials hosts users choose, and Oracle and libsql sockets skip its application-level host guard.
# No firewall reaches the metadata server, so tamery-proxy's account must keep reading only PROXY_SHARED_SECRET.
resource "google_compute_firewall" "proxy_deny_private" {
  name               = "tamery-proxy-deny-private"
  network            = google_compute_network.tamery.id
  direction          = "EGRESS"
  priority           = 100
  target_tags        = ["tamery-proxy"]
  destination_ranges = ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "100.64.0.0/10"]

  deny {
    protocol = "all"
  }
}
