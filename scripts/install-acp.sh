#!/bin/bash
# Install ACP Harness plugin for AI coding agents
# Supports: Claude Code, Cursor, OpenCode, Amp, Goose, Factory
#
# Usage:
#   ./install-acp.sh                    # Interactive: asks which agent
#   ./install-acp.sh --agent claude     # Direct: install for Claude Code
#   ./install-acp.sh --update           # Update existing installation
#   ./install-acp.sh --uninstall        # Remove installation

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
    claude)   echo ".claude/skills" ;;
    cursor)   echo ".claude/skills" ;;     # Cursor reads .claude/skills
    opencode) echo ".opencode/skill" ;;    # OpenCode uses 'skill' (singular)
    amp)      echo ".agents/skills" ;;
    goose)    echo ".claude/skills" ;;     # Goose falls back to .claude/skills
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
  # Check for existing installations
  if [ -d ".claude" ]; then
    echo "claude"
  elif [ -d ".opencode" ]; then
    echo "opencode"
  elif [ -d ".agents" ]; then
    echo "amp"
  elif [ -d ".factory" ]; then
    echo "factory"
  elif [ -d ".cursor" ]; then
    echo "cursor"
  else
    echo ""
  fi
}

ask_agent() {
  local detected
  detected=$(detect_agent)

  echo "Which AI coding agent are you using?"
  echo ""
  echo "  ┌─────────────┬──────────────────┬─────────────────────────────────────┐"
  echo "  │ Agent       │ Directory        │ Supported Features                  │"
  echo "  ├─────────────┼──────────────────┼─────────────────────────────────────┤"
  echo "  │ 1) Claude   │ .claude/         │ skills                              │"
  echo "  │ 2) Cursor   │ .claude/         │ skills                              │"
  echo "  │ 3) OpenCode │ .opencode/       │ skills                              │"
  echo "  │ 4) Amp      │ .agents/         │ skills                              │"
  echo "  │ 5) Goose    │ .claude/         │ skills                              │"
  echo "  │ 6) Factory  │ .factory/        │ skills                              │"
  echo "  └─────────────┴──────────────────┴─────────────────────────────────────┘"
  echo ""

  if [ -n "$detected" ]; then
    echo "  Detected: $detected"
    echo ""
  fi

  printf "Select agent [1-6]: "
  read choice

  case "$choice" in
    1) echo "claude" ;;
    2) echo "cursor" ;;
    3) echo "opencode" ;;
    4) echo "amp" ;;
    5) echo "goose" ;;
    6) echo "factory" ;;
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
  echo "Usage: install-acp.sh [OPTIONS]"
  echo ""
  echo "Install ACP Harness plugin for AI coding agents."
  echo ""
  echo "Options:"
  echo "  --agent <name>    Install for specific agent"
  echo "  --update          Update existing installation"
  echo "  --uninstall       Remove installation"
  echo "  --help            Show this help message"
  echo ""
  echo "Agent Compatibility:"
  echo ""
  echo "  ┌─────────────┬──────────────────┬─────────────────────────────────────┐"
  echo "  │ Agent       │ Directory        │ Supported Features                  │"
  echo "  ├─────────────┼──────────────────┼─────────────────────────────────────┤"
  echo "  │ claude      │ .claude/         │ skills                              │"
  echo "  │ cursor      │ .claude/         │ skills                              │"
  echo "  │ opencode    │ .opencode/       │ skills                              │"
  echo "  │ amp         │ .agents/         │ skills                              │"
  echo "  │ goose       │ .claude/         │ skills                              │"
  echo "  │ factory     │ .factory/        │ skills                              │"
  echo "  └─────────────┴──────────────────┴─────────────────────────────────────┘"
  echo ""
  echo "Examples:"
  echo "  ./install-acp.sh                  # Interactive mode"
  echo "  ./install-acp.sh --agent claude   # Install for Claude Code"
  echo "  ./install-acp.sh --update         # Update existing"
  echo "  ./install-acp.sh --uninstall      # Remove installation"
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

      # Validate agent
      local skills_dir
      skills_dir=$(get_skills_dir "$agent")
      if [ -z "$skills_dir" ]; then
        print_error "Unknown agent: $agent"
        print_info "Valid agents: claude, cursor, opencode, amp, goose, factory"
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
