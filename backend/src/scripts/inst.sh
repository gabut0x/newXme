#!/bin/bash
# XME Projects Windows Installation Script
# This script will download and install Windows on your VPS

# Configuration variables (will be replaced by the service)
export tmpTARGET='__GZLINK__'
export setNet='0'
export AutoNet='1'
export FORCE1STNICNAME=''
export FORCENETCFGSTR=''
export FORCEPASSWORD='__PASSWD__'

# Installation progress reporting function
report_progress() {
    local step="$1"
    local status="$2"
    local message="$3"
    
    # Send progress update to server (you'll need to implement this endpoint)
    curl -X POST "${PROGRESS_ENDPOINT:-http://localhost:3001/api/install/progress}" \
         -H "Content-Type: application/json" \
         -d "{\"step\":\"$step\",\"status\":\"$status\",\"message\":\"$message\"}" \
         --connect-timeout 5 --max-time 10 >/dev/null 2>&1 || true
}

# Log function
log_info() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] INFO: $1"
    report_progress "logging" "running" "$1"
}

log_error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1" >&2
    report_progress "logging" "failed" "$1"
}

# Start installation process
log_info "Starting Windows installation process..."
report_progress "initialization" "running" "Installation process started"

# Validate environment
if [ -z "$tmpTARGET" ] || [ -z "$FORCEPASSWORD" ]; then
    log_error "Missing required configuration variables"
    report_progress "validation" "failed" "Missing configuration"
    exit 1
fi

log_info "Configuration validated successfully"
log_info "Target: $tmpTARGET"
log_info "Password configured: $([ -n "$FORCEPASSWORD" ] && echo "Yes" || echo "No")"

# Update system packages
log_info "Updating system packages..."
report_progress "system_update" "running" "Updating system packages"

apt-get update -qq >/dev/null 2>&1 || {
    log_error "Failed to update package list"
    report_progress "system_update" "failed" "Package update failed"
    exit 1
}

# Install required packages
log_info "Installing required packages..."
apt-get install -y curl wget gzip >/dev/null 2>&1 || {
    log_error "Failed to install required packages"
    report_progress "package_install" "failed" "Package installation failed"
    exit 1
}

report_progress "system_update" "completed" "System packages updated successfully"

# Download Windows installation files
log_info "Downloading Windows installation files..."
report_progress "download" "running" "Downloading Windows files"

# Create temporary directory
TEMP_DIR=$(mktemp -d)
cd "$TEMP_DIR" || {
    log_error "Failed to create temporary directory"
    report_progress "download" "failed" "Temporary directory creation failed"
    exit 1
}

# Download the installation archive
curl -fsSL "$tmpTARGET" -o windows_install.gz || {
    log_error "Failed to download Windows installation files"
    report_progress "download" "failed" "Download failed"
    exit 1
}

log_info "Windows files downloaded successfully"
report_progress "download" "completed" "Windows files downloaded"

# Extract and prepare installation
log_info "Extracting installation files..."
report_progress "extraction" "running" "Extracting Windows files"

gzip -d windows_install.gz || {
    log_error "Failed to extract installation files"
    report_progress "extraction" "failed" "Extraction failed"
    exit 1
}

chmod +x windows_install || {
    log_error "Failed to set execution permissions"
    report_progress "extraction" "failed" "Permission setting failed"
    exit 1
}

report_progress "extraction" "completed" "Files extracted successfully"

# Execute Windows installation
log_info "Starting Windows installation..."
report_progress "installation" "running" "Installing Windows"

# Execute the installation script
./windows_install || {
    log_error "Windows installation failed"
    report_progress "installation" "failed" "Windows installation failed"
    exit 1
}

log_info "Windows installation completed successfully"
report_progress "installation" "completed" "Windows installation completed"

# Prepare for reboot
log_info "Preparing system for reboot..."
report_progress "reboot_prep" "running" "Preparing for reboot"

# Clean up temporary files
cd /
rm -rf "$TEMP_DIR"

log_info "System will reboot to complete Windows installation"
report_progress "reboot_prep" "completed" "Ready for reboot"

# Final reboot
report_progress "reboot" "running" "Rebooting to Windows"
sleep 2
reboot -f >/dev/null 2>&1