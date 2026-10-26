#!/bin/bash
# Deploy OKOK Scale to GitHub Pages
# Run: gh auth login   (first time only)
# Then: bash deploy.sh

set -e

REPO_NAME="okok-scale"

echo "Checking GitHub auth..."
gh auth status || { echo "Run: gh auth login"; exit 1; }

# Get GitHub username
GH_USER=$(gh api user -q .login)
echo "User: $GH_USER"

# Create repo if it doesn't exist
if gh repo view "$GH_USER/$REPO_NAME" &>/dev/null; then
  echo "Repo $REPO_NAME already exists"
else
  echo "Creating repo $REPO_NAME..."
  gh repo create "$REPO_NAME" --public --description "OKOK BLE scale reader – no ads, no accounts" --source=. --push
fi

# Set remote and push
git remote remove origin 2>/dev/null || true
git remote add origin "https://github.com/$GH_USER/$REPO_NAME.git"
git branch -M main
git push -u origin main

# Enable GitHub Pages on main branch
echo "Enabling GitHub Pages..."
gh api -X POST "repos/$GH_USER/$REPO_NAME/pages" \
  -f "build_type=legacy" \
  -f "source[branch]=main" \
  -f "source[path]=/" 2>/dev/null || \
gh api -X PUT "repos/$GH_USER/$REPO_NAME/pages" \
  -f "build_type=legacy" \
  -f "source[branch]=main" \
  -f "source[path]=/" 2>/dev/null || true

URL="https://$GH_USER.github.io/$REPO_NAME/"
echo ""
echo "Done! Your scale app is at:"
echo "$URL"
echo ""
echo "(GitHub Pages may take 1-2 minutes to go live)"
