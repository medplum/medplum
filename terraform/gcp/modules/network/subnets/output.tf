/**
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

output "subnets" {
  value       = google_compute_subnetwork.subnetwork
  description = "The created subnet resources"
}

output "subnet_name" {
  value = {
    for subnet, details in google_compute_subnetwork.subnetwork :
    details.name => details.id
  }
  description = "The created subnet name and ID"
}

output "secondary_ranges" {
  value = {
    for subnet, details in google_compute_subnetwork.subnetwork :
    subnet => {
      for secondary_range, data in details.secondary_ip_range :
      data.range_name => data.range_name
    }
  }
  description = "The secondary IP ranges for this subnet"
}
