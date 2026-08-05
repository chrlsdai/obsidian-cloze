# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------

PLUGIN_NAME         := obsidian-cloze

# --- Obsidian vault roots ---
TEST_VAULT          := $(HOME)/Documents/Obsidian/o2a-development
PROD_VAULT          := $(HOME)/Documents/HMS/Medical Learning

# --- Derived plugin install paths ---
TEST_PLUGIN_DIR     := $(TEST_VAULT)/.obsidian/plugins/$(PLUGIN_NAME)
PROD_PLUGIN_DIR     := $(PROD_VAULT)/.obsidian/plugins/$(PLUGIN_NAME)

# --- Anki profile names (must match exactly as shown in Anki's profile list) ---
ANKI_TEST_PROFILE   := Testing
ANKI_PROD_PROFILE   := Medical Learning

# --- Anki user data directory ---
ANKI_DATA_DIR       := $(HOME)/Library/Application Support/Anki2

# --- Anki user data directory ---
ANKI_DATA_DIR       := $(HOME)/Library/Application Support/Anki2

# --- Files to deploy ---
PLUGIN_FILES        := main.js manifest.json data.json styles.css

# --- Backup settings ---
BACKUP_ROOT         := $(HOME)/Documents/$(PLUGIN_NAME)-backups

# --- Source dump settings ---
SRC_DIR      := src
DUMP_FILE    := code-text.txt

# -----------------------------------------------------------------------------
# Internals — Do not edit below unless you know what you're doing
# -----------------------------------------------------------------------------

TIMESTAMP   := $(shell date +%Y%m%d_%H%M%S)
BACKUP_DIR  := $(BACKUP_ROOT)/$(TIMESTAMP)

