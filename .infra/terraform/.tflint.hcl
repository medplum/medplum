plugin "terraform" {
  enabled = true
  preset  = "recommended"
}

rule "terraform_typed_variables" {
  enabled = false
}
