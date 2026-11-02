#!/bin/sh
# Installs or updates the Tamery CLI: curl -fsSL https://tamery.app/cli/install.sh | sh
# TAMERY_VERSION=1.2.0 installs that version instead of the latest.
set -eu

RELEASES="https://github.com/wannabespace/tamery/releases/download"
INSTALL_DIR="$HOME/.tamery/bin"

fail() {
  printf 'Tamery install failed: %s\n' "$1" >&2
  exit 1
}

detect_target() {
  case "$(uname -s)" in
    Darwin) os=darwin ;;
    Linux) os=linux ;;
    *) fail "$(uname -s) is not supported. On Windows, run in PowerShell: irm https://tamery.app/cli/install.ps1 | iex" ;;
  esac
  case "$(uname -m)" in
    arm64 | aarch64) cpu=arm64 ;;
    x86_64 | amd64) cpu=x64 ;;
    *) fail "the $(uname -m) CPU is not supported." ;;
  esac
  # A shell running under Rosetta reports x86_64 on Apple silicon.
  if [ "$os" = darwin ] && [ "$cpu" = x64 ] && [ "$(sysctl -n sysctl.proc_translated 2>/dev/null)" = 1 ]; then
    cpu=arm64
  fi
  target="$os-$cpu"
  if [ "$os" = linux ] && { ls /lib/ld-musl-* >/dev/null 2>&1 || ldd --version 2>&1 | grep -qi musl; }; then
    target="$target-musl"
  fi
}

resolve_version() {
  version="${TAMERY_VERSION:-}"
  if [ -z "$version" ]; then
    version=$(curl -fsSL https://registry.npmjs.org/-/package/tamery/dist-tags | sed -n 's/.*"latest": *"\([^"]*\)".*/\1/p')
  fi
  [ -n "$version" ] || fail "could not look up the latest version. Check your connection, or set TAMERY_VERSION."
  # The version lands in the download URL, checksums.txt's included: a `..` in it would fetch both from another release.
  printf '%s' "$version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$' ||
    fail "$version is not a version number."
}

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d ' ' -f 1
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | cut -d ' ' -f 1
  else
    fail "sha256sum or shasum is needed to check the download."
  fi
}

# Sets `command_name`: `tamery` when it is already on PATH, else its full path, so the next step works without a new terminal.
add_to_path() {
  case ":$PATH:" in
    *":$INSTALL_DIR:"*)
      command_name=tamery
      return
      ;;
  esac
  command_name="$INSTALL_DIR/tamery"
  line="export PATH=\"\$HOME/.tamery/bin:\$PATH\""
  case "$(basename "${SHELL:-sh}")" in
    zsh) rc="${ZDOTDIR:-$HOME}/.zshrc" ;;
    bash)
      rc="$HOME/.bashrc"
      if [ "$os" = darwin ]; then rc="$HOME/.bash_profile"; fi
      ;;
    fish)
      rc="$HOME/.config/fish/config.fish"
      line="fish_add_path \"\$HOME/.tamery/bin\""
      ;;
    *) rc="$HOME/.profile" ;;
  esac
  if ! grep -qs '.tamery/bin' "$rc"; then
    mkdir -p "$(dirname "$rc")"
    printf '\n# Tamery CLI\n%s\n' "$line" >>"$rc"
    printf 'Added %s to PATH in %s for new terminals.\n' "$INSTALL_DIR" "$rc"
  fi
}

main() {
  command -v curl >/dev/null 2>&1 || fail "curl is needed."
  detect_target
  resolve_version
  asset="tamery-$target"
  url="$RELEASES/cli-v$version"

  mkdir -p "$INSTALL_DIR"
  # Inside the install folder, so the final mv is a rename that a running bridge doesn't block.
  tmp=$(mktemp -d "$INSTALL_DIR/.install.XXXXXX")
  trap 'rm -rf "$tmp"' EXIT

  printf 'Downloading Tamery CLI %s for %s\n' "$version" "$target"
  curl -fL --progress-bar -o "$tmp/$asset" "$url/$asset" ||
    fail "could not download $url/$asset. Is $version a released version?"
  curl -fsSL -o "$tmp/checksums.txt" "$url/checksums.txt" ||
    fail "could not download $url/checksums.txt."

  expected=$(awk -v name="$asset" '$2 == name || $2 == "*" name { print $1 }' "$tmp/checksums.txt")
  actual=$(sha256 "$tmp/$asset")
  if [ -z "$expected" ] || [ "$expected" != "$actual" ]; then
    fail "the checksum of $asset does not match the release's checksums.txt. Nothing was installed."
  fi

  chmod +x "$tmp/$asset"
  mv -f "$tmp/$asset" "$INSTALL_DIR/tamery"

  printf 'Installed Tamery CLI %s to %s\n' "$version" "$INSTALL_DIR/tamery"
  add_to_path
  # Bun's musl build links libstdc++ dynamically, and Alpine leaves it out of its base image.
  case "$target" in
    *-musl)
      if [ ! -e /usr/lib/libstdc++.so.6 ] && [ ! -e /lib/libstdc++.so.6 ]; then
        printf '\nTamery needs libstdc++ here. Install it first: apk add libstdc++\n'
      fi
      ;;
  esac
  printf '\nRun: %s bridge\n' "$command_name"
}

main "$@"
