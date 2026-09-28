#!/bin/sh
# Installs canovaccio as opencode configuration, without keeping a clone.
#
#   curl -fsSL https://raw.githubusercontent.com/francescomalatesta/canovaccio/main/install.sh | sh -s -- --local
#
# Usage: install.sh (--local [DIR] | --global) [options]
#
#   --local [DIR]   install into DIR/.opencode (default: current directory)
#   --global        install into $OPENCODE_CONFIG_DIR, or ~/.config/opencode
#   --ref REF       branch, tag or commit to install (default: main)
#   --repo URL      repository to install from (default: $CANOVACCIO_REPO or GitHub)
#   --dry-run       show what would change, change nothing
#   --uninstall     remove what a previous install added
#   --force         also overwrite or remove files changed locally or not
#                   installed by canovaccio (originals are backed up)
#   -h, --help      show this help
#
# A manifest (.canovaccio-manifest) in the target records installed files and
# their checksums, so updates never touch files you added or changed yourself.
# In local mode AGENTS.md is not copied: its content goes into the project's
# AGENTS.md between canovaccio markers, which updates replace.

set -eu

REPO="${CANOVACCIO_REPO:-https://github.com/francescomalatesta/canovaccio.git}"
REF=main
MODE=
LOCAL_DIR=.
DRY_RUN=0
UNINSTALL=0
FORCE=0

MANIFEST_NAME=.canovaccio-manifest
BLOCK_START='<!-- canovaccio:start -->'
BLOCK_END='<!-- canovaccio:end -->'
PAYLOAD='opencode.jsonc agents commands skills'

die() {
  echo "error: $*" >&2
  exit 1
}
usage() {
  sed -n '2,/^$/s/^# \{0,1\}//p' "$0" 2>/dev/null || true
  echo "Usage: install.sh (--local [DIR] | --global) [--ref REF] [--repo URL] [--dry-run] [--uninstall] [--force]"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --local)
      MODE=local
      if [ $# -gt 1 ] && [ "${2#-}" = "$2" ]; then
        LOCAL_DIR=$2
        shift
      fi
      ;;
    --global) MODE=global ;;
    --ref)
      [ $# -gt 1 ] || die "--ref needs a value"
      REF=$2
      shift
      ;;
    --repo)
      [ $# -gt 1 ] || die "--repo needs a value"
      REPO=$2
      shift
      ;;
    --dry-run) DRY_RUN=1 ;;
    --uninstall) UNINSTALL=1 ;;
    --force) FORCE=1 ;;
    -h | --help)
      usage
      exit 0
      ;;
    *) die "unknown option: $1 (see --help)" ;;
  esac
  shift
done

[ -n "$MODE" ] || die "choose --local [DIR] or --global (see --help)"

if [ "$MODE" = local ]; then
  [ -d "$LOCAL_DIR" ] || die "not a directory: $LOCAL_DIR"
  PROJECT=$(cd "$LOCAL_DIR" && pwd)
  TARGET=$PROJECT/.opencode
else
  TARGET=${OPENCODE_CONFIG_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/opencode}
fi
MANIFEST=$TARGET/$MANIFEST_NAME

if command -v sha256sum >/dev/null 2>&1; then
  hash_file() { sha256sum "$1" | cut -d' ' -f1; }
elif command -v shasum >/dev/null 2>&1; then
  hash_file() { shasum -a 256 "$1" | cut -d' ' -f1; }
else
  die "sha256sum or shasum is required"
fi

# Manifest lines: "<sha256> <path relative to target>"; other lines start with #.
manifest_hash() {
  [ -f "$MANIFEST" ] || return 0
  awk -v p="$1" 'substr($0, 1, 1) != "#" && substr($0, 66) == p { print substr($0, 1, 64) }' "$MANIFEST"
}

say() { printf '  %-9s %s\n' "$1" "$2"; }
run() { [ "$DRY_RUN" = 1 ] || "$@"; }
backup() { run cp -p "$1" "$1.canovaccio-bak.$(date +%Y%m%d%H%M%S)"; }
prune_dirs() { [ "$DRY_RUN" = 1 ] || rmdir -p "$(dirname "$1")" 2>/dev/null || true; }

