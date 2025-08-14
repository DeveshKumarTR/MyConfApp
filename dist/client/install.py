#!/usr/bin/env python3
"""
MyConfApp Client Installation Script
Professional Video Conferencing Desktop Client
"""

import os
import sys
import json
import subprocess
import platform
import shutil
import urllib.request
import zipfile
import tempfile
from pathlib import Path

class ClientInstaller:
    def __init__(self):
        self.platform = platform.system().lower()
        self.arch = 'x64' if platform.machine().endswith('64') else 'x86'
        self.version = "1.0.0"
        self.app_name = "MyConfApp Client"
        self.install_dir = self.get_install_directory()
        
    def get_install_directory(self):
        """Get the appropriate installation directory for the platform"""
        if self.platform == 'windows':
            return Path(os.environ.get('PROGRAMFILES', 'C:\\Program Files')) / 'MyConfApp'
        elif self.platform == 'darwin':
            return Path('/Applications/MyConfApp.app')
        else:  # Linux
            return Path('/opt/myconfapp')
    
    def check_prerequisites(self):
        """Check if all prerequisites are installed"""
        print("🔍 Checking prerequisites...")
        
        # Check Node.js
        try:
            result = subprocess.run(['node', '--version'], 
                                  capture_output=True, text=True)
            if result.returncode == 0:
                node_version = result.stdout.strip()
                print(f"  ✅ Node.js {node_version}")
            else:
                raise Exception("Node.js not found")
        except:
            print("  ❌ Node.js is required but not installed")
            print("     Please install Node.js from https://nodejs.org/")
            return False
        
        # Check npm
        try:
            result = subprocess.run(['npm', '--version'], 
                                  capture_output=True, text=True)
            if result.returncode == 0:
                npm_version = result.stdout.strip()
                print(f"  ✅ npm {npm_version}")
            else:
                raise Exception("npm not found")
        except:
            print("  ❌ npm is required but not installed")
            return False
        
        # Check available disk space (require at least 1GB)
        available_space = shutil.disk_usage('.').free / (1024**3)
        if available_space < 1:
            print(f"  ❌ Insufficient disk space. Required: 1GB, Available: {available_space:.1f}GB")
            return False
        else:
            print(f"  ✅ Disk space: {available_space:.1f}GB available")
        
        return True
    
    def install_dependencies(self):
        """Install Node.js dependencies"""
        print("📦 Installing dependencies...")
        
        try:
            # Install production dependencies
            subprocess.run(['npm', 'install', '--production'], 
                          check=True, cwd='.')
            print("  ✅ Dependencies installed")
            
            # Install electron prebuilt
            subprocess.run(['npm', 'install', 'electron', '--save-dev'], 
                          check=True, cwd='.')
            print("  ✅ Electron installed")
            
            return True
        except subprocess.CalledProcessError as e:
            print(f"  ❌ Failed to install dependencies: {e}")
            return False
    
    def build_application(self):
        """Build the Electron application"""
        print("🔨 Building application...")
        
        try:
            # Build for current platform
            build_command = ['npm', 'run', f'build-{self.get_npm_platform()}']
            subprocess.run(build_command, check=True, cwd='.')
            print("  ✅ Application built successfully")
            return True
        except subprocess.CalledProcessError as e:
            print(f"  ❌ Failed to build application: {e}")
            return False
    
    def get_npm_platform(self):
        """Get npm platform name"""
        if self.platform == 'windows':
            return 'win'
        elif self.platform == 'darwin':
            return 'mac'
        else:
            return 'linux'
    
    def create_shortcuts(self):
        """Create desktop and start menu shortcuts"""
        print("🔗 Creating shortcuts...")
        
        if self.platform == 'windows':
            self.create_windows_shortcuts()
        elif self.platform == 'darwin':
            self.create_macos_shortcuts()
        else:
            self.create_linux_shortcuts()
        
        print("  ✅ Shortcuts created")
    
    def create_windows_shortcuts(self):
        """Create Windows shortcuts"""
        try:
            # Desktop shortcut
            desktop = Path.home() / 'Desktop'
            shortcut_path = desktop / f'{self.app_name}.lnk'
            
            # Start menu shortcut
            start_menu = Path(os.environ.get('APPDATA', '')) / 'Microsoft' / 'Windows' / 'Start Menu' / 'Programs'
            start_menu_path = start_menu / f'{self.app_name}.lnk'
            
            # Create shortcut using PowerShell
            ps_script = f"""
$WshShell = New-Object -comObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("{shortcut_path}")
$Shortcut.TargetPath = "{self.install_dir / 'MyConfApp.exe'}"
$Shortcut.WorkingDirectory = "{self.install_dir}"
$Shortcut.Description = "Professional Video Conferencing Desktop Client"
$Shortcut.Save()

$Shortcut2 = $WshShell.CreateShortcut("{start_menu_path}")
$Shortcut2.TargetPath = "{self.install_dir / 'MyConfApp.exe'}"
$Shortcut2.WorkingDirectory = "{self.install_dir}"
$Shortcut2.Description = "Professional Video Conferencing Desktop Client"
$Shortcut2.Save()
"""
            
            subprocess.run(['powershell', '-Command', ps_script], check=True)
            
        except Exception as e:
            print(f"  ⚠️  Warning: Could not create shortcuts: {e}")
    
    def create_macos_shortcuts(self):
        """Create macOS shortcuts"""
        try:
            # Create symlink in Applications
            apps_dir = Path('/Applications')
            if apps_dir.exists():
                symlink_path = apps_dir / f'{self.app_name}.app'
                if symlink_path.exists():
                    symlink_path.unlink()
                symlink_path.symlink_to(self.install_dir)
        except Exception as e:
            print(f"  ⚠️  Warning: Could not create shortcuts: {e}")
    
    def create_linux_shortcuts(self):
        """Create Linux desktop entry"""
        try:
            desktop_entry = f"""[Desktop Entry]
Name={self.app_name}
Comment=Professional Video Conferencing Desktop Client
Exec={self.install_dir}/myconfapp
Icon={self.install_dir}/assets/icons/icon.png
Terminal=false
Type=Application
Categories=Network;AudioVideo;Office;
StartupWMClass=MyConfApp
"""
            
            # System-wide desktop entry
            desktop_file = Path('/usr/share/applications/myconfapp.desktop')
            if desktop_file.parent.exists():
                with open(desktop_file, 'w') as f:
                    f.write(desktop_entry)
                os.chmod(desktop_file, 0o644)
            
            # User desktop entry
            user_apps = Path.home() / '.local' / 'share' / 'applications'
            user_apps.mkdir(parents=True, exist_ok=True)
            user_desktop_file = user_apps / 'myconfapp.desktop'
            with open(user_desktop_file, 'w') as f:
                f.write(desktop_entry)
            os.chmod(user_desktop_file, 0o755)
            
        except Exception as e:
            print(f"  ⚠️  Warning: Could not create desktop entry: {e}")
    
    def configure_auto_start(self):
        """Configure application to start automatically"""
        print("⚙️  Configuring auto-start...")
        
        if self.platform == 'windows':
            self.configure_windows_autostart()
        elif self.platform == 'darwin':
            self.configure_macos_autostart()
        else:
            self.configure_linux_autostart()
        
        print("  ✅ Auto-start configured")
    
    def configure_windows_autostart(self):
        """Configure Windows auto-start"""
        try:
            import winreg
            key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, 
                               "Software\\Microsoft\\Windows\\CurrentVersion\\Run", 
                               0, winreg.KEY_SET_VALUE)
            winreg.SetValueEx(key, self.app_name, 0, winreg.REG_SZ, 
                            str(self.install_dir / 'MyConfApp.exe'))
            winreg.CloseKey(key)
        except ImportError:
            # Fallback using registry command
            subprocess.run([
                'reg', 'add', 
                'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
                '/v', self.app_name,
                '/t', 'REG_SZ',
                '/d', str(self.install_dir / 'MyConfApp.exe'),
                '/f'
            ], check=True)
        except Exception as e:
            print(f"  ⚠️  Warning: Could not configure auto-start: {e}")
    
    def configure_macos_autostart(self):
        """Configure macOS auto-start using LaunchAgent"""
        try:
            launch_agents = Path.home() / 'Library' / 'LaunchAgents'
            launch_agents.mkdir(parents=True, exist_ok=True)
            
            plist_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.myconfapp.client</string>
    <key>ProgramArguments</key>
    <array>
        <string>{self.install_dir}/Contents/MacOS/MyConfApp</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
