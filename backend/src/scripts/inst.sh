#!/bin/bash

# Windows Installation Script for XME Projects
# This script handles the complete Windows installation process with progress reporting

# Configuration variables (will be replaced by the backend)
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
    
    # Send progress update to server
    curl -s -X POST "$PROGRESS_ENDPOINT" \
        -H "Content-Type: application/json" \
        -d "{\"step\": \"$step\", \"status\": \"$status\", \"message\": \"$message\", \"installId\": $INSTALL_ID}" \
        > /dev/null 2>&1 || true
}

# Error handling function
handle_error() {
    local step="$1"
    local error_message="$2"
    
    report_progress "$step" "failed" "$error_message"
    echo "Error: $error_message" >&2
    exit 1
}

# Main installation process
main() {
    # Report script start
    report_progress "script_start" "running" "Installation script started"
    
    # Step 1: Download Windows installation files
    report_progress "download_start" "running" "Starting download of Windows installation files"
    
    if ! wget -O /tmp/install.gz "$tmpTARGET"; then
        handle_error "download_failed" "Failed to download Windows installation files"
    fi
    
    report_progress "download_complete" "running" "Windows installation files downloaded successfully"
    
    # Step 2: Extract and prepare installation
    cd /tmp || handle_error "cd_failed" "Failed to change to /tmp directory"
    
    if ! gzip -d install.gz; then
        handle_error "extract_failed" "Failed to extract installation files"
    fi
    
    if ! chmod +x install; then
        handle_error "chmod_failed" "Failed to set execute permissions"
    fi
    
    report_progress "extract_complete" "running" "Installation files extracted and prepared"
    
    # Step 3: Execute Windows installation
    report_progress "install_start" "running" "Starting Windows installation process"
    
    if ! ./install; then
        handle_error "install_failed" "Windows installation process failed"
    fi
    
    report_progress "install_complete" "running" "Windows installation completed, preparing for reboot"
    
    # Step 4: Final reboot to Windows
    report_progress "rebooting" "running" "Rebooting to Windows - installation will complete after reboot"
    
    # Force reboot to Windows
    reboot -f >/dev/null 2>&1
}

# Execute main function
main "$@"