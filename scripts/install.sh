#!/bin/bash
# Install ACP Harness skill for AI coding agents supporting agent-skills-spec
# Supports: Gemini CLI, GitHub Copilot, Cursor, OpenCode, Amp, Goose, Factory
#
# NOTE: Claude Code users should use the plugin marketplace instead:
#   /plugin marketplace add plaited/acp-harness
#
# Usage:
#   ./install.sh                    # Interactive: asks which agent
#   ./install.sh --agent gemini     # Direct: install for Gemini CLI
#   ./install.sh --update           # Update existing installation
#   ./install.sh --uninstall        # Remove installation

set -e

# ============================================================================
# Configuration
# ============================================================================

REPO="https://github.com/plaited/acp-harness.git"
BRANCH="main"
TEMP_DIR=""

# ============================================================================
# Agent Directory Mappings (functions for bash 3.x compatibility)
# ============================================================================

get_skills_dir() {
  case "$1" in
    gemini)   echo ".gemini/skills" ;;
    copilot)  echo ".github/skills" ;;
    cursor)   echo ".cursor/skills" ;;
    opencode) echo ".opencode/skill" ;;    # OpenCode uses 'skill' (singular)
    amp)      echo ".amp/skills" ;;
    goose)    echo ".goose/skills" ;;
    factory)  echo ".factory/skills" ;;
    *)        echo "" ;;
  esac
}

# ============================================================================
# Helper Functions
# ============================================================================

print_header() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  ACP Harness Installer"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
}

print_success() {
  echo "✓ $1"
}

print_info() {
  echo "→ $1"
}

print_error() {
  echo "✗ $1" >&2
}

cleanup() {
  if [ -n "$TEMP_DIR" ] && [ -d "$TEMP_DIR" ]; then
    rm -rf "$TEMP_DIR"
  fi
}

trap cleanup EXIT

# ============================================================================
# Agent Detection
# ============================================================================

detect_agent() {
  # Check for existing installations (order matters - more specific first)
  if [ -d ".gemini" ]; then
    echo "gemini"
  elif [ -d ".github" ]; then
    echo "copilot"
  elif [ -d ".cursor" ]; then
    echo "cursor"
  elif [ -d ".opencode" ]; then
    echo "opencode"
  elif [ -d ".amp" ]; then
    echo "amp"
  elif [ -d ".goose" ]; then
    echo "goose"
  elif [ -d ".factory" ]; then
    echo "factory"
  else
    echo ""
  fi
}

ask_agent() {
  local detected
  detected=$(detect_agent)

  echo "Which AI coding agent are you using?"
  echo ""
  echo "  ┌─────────────┬──────────────────┐"
  echo "  │ Agent       │ Directory        │"
  echo "  ├─────────────┼──────────────────┤"
  echo "  │ 1) Gemini   │ .gemini/skills   │"
  echo "  │ 2) Copilot  │ .github/skills   │"
  echo "  │ 3) Cursor   │ .cursor/skills   │"
  echo "  │ 4) OpenCode │ .opencode/skill  │"
  echo "  │ 5) Amp      │ .amp/skills      │"
  echo "  │ 6) Goose    │ .goose/skills    │"
  echo "  │ 7) Factory  │ .factory/skills  │"
  echo "  └─────────────┴──────────────────┘"
  echo ""
  echo "  Claude Code? Use: /plugin marketplace add plaited/acp-harness"
  echo ""

  if [ -n "$detected" ]; then
    echo "  Detected: $detected"
    echo ""
  fi

  printf "Select agent [1-7]: "
  read choice

  case "$choice" in
    1) echo "gemini" ;;
    2) echo "copilot" ;;
    3) echo "cursor" ;;
    4) echo "opencode" ;;
    5) echo "amp" ;;
    6) echo "goose" ;;
    7) echo "factory" ;;
    *)
      print_error "Invalid choice"
      exit 1
      ;;
  esac
}

# ============================================================================
# Installation Functions
# ============================================================================

clone_repo() {
  TEMP_DIR=$(mktemp -d)
  print_info "Cloning ACP Harness repository..."

  git clone --depth 1 --filter=blob:none --sparse "$REPO" "$TEMP_DIR" --branch "$BRANCH" 2>/dev/null
  cd "$TEMP_DIR"
  git sparse-checkout set .claude/skills 2>/dev/null
  cd - > /dev/null

  print_success "Repository cloned"
}

install_skills() {
  local agent="$1"
  local target_dir
  target_dir=$(get_skills_dir "$agent")

  if [ -z "$target_dir" ]; then
    print_error "Unknown agent: $agent"
    return 1
  fi

  print_info "Installing skills to $target_dir/"
  mkdir -p "$target_dir"
  cp -r "$TEMP_DIR/.claude/skills/"* "$target_dir/"
  print_success "Skills installed"
}

# ============================================================================
# Main Installation
# ============================================================================