</dict>
</plist>"""
            
            plist_file = launch_agents / 'com.myconfapp.client.plist'
            with open(plist_file, 'w') as f:
                f.write(plist_content)
            
        except Exception as e:
            print(f"  ⚠️  Warning: Could not configure auto-start: {e}")
    
    def configure_linux_autostart(self):
        """Configure Linux auto-start"""
        try:
            autostart_dir = Path.home() / '.config' / 'autostart'
            autostart_dir.mkdir(parents=True, exist_ok=True)
            
            desktop_entry = f"""[Desktop Entry]
Type=Application
Name={self.app_name}
Exec={self.install_dir}/myconfapp
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
"""
            
            autostart_file = autostart_dir / 'myconfapp.desktop'
            with open(autostart_file, 'w') as f:
                f.write(desktop_entry)
            os.chmod(autostart_file, 0o755)
            
        except Exception as e:
            print(f"  ⚠️  Warning: Could not configure auto-start: {e}")
    
    def create_uninstaller(self):
        """Create uninstaller script"""
        print("🗑️  Creating uninstaller...")
        
        uninstaller_content = f"""#!/usr/bin/env python3
\"\"\"
MyConfApp Client Uninstaller
\"\"\"

import os
import shutil
from pathlib import Path

def uninstall():
    print("Uninstalling {self.app_name}...")
    
    # Remove installation directory
    install_dir = Path("{self.install_dir}")
    if install_dir.exists():
        shutil.rmtree(install_dir)
        print(f"Removed installation directory: {{install_dir}}")
    
    # Remove shortcuts and desktop entries
    if "{self.platform}" == "windows":
        # Remove desktop shortcut
        desktop_shortcut = Path.home() / "Desktop" / "{self.app_name}.lnk"
        if desktop_shortcut.exists():
            desktop_shortcut.unlink()
        
        # Remove start menu shortcut
        start_menu = Path(os.environ.get('APPDATA', '')) / "Microsoft" / "Windows" / "Start Menu" / "Programs" / "{self.app_name}.lnk"
        if start_menu.exists():
            start_menu.unlink()
    
    elif "{self.platform}" == "linux":
        # Remove desktop entries
        desktop_files = [
            Path("/usr/share/applications/myconfapp.desktop"),
            Path.home() / ".local" / "share" / "applications" / "myconfapp.desktop",
            Path.home() / ".config" / "autostart" / "myconfapp.desktop"
        ]
        for desktop_file in desktop_files:
            if desktop_file.exists():
                desktop_file.unlink()
    
    print("✅ {self.app_name} has been uninstalled successfully!")

