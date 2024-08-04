SOPS_AGE_PUBLIC_KEY=yourkey

start:
	docker compose up --build


FILES_TO_ENCRYPT = .env medplum.config.json ./services/proxy/certs/key.pem


.PHONY: secrets-encrpyt
## encrypt secrets with SOPS and AGE
secrets-encrpyt:
	for file in $(FILES_TO_ENCRYPT); do \
		echo "Encrypting: $$file"; \
		sops --encrypt --age $(SOPS_AGE_PUBLIC_KEY) --input-type binary --output-type binary $${file} > $${file}.enc; \
	done


.PHONY: secrets-decrypt
## encrypt secrets with SOPS and AGE
secrets-decrypt:
	export SOPS_AGE_KEY_FILE=../../key.txt; \
	for file in $(FILES_TO_ENCRYPT); do \
		echo "Decrypting: $$file"; \
		sops --decrypt --input-type binary --output-type binary $${file}.enc > $${file}; \
	done

#################################################################################
# PROJECT RULES                                                                 #
#################################################################################
#################################################################################
# Self Documenting Commands                                                     #
#################################################################################
.DEFAULT_GOAL := help
# Inspired by <http://marmelab.com/blog/2016/02/29/auto-documented-makefile.html>
# sed script explained:
# /^##/:
# 	* save line in hold space
# 	* purge line
# 	* Loop:
# 		* append newline + line to hold space
# 		* go to next line
# 		* if line starts with doc comment, strip comment character off and loop
# 	* remove target prerequisites
# 	* append hold space (+ newline) to line
# 	* replace newline plus comments by `---`
# 	* print line
# Separate expressions are necessary because labels cannot be delimited by
# semicolon; see <http://stackoverflow.com/a/11799865/1968>
.PHONY: help
help:
	@echo "$$(tput bold)Available rules:$$(tput sgr0)"
	@echo
	@sed -n -e "/^## / { \
		h; \
		s/.*//; \
		:doc" \
		-e "H; \
		n; \
		s/^## //; \
		t doc" \
		-e "s/:.*//; \
		G; \
		s/\\n## /---/; \
		s/\\n/ /g; \
		p; \
	}" ${MAKEFILE_LIST} \
	| LC_ALL='C' sort --ignore-case \
	| awk -F '---' \
		-v ncol=$$(tput cols) \
		-v indent=19 \
		-v col_on="$$(tput setaf 6)" \
		-v col_off="$$(tput sgr0)" \
	'{ \
		printf "%s%*s%s ", col_on, -indent, $$1, col_off; \
		n = split($$2, words, " "); \
		line_length = ncol - indent; \
		for (i = 1; i <= n; i++) { \
			line_length -= length(words[i]) + 1; \
			if (line_length <= 0) { \
				line_length = ncol - indent - length(words[i]) - 1; \
				printf "\n%*s ", -indent, " "; \
			} \
			printf "%s ", words[i]; \
		} \
		printf "\n"; \
	}' \
	| more $(shell test $(shell uname) = Darwin && echo '--no-init --raw-control-chars')