do_install() {
  local agent="$1"

  print_info "Installing for: $agent"
  echo ""

  clone_repo
  install_skills "$agent"

  local skills_dir
  skills_dir=$(get_skills_dir "$agent")

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Installation Complete!"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "  Installed for: $agent"
  echo ""

  [ -d "$skills_dir" ] && echo "    • Skills:   $skills_dir/"

  echo ""
  echo "  Next steps:"
  echo "    1. Restart your AI coding agent to load the new skills"
  echo "    2. Skills are auto-discovered and activated when relevant"
  echo ""
}

# ============================================================================
# Update
# ============================================================================

do_update() {
  local agent
  agent=$(detect_agent)

  if [ -z "$agent" ]; then
    print_error "No existing installation detected"
    print_info "Run without --update to install"
    exit 1
  fi

  print_info "Updating installation for: $agent"

  # Remove old installation
  local skills_dir
  skills_dir=$(get_skills_dir "$agent")

  # Only remove the acp-harness skill, not all skills
  [ -d "$skills_dir/acp-harness" ] && rm -rf "$skills_dir/acp-harness"

  # Reinstall
  do_install "$agent"
}

# ============================================================================
# Uninstall
# ============================================================================

do_uninstall() {
  local agent
  agent=$(detect_agent)

  if [ -z "$agent" ]; then
    print_error "No existing installation detected"
    exit 1
  fi

  print_info "Uninstalling ACP Harness for: $agent"

  local skills_dir
  skills_dir=$(get_skills_dir "$agent")

  # Only remove the acp-harness skill, not all skills
  if [ -d "$skills_dir/acp-harness" ]; then
    rm -rf "$skills_dir/acp-harness"
    print_success "Removed $skills_dir/acp-harness/"
  else
    print_info "ACP Harness skill not found in $skills_dir/"
  fi

  echo ""
  print_success "ACP Harness uninstalled"
}

# ============================================================================
# CLI Parsing
# ============================================================================

show_help() {
  echo "Usage: install.sh [OPTIONS]"
  echo ""
  echo "Install ACP Harness skill for AI coding agents supporting agent-skills-spec."
  echo ""
  echo "NOTE: Claude Code users should use the plugin marketplace instead:"
  echo "  /plugin marketplace add plaited/acp-harness"
  echo ""
  echo "Options:"
  echo "  --agent <name>    Install for specific agent"
  echo "  --update          Update existing installation"
  echo "  --uninstall       Remove installation"
  echo "  --help            Show this help message"
  echo ""
  echo "Supported Agents:"
  echo ""
  echo "  ┌─────────────┬──────────────────┐"
  echo "  │ Agent       │ Directory        │"
  echo "  ├─────────────┼──────────────────┤"
  echo "  │ gemini      │ .gemini/skills   │"
  echo "  │ copilot     │ .github/skills   │"
  echo "  │ cursor      │ .cursor/skills   │"
  echo "  │ opencode    │ .opencode/skill  │"
  echo "  │ amp         │ .amp/skills      │"
  echo "  │ goose       │ .goose/skills    │"
  echo "  │ factory     │ .factory/skills  │"
  echo "  └─────────────┴──────────────────┘"
  echo ""
  echo "Examples:"
  echo "  ./install.sh                  # Interactive mode"
  echo "  ./install.sh --agent gemini   # Install for Gemini CLI"
  echo "  ./install.sh --update         # Update existing"
  echo "  ./install.sh --uninstall      # Remove installation"
}

main() {
  local agent=""
  local action="install"

  while [ $# -gt 0 ]; do
    case "$1" in
      --agent)
        agent="$2"
        shift 2
        ;;
      --update)
        action="update"
        shift
        ;;
      --uninstall)
        action="uninstall"
        shift
        ;;
      --help|-h)
        show_help
        exit 0
        ;;
      *)
        print_error "Unknown option: $1"
        show_help
        exit 1
        ;;
    esac
  done

  print_header

  case "$action" in
    install)
      if [ -z "$agent" ]; then
        agent=$(ask_agent)
      fi

      # Redirect Claude users to marketplace
      if [ "$agent" = "claude" ]; then
        echo ""
        print_info "Claude Code users should use the plugin marketplace:"
        echo ""
        echo "  /plugin marketplace add plaited/acp-harness"
        echo ""
        exit 0
      fi

      # Validate agent
      local skills_dir
      skills_dir=$(get_skills_dir "$agent")
      if [ -z "$skills_dir" ]; then
        print_error "Unknown agent: $agent"
        print_info "Valid agents: gemini, copilot, cursor, opencode, amp, goose, factory"
        print_info "Claude Code? Use: /plugin marketplace add plaited/acp-harness"
        exit 1
      fi

      do_install "$agent"
      ;;
    update)
      do_update
      ;;
    uninstall)
      do_uninstall
      ;;
  esac
}

main "$@"
