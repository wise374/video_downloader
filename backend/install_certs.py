import os
import ssl
import certifi
import subprocess
import sys
import pip

def install_certificates():
    print("Installing required certificates...")
    
    # Install/upgrade required packages
    packages = [
        'certifi',
        'yt-dlp',
        'requests',
        'urllib3'
    ]
    
    for package in packages:
        print(f"Installing/upgrading {package}...")
        pip.main(['install', '--upgrade', package])
    
    # Get the path to the certificates
    cert_path = certifi.where()
    print(f"Certificate path: {cert_path}")
    
    # Set the SSL certificate path
    os.environ['SSL_CERT_FILE'] = cert_path
    os.environ['REQUESTS_CA_BUNDLE'] = cert_path
    
    # Create a test SSL context to verify certificates
    try:
        ssl_context = ssl.create_default_context(cafile=cert_path)
        print("SSL certificates verified successfully!")
    except Exception as e:
        print(f"Error verifying SSL certificates: {e}")
        return False
    
    print("\nCertificate installation completed!")
    print("\nPlease restart your Python application for the changes to take effect.")
    return True

if __name__ == "__main__":
    install_certificates() 