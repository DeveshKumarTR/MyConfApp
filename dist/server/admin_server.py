"""
Teams Clone Administrator Dashboard
Port: 5001
Username: administrator
Password: password
"""

from fastapi import FastAPI, Request, HTTPException, Depends, Form
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from fastapi.security import HTTPBasic, HTTPBasicCredentials
import secrets
import uvicorn
from datetime import datetime
import json
import os
from typing import List, Dict, Any
import asyncio
import websockets
import socketio

# Initialize FastAPI app
app = FastAPI(title="Teams Clone Admin Dashboard", version="1.0.0")

# Security
security = HTTPBasic()

# Admin credentials
ADMIN_USERNAME = "administrator"
ADMIN_PASSWORD = "password"

# Templates and static files
templates = Jinja2Templates(directory="admin_templates")
app.mount("/static", StaticFiles(directory="static"), name="static")

# Global data store for admin dashboard
admin_data = {
    "active_rooms": {},
    "total_users": 0,
    "total_meetings": 0,
    "server_stats": {
        "uptime": datetime.now(),
        "total_connections": 0,
        "active_connections": 0
    },
    "scheduled_meetings": [],
    "recordings": [],
    "user_activities": []
}

def verify_admin(credentials: HTTPBasicCredentials = Depends(security)):
    """Verify admin credentials"""
    is_correct_username = secrets.compare_digest(credentials.username, ADMIN_USERNAME)
    is_correct_password = secrets.compare_digest(credentials.password, ADMIN_PASSWORD)
    
    if not (is_correct_username and is_correct_password):
        raise HTTPException(
            status_code=401,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials.username

@app.get("/", response_class=HTMLResponse)
async def admin_dashboard(request: Request, admin: str = Depends(verify_admin)):
    """Main admin dashboard"""
    
    # Calculate statistics
    stats = {
        "total_rooms": len(admin_data["active_rooms"]),
        "total_users": admin_data["total_users"],
        "total_meetings": admin_data["total_meetings"],
        "active_connections": admin_data["server_stats"]["active_connections"],
        "uptime": datetime.now() - admin_data["server_stats"]["uptime"],
        "scheduled_meetings": len(admin_data["scheduled_meetings"]),
        "recordings": len(admin_data["recordings"])
    }
    
    return templates.TemplateResponse("admin_dashboard.html", {
        "request": request,
        "admin_user": admin,
        "stats": stats,
        "active_rooms": admin_data["active_rooms"],
        "recent_activities": admin_data["user_activities"][-10:],  # Last 10 activities
        "scheduled_meetings": admin_data["scheduled_meetings"]
    })

@app.get("/rooms", response_class=HTMLResponse)
async def manage_rooms(request: Request, admin: str = Depends(verify_admin)):
    """Room management page"""
    return templates.TemplateResponse("admin_rooms.html", {
        "request": request,
        "admin_user": admin,
        "active_rooms": admin_data["active_rooms"]
    })

@app.get("/users", response_class=HTMLResponse)
async def manage_users(request: Request, admin: str = Depends(verify_admin)):
    """User management page"""
    return templates.TemplateResponse("admin_users.html", {
        "request": request,
        "admin_user": admin,
        "user_activities": admin_data["user_activities"]
    })

@app.get("/meetings", response_class=HTMLResponse)
async def manage_meetings(request: Request, admin: str = Depends(verify_admin)):
    """Meeting management page"""
    return templates.TemplateResponse("admin_meetings.html", {
        "request": request,
        "admin_user": admin,
        "scheduled_meetings": admin_data["scheduled_meetings"],
        "recordings": admin_data["recordings"]
    })

@app.get("/analytics", response_class=HTMLResponse)
async def analytics(request: Request, admin: str = Depends(verify_admin)):
    """Analytics and reports page"""
    
    # Generate analytics data
    analytics_data = {
        "daily_users": generate_daily_stats(),
        "room_usage": generate_room_usage_stats(),
        "peak_hours": generate_peak_hours_stats(),
        "feature_usage": generate_feature_usage_stats()
    }
    
    return templates.TemplateResponse("admin_analytics.html", {
        "request": request,
        "admin_user": admin,
        "analytics": analytics_data
    })

# API Endpoints for admin actions
@app.post("/api/rooms/{room_id}/close")
async def close_room(room_id: str, admin: str = Depends(verify_admin)):
    """Close a specific room"""
    if room_id in admin_data["active_rooms"]:
        del admin_data["active_rooms"][room_id]
        
        # Log admin action
        admin_data["user_activities"].append({
            "timestamp": datetime.now().isoformat(),
            "admin": admin,
            "action": "closed_room",
            "room_id": room_id
        })
        
        return {"success": True, "message": f"Room {room_id} closed"}
    else:
        raise HTTPException(status_code=404, detail="Room not found")

@app.post("/api/users/{user_id}/disconnect")
async def disconnect_user(user_id: str, admin: str = Depends(verify_admin)):
    """Disconnect a specific user"""
    
    # Log admin action
    admin_data["user_activities"].append({
        "timestamp": datetime.now().isoformat(),
        "admin": admin,
        "action": "disconnected_user",
        "user_id": user_id
    })
    
    return {"success": True, "message": f"User {user_id} disconnected"}

@app.post("/api/meetings/{meeting_id}/cancel")
async def cancel_meeting(meeting_id: str, admin: str = Depends(verify_admin)):
    """Cancel a scheduled meeting"""
    
    # Find and remove meeting
    admin_data["scheduled_meetings"] = [
        m for m in admin_data["scheduled_meetings"] 
        if m.get("id") != meeting_id
    ]
    
    # Log admin action
    admin_data["user_activities"].append({
        "timestamp": datetime.now().isoformat(),
        "admin": admin,
        "action": "cancelled_meeting",
        "meeting_id": meeting_id
    })
    
    return {"success": True, "message": f"Meeting {meeting_id} cancelled"}

@app.get("/api/stats")
async def get_stats(admin: str = Depends(verify_admin)):
    """Get real-time statistics"""
    
    stats = {
        "total_rooms": len(admin_data["active_rooms"]),
        "total_users": admin_data["total_users"],
        "active_connections": admin_data["server_stats"]["active_connections"],
        "scheduled_meetings": len(admin_data["scheduled_meetings"]),
        "recordings": len(admin_data["recordings"]),
        "uptime_seconds": (datetime.now() - admin_data["server_stats"]["uptime"]).total_seconds()
    }
    
    return stats

@app.post("/api/broadcast")
async def broadcast_message(
    message: str = Form(...),
    admin: str = Depends(verify_admin)
):
    """Broadcast message to all users"""
    
    # Log admin action
    admin_data["user_activities"].append({
        "timestamp": datetime.now().isoformat(),
        "admin": admin,
        "action": "broadcast_message",
        "message": message
    })
    
    # In a real implementation, this would send the message to all connected clients
    return {"success": True, "message": "Broadcast sent successfully"}

# Utility functions for analytics
def generate_daily_stats():
    """Generate daily user statistics"""
    return {
        "labels": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        "data": [45, 52, 38, 61, 78, 35, 42]  # Sample data
    }

def generate_room_usage_stats():
    """Generate room usage statistics"""
    return {
        "labels": ["Video Calls", "Screen Share", "File Share", "Chat Only"],
        "data": [65, 45, 30, 55]  # Sample data
    }

def generate_peak_hours_stats():
    """Generate peak hours statistics"""
    return {
        "labels": ["00:00", "04:00", "08:00", "12:00", "16:00", "20:00"],
        "data": [5, 2, 35, 65, 45, 25]  # Sample data
    }

def generate_feature_usage_stats():
    """Generate feature usage statistics"""
    return {
        "recording": 75,
        "screen_sharing": 85,
        "file_sharing": 60,
        "chat": 95,
        "scheduling": 40
    }

# Update admin data from main server (this would be called by the main server)
def update_admin_data(room_data: Dict[str, Any]):
    """Update admin dashboard with data from main server"""
    admin_data.update(room_data)

if __name__ == "__main__":
    print("🔧 Starting Teams Clone Administrator Dashboard...")
    print("🌐 Dashboard URL: http://localhost:5001")
    print("👤 Username: administrator")
    print("🔑 Password: password")
    print("=" * 50)
    
    uvicorn.run(
        "admin_server:app",
        host="0.0.0.0",
        port=5001,
        reload=True,
        log_level="info"
    )