# Removes the canovaccio block from a file (prints the result).
strip_block() {
  awk -v s="$BLOCK_START" -v e="$BLOCK_END" '
    $0 == s { skip = 1; next }
    $0 == e { skip = 0; next }
    !skip { print }
  ' "$1"
}

remove_block() {
  file=$PROJECT/AGENTS.md
  [ -f "$file" ] && grep -qxF "$BLOCK_START" "$file" || return 0
  say remove "AGENTS.md (canovaccio block)"
  [ "$DRY_RUN" = 1 ] && return 0
  strip_block "$file" | awk 'NF { for (; blank > 0; blank--) print ""; print; next } { blank++ }' >"$file.canovaccio-tmp"
  if [ -s "$file.canovaccio-tmp" ]; then mv "$file.canovaccio-tmp" "$file"; else rm -f "$file.canovaccio-tmp" "$file"; fi
}

write_block() {
  src=$1
  file=$PROJECT/AGENTS.md
  next=$WORK/agents-block
  {
    if [ -f "$file" ]; then
      strip_block "$file" | awk 'NF { for (; blank > 0; blank--) print ""; print; next } { blank++ }'
      echo
    fi
    echo "$BLOCK_START"
    echo '<!-- Managed by canovaccio install.sh: changes inside this block are overwritten. -->'
    echo
    cat "$src"
    echo
    echo "$BLOCK_END"
  } >"$next"
  if [ ! -f "$file" ]; then
    say add "AGENTS.md (canovaccio block)"
  elif cmp -s "$next" "$file"; then
    return 0
  elif grep -qxF "$BLOCK_START" "$file"; then
    say update "AGENTS.md (canovaccio block)"
  else
    say append "AGENTS.md (canovaccio block)"
  fi
  run cp "$next" "$file"
}

