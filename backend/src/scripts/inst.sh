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
export INSTALL_ID='__INSTALL_ID__'
export PROGRESS_ENDPOINT='__PROGRESS_ENDPOINT__'

# Progress reporting function
report_progress() {
    local step="$1"
    local status="$2"
    local message="$3"
    
    curl -s -X POST "$PROGRESS_ENDPOINT" \
        -H "Content-Type: application/json" \
        -d "{\"step\": \"$step\", \"status\": \"$status\", \"message\": \"$message\", \"installId\": $INSTALL_ID}" \
        > /dev/null 2>&1 || true
}

# Error handling
set -e
trap 'report_progress "script_error" "failed" "Installation script encountered an error"' ERR

# Report script start
report_progress "script_start" "running" "Installation script started"

# Update system packages
report_progress "system_update" "running" "Updating system packages"
apt-get update -y > /dev/null 2>&1

# Install required packages
report_progress "install_deps" "running" "Installing required dependencies"
apt-get install -y wget curl gzip > /dev/null 2>&1

# Download Windows installation files
report_progress "download_start" "running" "Starting Windows files download"
cd /tmp

# Download the Windows installation package
if wget -O windows_install.gz "$tmpTARGET"; then
    report_progress "download_complete" "running" "Windows files downloaded successfully"
else
    report_progress "download_failed" "failed" "Failed to download Windows installation files"
    exit 1
fi

# Extract and prepare installation
report_progress "extract_start" "running" "Extracting Windows installation files"
if gzip -d windows_install.gz; then
    chmod +x windows_install
    report_progress "extract_complete" "running" "Windows files extracted successfully"
else
    report_progress "extract_failed" "failed" "Failed to extract Windows installation files"
    exit 1
fi

# Execute Windows installation
report_progress "install_start" "running" "Starting Windows installation process"
if ./windows_install; then
    report_progress "install_complete" "running" "Windows installation completed, preparing reboot"
else
    report_progress "install_failed" "failed" "Windows installation process failed"
    exit 1
fi

# Final reboot to Windows
report_progress "reboot_start" "running" "Rebooting to Windows OS"
reboot -f >/dev/null 2>&1