# ANSI colours
C_RESET  := \033[0m
C_BOLD   := \033[1m
C_RED    := \033[0;31m
C_GREEN  := \033[0;32m
C_YELLOW := \033[0;33m
C_CYAN   := \033[0;36m

define log_info
	@printf "$(C_CYAN)→ $(1)$(C_RESET)\n"
endef

define log_ok
	@printf "$(C_GREEN)✓ $(1)$(C_RESET)\n"
endef

define log_warn
	@printf "$(C_YELLOW)⚠ $(1)$(C_RESET)\n"
endef

define log_err
	@printf "$(C_RED)✗ $(1)$(C_RESET)\n"
endef

# =============================================================================
# Phony declarations
# =============================================================================

.PHONY: all help build watch dev prod \
        _deploy-test _deploy-prod \
        switch-test switch-prod \
        backup backup-anki backup-obsidian \
        clean clean-backups


# =============================================================================
# Default
# =============================================================================

all: help


# =============================================================================
# help — auto-generated from ## comments
# =============================================================================

help:
	@printf "$(C_BOLD)$(C_CYAN)Obsidian-Anki Plugin — Development Makefile$(C_RESET)\n\n"
	@printf "$(C_YELLOW)Usage:$(C_RESET)  make $(C_GREEN)<target>$(C_RESET)\n\n"
	@printf "$(C_YELLOW)Targets:$(C_RESET)\n"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; \
		       {printf "  $(C_GREEN)%-18s$(C_RESET) %s\n", $$1, $$2}'
	@printf "\n$(C_YELLOW)Config:$(C_RESET)\n"
	@printf "  Plugin:       $(PLUGIN_NAME)\n"
	@printf "  Test vault:   $(TEST_VAULT)\n"
	@printf "  Prod vault:   $(PROD_VAULT)\n"
	@printf "  Anki test:    $(ANKI_TEST_PROFILE)\n"
	@printf "  Anki prod:    $(ANKI_PROD_PROFILE)\n"
	@printf "  Backups:      $(BACKUP_ROOT)\n"


# =============================================================================
# Build
# =============================================================================

build: ## Compile TypeScript → main.js
	$(call log_info,Building TypeScript...)
	@npm run build
	$(call log_ok,Build complete)

watch: ## Live-rebuild on file changes (Ctrl+C to stop)
	$(call log_info,Starting watch mode...)
	@npm run dev


# =============================================================================
# Environments
# =============================================================================

dev: build _deploy-test switch-test ## Build → deploy to test vault → switch Anki to test profile
	@printf "\n$(C_BOLD)$(C_GREEN)✓ Test environment ready$(C_RESET)\n"
	@printf "  Plugin dir : $(TEST_PLUGIN_DIR)\n"
	@printf "  Anki       : $(ANKI_TEST_PROFILE)\n"

prod: backup build _deploy-prod switch-prod ## Backup → build → deploy to prod vault → switch Anki to prod profile
	@printf "\n$(C_BOLD)$(C_GREEN)✓ Production environment ready$(C_RESET)\n"
	@printf "  Plugin dir : $(PROD_PLUGIN_DIR)\n"
	@printf "  Anki       : $(ANKI_PROD_PROFILE)\n"
	@printf "  Backup at  : $(BACKUP_DIR)\n"

transfer: build _deploy-prod ## Build → deploy to prod vault
	@printf "\n$(C_BOLD)$(C_GREEN)✓ Production built $(C_RESET)\n"
	@printf "  Plugin dir : $(PROD_PLUGIN_DIR)\n"

# =============================================================================
# Internal deploy helpers
# =============================================================================

_deploy-prod:
	$(call log_info,Deploying to production vault...)
	@$(MAKE) _copy-files DEST="$(PROD_PLUGIN_DIR)"
	$(call log_ok,Production vault updated)

# Copy plugin files to $(DEST)
_copy-files:
	@for f in $(PLUGIN_FILES); do \
		if [ -f "$$f" ]; then \
			cp "$$f" "$(DEST)/$$f"; \
			printf "  $(C_GREEN)copied$(C_RESET)  $$f\n"; \
		else \
			printf "$(C_RED)  ✗ Required file missing: $$f$(C_RESET)\n"; \
		fi \
	done; \

# =============================================================================
# Anki profile switching
# =============================================================================

switch-test: ## Restart Anki with the test profile
	$(call log_info,Switching Anki to test profile: $(ANKI_TEST_PROFILE))
	@$(MAKE) --no-print-directory _kill-anki
	@sleep 1
	@open -a Anki --args -p "$(ANKI_TEST_PROFILE)"
	$(call log_ok,Anki launched with profile: $(ANKI_TEST_PROFILE))

switch-prod: ## Restart Anki with the production profile
	$(call log_info,Switching Anki to production profile: $(ANKI_PROD_PROFILE))
	@$(MAKE) --no-print-directory _kill-anki
	@sleep 1
	@open -a Anki --args -p "$(ANKI_PROD_PROFILE)"
	$(call log_ok,Anki launched with profile: $(ANKI_PROD_PROFILE))

# Gracefully kill Anki regardless of capitalisation; OK if not running
_kill-anki:
	@printf "  Closing Anki...\n"
	@pkill -x pkill -x anki 2>/dev/null || true

# =============================================================================
# Backup
# =============================================================================

backup: backup-anki backup-obsidian ## Backup prod Anki profile + Obsidian vault config
	$(call log_ok,Backup complete → $(BACKUP_DIR))

backup-anki: ## Backup prod Anki collection, media DB, and media folder
	$(call log_info,Backing up Anki profile: $(ANKI_PROD_PROFILE)...)
	@mkdir -p "$(BACKUP_DIR)/anki"
	@PROFILE_DIR="$(ANKI_DATA_DIR)/$(ANKI_PROD_PROFILE)"; \
	if [ ! -d "$$PROFILE_DIR" ]; then \
		printf "$(C_RED)  ✗ Anki profile not found: $$PROFILE_DIR$(C_RESET)\n"; \
		exit 1; \
	fi; \
	rsync -a \
		--include='collection.anki2' \
		--include='collection.media.db2' \
		--include='collection.media/' \
		--include='collection.media/**' \
		--exclude='*' \
		"$$PROFILE_DIR/" "$(BACKUP_DIR)/anki/"
	$(call log_ok,Anki backup complete → $(BACKUP_DIR)/anki/)

backup-obsidian: ## Backup prod Obsidian vault (everything except .obsidian/)
	$(call log_info,Backing up Obsidian vault: $(PROD_VAULT)...)
	@mkdir -p "$(BACKUP_DIR)/obsidian"
	@if [ ! -d "$(PROD_VAULT)" ]; then \
		printf "$(C_RED)  ✗ Vault not found: $(PROD_VAULT)$(C_RESET)\n"; \
		exit 1; \
	fi
	@rsync -a --exclude='.obsidian' "$(PROD_VAULT)/" "$(BACKUP_DIR)/obsidian/"
	$(call log_ok,Vault backed up → $(BACKUP_DIR)/obsidian/)

# =============================================================================
# Test
# =============================================================================

test: ## Run the test suite (npm test)
	$(call log_info,Running tests...)
	@npm test
	$(call log_ok,Finished running tests)

dump: ## Concatenate all source files into $(DUMP_FILE) with filename headers
	$(call log_info,Dumping $(SRC_DIR)/ → $(DUMP_FILE)...)
	find $(SRC_DIR) -type f | xargs tail -n +1 > $(DUMP_FILE)
	$(call log_ok,Wrote $$(wc -l < "$(DUMP_FILE)") lines to $(DUMP_FILE))

