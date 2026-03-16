#!/bin/bash
set -e

echo "═══════════════════════════════════════"
echo "  Site Builder — Starting up..."
echo "═══════════════════════════════════════"

# Ensure data/uploads dirs exist (volumes may override)
mkdir -p /opt/kiosk/data /opt/kiosk/uploads

echo "Starting services..."
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/sitebuilder.conf