uninstall() {
  [ -f "$MANIFEST" ] || die "no canovaccio manifest in $TARGET"
  echo "Uninstalling canovaccio from $TARGET"
  kept=0
  grep -v '^#' "$MANIFEST" | while IFS= read -r line; do
    hash=${line%% *}
    rel=${line#* }
    dest=$TARGET/$rel
    [ -f "$dest" ] || continue
    if [ "$(hash_file "$dest")" = "$hash" ]; then
      say remove "$rel"
    elif [ "$FORCE" = 1 ]; then
      say remove "$rel (changed locally, backed up)"
      backup "$dest"
    else
      say keep "$rel (changed locally)"
      continue
    fi
    run rm -f "$dest"
    prune_dirs "$dest"
  done
  [ "$MODE" = local ] && remove_block
  say remove "$MANIFEST_NAME"
  run rm -f "$MANIFEST"
  prune_dirs "$MANIFEST"
  [ "$DRY_RUN" = 1 ] && echo "Dry run: nothing changed."
  return 0
}

if [ "$UNINSTALL" = 1 ]; then
  uninstall
  exit 0
fi

command -v git >/dev/null 2>&1 || die "git is required"

WORK=$(mktemp -d "${TMPDIR:-/tmp}/canovaccio.XXXXXX")
trap 'rm -rf "$WORK"' EXIT INT TERM
SRC=$WORK/src

echo "Fetching $REPO ($REF)"
git init -q "$SRC"
git -C "$SRC" fetch -q --depth 1 "$REPO" "$REF" || die "cannot fetch $REF from $REPO"
git -C "$SRC" -c advice.detachedHead=false checkout -q FETCH_HEAD
COMMIT=$(git -C "$SRC" rev-parse HEAD)

# Files to install, relative to the repository root.
FILES=$WORK/files
(cd "$SRC" && find $PAYLOAD -type f 2>/dev/null | LC_ALL=C sort) >"$FILES"
[ "$MODE" = global ] && echo AGENTS.md >>"$FILES"
[ -s "$FILES" ] || die "nothing to install at $REF"

# Plan: decide an action per file before changing anything.
PLAN=$WORK/plan
: >"$PLAN"
conflicts=0
while IFS= read -r rel; do
  new=$(hash_file "$SRC/$rel")
  dest=$TARGET/$rel
  old=$(manifest_hash "$rel")
  if [ ! -e "$dest" ]; then
    action=add
  elif [ "$(hash_file "$dest")" = "$new" ]; then
    action=same
  elif [ -n "$old" ] && [ "$(hash_file "$dest")" = "$old" ]; then
    action=update
  elif [ -n "$old" ]; then
    [ "$FORCE" = 1 ] && action=overwrite || action=keep
  else
    if [ "$FORCE" = 1 ]; then
      action=overwrite
    else
      action=conflict
      conflicts=$((conflicts + 1))
    fi
  fi
  printf '%s %s %s %s\n' "$action" "$new" "${old:--}" "$rel" >>"$PLAN"
done <"$FILES"

if [ "$conflicts" -gt 0 ]; then
  echo "These files exist in $TARGET but were not installed by canovaccio:" >&2
  awk '$1 == "conflict" { print "  " substr($0, index($0, $4)) }' "$PLAN" >&2
  die "nothing changed; rerun with --force to back them up and overwrite them"
fi

echo "Installing canovaccio $COMMIT into $TARGET"
run mkdir -p "$TARGET"
NEW_MANIFEST=$WORK/manifest
{
  echo "# canovaccio manifest: files installed by install.sh. Do not edit."
  echo "# repo $REPO"
  echo "# ref $REF"
  echo "# commit $COMMIT"
  echo "# mode $MODE"
} >"$NEW_MANIFEST"

while IFS= read -r line; do
  action=${line%% *}
  rest=${line#* }
  new=${rest%% *}
  rest=${rest#* }
  old=${rest%% *}
  rel=${rest#* }
  dest=$TARGET/$rel
  case "$action" in
    same) echo "$new $rel" >>"$NEW_MANIFEST" ;;
    keep)
      say keep "$rel (changed locally; --force to overwrite)"
      echo "$old $rel" >>"$NEW_MANIFEST"
      ;;
    add | update | overwrite)
      if [ "$action" = overwrite ]; then
        say overwrite "$rel (original backed up)"
        backup "$dest"
      else
        say "$action" "$rel"
      fi
      run mkdir -p "$(dirname "$dest")"
      run cp "$SRC/$rel" "$dest"
      echo "$new $rel" >>"$NEW_MANIFEST"
      ;;
  esac
done <"$PLAN"

# Files installed before but no longer part of canovaccio.
if [ -f "$MANIFEST" ]; then
  grep -v '^#' "$MANIFEST" | while IFS= read -r line; do
    hash=${line%% *}
    rel=${line#* }
    grep -qxF "$rel" "$FILES" && continue
    dest=$TARGET/$rel
    [ -f "$dest" ] || continue
    if [ "$(hash_file "$dest")" = "$hash" ] || [ "$FORCE" = 1 ]; then
      say remove "$rel"
      [ "$(hash_file "$dest")" = "$hash" ] || backup "$dest"
      run rm -f "$dest"
      prune_dirs "$dest"
    else
      say keep "$rel (removed upstream, changed locally)"
    fi
  done
fi

[ "$MODE" = local ] && write_block "$SRC/AGENTS.md"

if [ "$DRY_RUN" = 1 ]; then
  echo "Dry run: nothing changed."
else
  cp "$NEW_MANIFEST" "$MANIFEST"
  echo "Done."
fi

if [ -f "$TARGET/opencode.json" ]; then
  echo "note: $TARGET/opencode.json also exists; opencode merges it with opencode.jsonc." >&2
fi
if [ "$MODE" = local ]; then
  for f in opencode.json opencode.jsonc; do
    [ -f "$PROJECT/$f" ] && echo "note: $PROJECT/$f exists; settings in .opencode/opencode.jsonc take precedence over it." >&2
  done
fi
exit 0