if __name__ == "__main__":
    uninstall()
"""
        
        uninstaller_path = self.install_dir / 'uninstall.py'
        with open(uninstaller_path, 'w') as f:
            f.write(uninstaller_content)
        os.chmod(uninstaller_path, 0o755)
        
        print("  ✅ Uninstaller created")
    
    def install(self):
        """Main installation process"""
        print(f"🚀 Installing {self.app_name} v{self.version}")
        print(f"   Platform: {self.platform} ({self.arch})")
        print(f"   Install Directory: {self.install_dir}")
        print()
        
        # Check prerequisites
        if not self.check_prerequisites():
            print("❌ Installation failed: Prerequisites not met")
            return False
        
        # Install dependencies
        if not self.install_dependencies():
            print("❌ Installation failed: Could not install dependencies")
            return False
        
        # Build application
        if not self.build_application():
            print("❌ Installation failed: Could not build application")
            return False
        
        # Create installation directory
        self.install_dir.mkdir(parents=True, exist_ok=True)
        
        # Copy built application
        dist_dir = Path('dist')
        if dist_dir.exists():
            print("📁 Copying application files...")
            shutil.copytree(dist_dir, self.install_dir, dirs_exist_ok=True)
            print("  ✅ Application files copied")
        
        # Create shortcuts
        self.create_shortcuts()
        
        # Configure auto-start (optional)
        try:
            self.configure_auto_start()
        except Exception as e:
            print(f"  ⚠️  Warning: Could not configure auto-start: {e}")
        
        # Create uninstaller
        self.create_uninstaller()
        
        print()
        print("🎉 Installation completed successfully!")
        print(f"   {self.app_name} is now installed at: {self.install_dir}")
        print("   You can launch it from your applications menu or desktop shortcut.")
        print()
        print("📚 Documentation: https://docs.myconfapp.com")
        print("🆘 Support: https://support.myconfapp.com")
        
        return True

def main():
    """Main entry point"""
    print("=" * 60)
    print("MyConfApp Client Professional Installation")
    print("=" * 60)
    
    installer = ClientInstaller()
    
    try:
        success = installer.install()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n❌ Installation cancelled by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Installation failed with error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
