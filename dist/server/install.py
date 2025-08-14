#!/usr/bin/env python3
"""
MyConfApp Server Installation Script
Enterprise Video Conferencing Server v1.0.0
"""

import os
import sys
import subprocess
import shutil
import platform
from pathlib import Path

class MyConfAppInstaller:
    def __init__(self):
        self.system = platform.system()
        self.install_dir = self.get_install_directory()
        self.service_name = "myconfapp-server"
        
    def get_install_directory(self):
        """Get appropriate installation directory based on OS"""
        if self.system == "Windows":
            return Path("C:/Program Files/MyConfApp Server")
        else:
            return Path("/opt/myconfapp-server")
    
    def check_requirements(self):
        """Check system requirements"""
        print("🔍 Checking system requirements...")
        
        # Check Python version
        if sys.version_info < (3, 8):
            print("❌ Python 3.8+ required. Current version:", sys.version)
            return False
            
        # Check available disk space (minimum 1GB)
        disk_usage = shutil.disk_usage(".")
        free_gb = disk_usage.free / (1024**3)
        if free_gb < 1:
            print(f"❌ Insufficient disk space. Need 1GB, have {free_gb:.1f}GB")
            return False
            
        print("✅ System requirements met")
        return True
    
    def create_directories(self):
        """Create installation directories"""
        print("📁 Creating installation directories...")
        
        directories = [
            self.install_dir,
            self.install_dir / "logs",
            self.install_dir / "recordings",
            self.install_dir / "config",
            self.install_dir / "backups"
        ]
        
        for directory in directories:
            directory.mkdir(parents=True, exist_ok=True)
            
        print("✅ Directories created")
    
    def install_dependencies(self):
        """Install Python dependencies"""
        print("📦 Installing Python dependencies...")
        
        try:
            subprocess.run([
                sys.executable, "-m", "pip", "install", "-r", "requirements.txt"
            ], check=True, cwd=".")
            print("✅ Dependencies installed")
            return True
        except subprocess.CalledProcessError as e:
            print(f"❌ Failed to install dependencies: {e}")
            return False
    
    def copy_files(self):
        """Copy application files to installation directory"""
        print("📋 Copying application files...")
        
        files_to_copy = [
            "main.py",
            "admin_server.py",
            "requirements.txt"
        ]
        
        directories_to_copy = [
            "templates",
            "admin_templates", 
            "static",
            "config"
        ]
        
        # Copy files
        for file in files_to_copy:
            if os.path.exists(file):
                shutil.copy2(file, self.install_dir)
        
        # Copy directories
        for directory in directories_to_copy:
            if os.path.exists(directory):
                dest_dir = self.install_dir / directory
                if dest_dir.exists():
                    shutil.rmtree(dest_dir)
                shutil.copytree(directory, dest_dir)
        
        print("✅ Files copied")
    
    def create_config(self):
        """Create configuration files"""
        print("⚙️ Creating configuration...")
        
        config_content = """# MyConfApp Server Configuration
# Production Environment Settings

# Server Settings
HOST=0.0.0.0
PORT=8000
ADMIN_PORT=5001
DEBUG=False

# Security
SECRET_KEY=change-this-secret-key-in-production
JWT_SECRET=change-this-jwt-secret-in-production
ALLOWED_ORIGINS=*

# Features
MAX_ROOM_PARTICIPANTS=50
ENABLE_RECORDING=True
ENABLE_ANALYTICS=True

# Logging
LOG_LEVEL=INFO
LOG_FILE=/var/log/myconfapp/server.log

# Database (Optional - leave empty for file-based storage)
DATABASE_URL=

# Email Settings (Optional)
SMTP_SERVER=
SMTP_PORT=587
SMTP_USERNAME=
SMTP_PASSWORD=
"""
        
        config_file = self.install_dir / "config" / "production.env"
        with open(config_file, "w") as f:
            f.write(config_content)
        
        print("✅ Configuration created")
    
    def create_service(self):
        """Create system service"""
        print("🔧 Setting up system service...")
        
        if self.system == "Linux":
            self.create_systemd_service()
        elif self.system == "Windows":
            self.create_windows_service()
        else:
            print("⚠️ Service creation not supported on this OS")
    
    def create_systemd_service(self):
        """Create systemd service for Linux"""
        service_content = f"""[Unit]
Description=MyConfApp Video Conferencing Server
After=network.target

[Service]
Type=simple
User=myconfapp
WorkingDirectory={self.install_dir}
ExecStart={sys.executable} main.py
Restart=always
RestartSec=3
Environment=PYTHONPATH={self.install_dir}
EnvironmentFile={self.install_dir}/config/production.env

[Install]
WantedBy=multi-user.target
"""
        
        service_file = Path(f"/etc/systemd/system/{self.service_name}.service")
        try:
            with open(service_file, "w") as f:
                f.write(service_content)
            
            subprocess.run(["systemctl", "daemon-reload"], check=True)
            subprocess.run(["systemctl", "enable", self.service_name], check=True)
            print("✅ Systemd service created")
        except (PermissionError, subprocess.CalledProcessError):
            print("⚠️ Service creation requires sudo privileges")
    
    def create_windows_service(self):
        """Create Windows service"""
        print("⚠️ Windows service creation requires additional setup")
        print("Please use the provided batch scripts to install as a service")
    
    def create_startup_scripts(self):
        """Create startup scripts"""
        print("📜 Creating startup scripts...")
        
        if self.system == "Windows":
            startup_script = self.install_dir / "start_server.bat"
            with open(startup_script, "w") as f:
                f.write(f"""@echo off
cd /d "{self.install_dir}"
python main.py
pause
""")
        else:
            startup_script = self.install_dir / "start_server.sh"
            with open(startup_script, "w") as f:
                f.write(f"""#!/bin/bash
cd "{self.install_dir}"
python3 main.py
""")
            os.chmod(startup_script, 0o755)
        
        print("✅ Startup scripts created")
    
    def run_tests(self):
        """Run basic functionality tests"""
        print("🧪 Running installation tests...")
        
        try:
            # Test import of main modules
            sys.path.insert(0, str(self.install_dir))
            import main
            print("✅ Server modules load successfully")
            return True
        except ImportError as e:
            print(f"❌ Module import test failed: {e}")
            return False
    
    def install(self):
        """Run complete installation"""
        print("🚀 MyConfApp Server Installation")
        print("=" * 50)
        
        steps = [
            ("Checking requirements", self.check_requirements),
            ("Creating directories", self.create_directories),
            ("Installing dependencies", self.install_dependencies),
            ("Copying files", self.copy_files),
            ("Creating configuration", self.create_config),
            ("Creating startup scripts", self.create_startup_scripts),
            ("Running tests", self.run_tests)
        ]
        
        for step_name, step_func in steps:
            print(f"\n📋 {step_name}...")
            if not step_func():
                print(f"❌ Installation failed at: {step_name}")
                return False
        
        print("\n🎉 Installation completed successfully!")
        print(f"📁 Installation directory: {self.install_dir}")
        print(f"🔧 Configuration file: {self.install_dir}/config/production.env")
        print(f"📜 Startup script: {self.install_dir}/start_server.{'bat' if self.system == 'Windows' else 'sh'}")
        print("\n📋 Next steps:")
        print("1. Edit the configuration file with your settings")
        print("2. Run the startup script to start the server")
        print("3. Access the admin panel at http://localhost:5001")
        print("4. Access the main application at http://localhost:8000")
        
        return True

def main():
    installer = MyConfAppInstaller()
    
    if len(sys.argv) > 1 and sys.argv[1] == "--uninstall":
        print("🗑️ Uninstallation not implemented yet")
        return
    
    try:
        installer.install()
    except KeyboardInterrupt:
        print("\n❌ Installation cancelled by user")
    except Exception as e:
        print(f"\n❌ Installation failed with error: {e}")

if __name__ == "__main__":
    main()
