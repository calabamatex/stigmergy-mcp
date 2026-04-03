#!/bin/sh
# Install git hooks for stigmergy-mcp development
HOOK_DIR="$(git rev-parse --show-toplevel)/.git/hooks"
HOOK="$HOOK_DIR/pre-commit"

cat > "$HOOK" << 'EOF'
#!/bin/sh
npm run build && npm test
EOF

chmod +x "$HOOK"
echo "stigmergy-mcp: pre-commit hook installed."
