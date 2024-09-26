output "nat_name" {
  value = google_compute_router_nat.nat.name
}

output "nat_id" {
  value = google_compute_router_nat.nat.id
}

output "router_name" {
  value = google_compute_router.public.name
}

output "router_id" {
  value = google_compute_router.public.id
}

output "nat_ip" {
  value = google_compute_address.nat.address
}
