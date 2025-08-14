"""
Microsoft Teams-like Application Server
A real-time communication platform with WebSocket support and full WebRTC functionality
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
import socketio
import json
import uuid
from typing import Dict, List, Optional
from datetime import datetime, timedelta
import asyncio
import logging
from pydantic import BaseModel

# Create FastAPI app
app = FastAPI(title="Teams Clone", description="A Microsoft Teams-like application with full WebRTC support")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Socket.IO server with CORS
sio = socketio.AsyncServer(
    async_mode='asgi', 
    cors_allowed_origins='*',
    logger=True,
    engineio_logger=True
)
socket_app = socketio.ASGIApp(sio, app)

# Templates
templates = Jinja2Templates(directory="templates")

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Data models
class RoomInfo(BaseModel):
    id: str
    name: str
    created_at: datetime
    participants: List[str]
    is_active: bool

class UserInfo(BaseModel):
    id: str
    username: str
    room_id: Optional[str]
    joined_at: datetime
    is_video_enabled: bool = True
    is_audio_enabled: bool = True

class CallSignal(BaseModel):
    type: str
    data: dict
    from_user: str
    to_user: Optional[str] = None
    room_id: str

# In-memory storage (replace with database in production)
rooms: Dict[str, RoomInfo] = {}
users: Dict[str, UserInfo] = {}
user_sessions: Dict[str, str] = {}  # session_id -> user_id
room_participants: Dict[str, List[str]] = {}  # room_id -> [user_ids]

# Enhanced Connection Manager with WebRTC support
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}  # user_id -> websocket
        self.room_connections: Dict[str, List[str]] = {}    # room_id -> [user_ids]
        self.webrtc_signals: Dict[str, List[dict]] = {}     # room_id -> [signals]

    async def connect(self, websocket: WebSocket, user_id: str, room_id: str = None):
        await websocket.accept()
        self.active_connections[user_id] = websocket
        
        if room_id:
            if room_id not in self.room_connections:
                self.room_connections[room_id] = []
            if user_id not in self.room_connections[room_id]:
                self.room_connections[room_id].append(user_id)

    def disconnect(self, user_id: str, room_id: str = None):
        if user_id in self.active_connections:
            del self.active_connections[user_id]
        
        if room_id and room_id in self.room_connections:
            if user_id in self.room_connections[room_id]:
                self.room_connections[room_id].remove(user_id)

    async def send_personal_message(self, message: str, user_id: str):
        if user_id in self.active_connections:
            try:
                await self.active_connections[user_id].send_text(message)
            except:
                pass

    async def broadcast_to_room(self, message: str, room_id: str, exclude_user: str = None):
        if room_id in self.room_connections:
            for user_id in self.room_connections[room_id]:
                if exclude_user and user_id == exclude_user:
                    continue
                if user_id in self.active_connections:
                    try:
                        await self.active_connections[user_id].send_text(message)
                    except:
                        pass

    async def broadcast(self, message: str):
        for user_id, connection in self.active_connections.items():
            try:
                await connection.send_text(message)
            except:
                pass

    def get_room_participants(self, room_id: str) -> List[str]:
        return self.room_connections.get(room_id, [])

manager = ConnectionManager()

@app.get("/", response_class=HTMLResponse)
async def get_home(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/room/{room_id}", response_class=HTMLResponse)
async def get_room(request: Request, room_id: str):
    return templates.TemplateResponse("room.html", {"request": request, "room_id": room_id})

@app.websocket("/ws/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str):
    await manager.connect(websocket, room_id)
    try:
        while True:
            data = await websocket.receive_text()
            message_data = json.loads(data)
            
            # Handle different message types
            if message_data["type"] == "message":
                # Broadcast message to room
                broadcast_message = {
                    "type": "message",
                    "user": message_data["user"],
                    "message": message_data["message"],
                    "timestamp": datetime.now().isoformat(),
                    "room_id": room_id
                }
                await manager.broadcast_to_room(json.dumps(broadcast_message), room_id)
            
            elif message_data["type"] == "user_joined":
                # Notify room about new user
                join_message = {
                    "type": "user_joined",
                    "user": message_data["user"],
                    "timestamp": datetime.now().isoformat(),
                    "room_id": room_id
                }
                await manager.broadcast_to_room(json.dumps(join_message), room_id)
                
    except WebSocketDisconnect:
        manager.disconnect(websocket, room_id)

# Enhanced Socket.IO events for full Teams functionality
@sio.event
async def connect(sid, environ):
    print(f"Client {sid} connected")
    await sio.emit('connected', {'status': 'connected'}, room=sid)

@sio.event
async def disconnect(sid):
    print(f"Client {sid} disconnected")
    # Clean up user session
    for user_id, session_id in user_sessions.items():
        if session_id == sid:
            # Remove from room participants
            user = users.get(user_id)
            if user and user.room_id:
                if user.room_id in room_participants:
                    if user_id in room_participants[user.room_id]:
                        room_participants[user.room_id].remove(user_id)
                    
                    # Notify others in room
                    await sio.emit('user_left', {
                        'user_id': user_id,
                        'username': user.username,
                        'timestamp': datetime.now().isoformat()
                    }, room=user.room_id)
            
            # Clean up
            if user_id in users:
                del users[user_id]
            del user_sessions[user_id]
            break

@sio.event
async def join_room(sid, data):
    room_id = data['room_id']
    username = data['username']
    user_id = data.get('user_id', str(uuid.uuid4()))
    
    print(f"User {username} ({user_id}) attempting to join room {room_id}")
    
    # Create or get room
    if room_id not in rooms:
        rooms[room_id] = RoomInfo(
            id=room_id,
            name=f"Room {room_id[:8]}",
            created_at=datetime.now(),
            participants=[],
            is_active=True
        )
        print(f"Created new room: {room_id}")
    
    # Check if user is already in the room (reconnection case)
    existing_user = None
    for existing_user_id, existing_user in users.items():
        if existing_user.username == username and existing_user.room_id == room_id:
            existing_user = existing_user
            user_id = existing_user_id  # Use existing user ID
            break
    
    # Create or update user
    user = UserInfo(
        id=user_id,
        username=username,
        room_id=room_id,
        joined_at=datetime.now() if not existing_user else existing_user.joined_at
    )
    
    users[user_id] = user
    user_sessions[user_id] = sid
    
    # Add to room participants
    if room_id not in room_participants:
        room_participants[room_id] = []
    if user_id not in room_participants[room_id]:
        room_participants[room_id].append(user_id)
    
    # Join socket room
    await sio.enter_room(sid, room_id)
    
    # Get current participants (excluding the current user for proper peer connections)
    participants = []
    other_participants = []
    
    for participant_id in room_participants[room_id]:
        participant = users.get(participant_id)
        if participant:
            participant_data = {
                'user_id': participant_id,
                'username': participant.username,
                'is_video_enabled': participant.is_video_enabled,
                'is_audio_enabled': participant.is_audio_enabled,
                'joined_at': participant.joined_at.isoformat()
            }
            participants.append(participant_data)
            
            # Collect other participants for WebRTC connections
            if participant_id != user_id:
                other_participants.append(participant_data)
    
    print(f"Room {room_id} now has {len(participants)} participants: {[p['username'] for p in participants]}")
    
    # Send room join confirmation to the new user with all current participants
    await sio.emit('room_joined', {
        'user_id': user_id,
        'room_id': room_id,
        'participants': participants,  # All participants including self
        'other_participants': other_participants  # Other participants for WebRTC
    }, to=sid)
    
    # Notify existing participants about the new user (excluding the new user)
    if len(other_participants) > 0:
        await sio.emit('user_joined', {
            'user_id': user_id,
            'username': username,
            'timestamp': datetime.now().isoformat(),
            'room_id': room_id
        }, room=room_id, skip_sid=sid)
    
    print(f"User {username} successfully joined room {room_id}")
    
    # Update room's participant list in the rooms dictionary
    rooms[room_id].participants = participants

@sio.event
async def leave_room(sid, data):
    room_id = data.get('room_id') or data.get('room')  # Handle both formats
    user_id = data.get('user_id')
    username = data.get('username', 'Unknown')
    
    await sio.leave_room(sid, room_id)
    
    # Remove from participants
    if room_id in room_participants and user_id in room_participants[room_id]:
        room_participants[room_id].remove(user_id)
    
    # Get user info for notification
    if not username or username == 'Unknown':
        user = users.get(user_id)
        username = user.username if user else "Unknown"
    
    # Notify others
    await sio.emit('user_left', {
        'user_id': user_id,
        'username': username,
        'timestamp': datetime.now().isoformat()
    }, room=room_id)
    
    # Clean up
    if user_id in users:
        del users[user_id]

@sio.event
async def start_recording(sid, data):
    room_id = data['room_id']
    user_id = data['user_id']
    username = data['username']
    
    # Notify all participants that recording started
    await sio.emit('recording_started', {
        'user_id': user_id,
        'username': username,
        'timestamp': datetime.now().isoformat()
    }, room=room_id)

@sio.event
async def stop_recording(sid, data):
    room_id = data['room_id']
    user_id = data['user_id']
    username = data['username']
    
    # Notify all participants that recording stopped
    await sio.emit('recording_stopped', {
        'user_id': user_id,
        'username': username,
        'timestamp': datetime.now().isoformat()
    }, room=room_id)

@sio.event
async def request_participants_list(sid, data):
    room_id = data['room_id']
    
    participants = []
    if room_id in room_participants:
        for participant_id in room_participants[room_id]:
            participant = users.get(participant_id)
            if participant:
                participants.append({
                    'user_id': participant_id,
                    'username': participant.username,
                    'is_video_enabled': participant.is_video_enabled,
                    'is_audio_enabled': participant.is_audio_enabled,
                    'joined_at': participant.joined_at.isoformat()
                })
    
    await sio.emit('participants_list', {
        'participants': participants
    }, to=sid)

@sio.event
async def mute_participant(sid, data):
    room_id = data['room_id']
    target_user_id = data['target_user_id']
    muted_by = data['muted_by']
    
    # Notify the target user and others
    await sio.emit('participant_muted', {
        'target_user_id': target_user_id,
        'muted_by': muted_by,
        'timestamp': datetime.now().isoformat()
    }, room=room_id)

@sio.event
async def update_settings(sid, data):
    user_id = data['user_id']
    settings = data['settings']
    
    # Store user settings (in production, save to database)
    await sio.emit('settings_updated', {
        'user_id': user_id,
        'settings': settings
    }, to=sid)
    if user_id in user_sessions:
        del user_sessions[user_id]

@sio.event
async def send_message(sid, data):
    room_id = data['room_id']
    user_id = data['user_id']
    message = data['message']
    
    user = users.get(user_id)
    if not user:
        return
    
    message_data = {
        'user_id': user_id,
        'username': user.username,
        'message': message,
        'timestamp': datetime.now().isoformat(),
        'type': 'chat'
    }
    
    await sio.emit('receive_message', message_data, room=room_id)

# WebRTC Signaling Events
@sio.event
async def webrtc_offer(sid, data):
    """Handle WebRTC offer"""
    room_id = data['room_id']
    from_user = data['from_user']
    to_user = data['to_user']
    offer = data['offer']
    
    # Forward offer to specific user
    target_session = user_sessions.get(to_user)
    if target_session:
        await sio.emit('webrtc_offer', {
            'from_user': from_user,
            'offer': offer,
            'room_id': room_id
        }, room=target_session)

@sio.event
async def webrtc_answer(sid, data):
    """Handle WebRTC answer"""
    room_id = data['room_id']
    from_user = data['from_user']
    to_user = data['to_user']
    answer = data['answer']
    
    # Forward answer to specific user
    target_session = user_sessions.get(to_user)
    if target_session:
        await sio.emit('webrtc_answer', {
            'from_user': from_user,
            'answer': answer,
            'room_id': room_id
        }, room=target_session)

@sio.event
async def webrtc_ice_candidate(sid, data):
    """Handle ICE candidate"""
    room_id = data['room_id']
    from_user = data['from_user']
    to_user = data['to_user']
    candidate = data['candidate']
    
    # Forward ICE candidate to specific user
    target_session = user_sessions.get(to_user)
    if target_session:
        await sio.emit('webrtc_ice_candidate', {
            'from_user': from_user,
            'candidate': candidate,
            'room_id': room_id
        }, room=target_session)

@sio.event
async def toggle_video(sid, data):
    """Handle video toggle"""
    user_id = data['user_id']
    room_id = data['room_id']
    is_enabled = data['is_enabled']
    
    # Update user state
    if user_id in users:
        users[user_id].is_video_enabled = is_enabled
    
    # Notify room
    await sio.emit('user_video_toggle', {
        'user_id': user_id,
        'is_enabled': is_enabled
    }, room=room_id, skip_sid=sid)

@sio.event
async def toggle_audio(sid, data):
    """Handle audio toggle"""
    user_id = data['user_id']
    room_id = data['room_id']
    is_enabled = data['is_enabled']
    
    # Update user state
    if user_id in users:
        users[user_id].is_audio_enabled = is_enabled
    
    # Notify room
    await sio.emit('user_audio_toggle', {
        'user_id': user_id,
        'is_enabled': is_enabled
    }, room=room_id, skip_sid=sid)

@sio.event
async def screen_share_start(sid, data):
    """Handle screen share start"""
    room_id = data['room_id']
    user_id = data['user_id']
    
    await sio.emit('screen_share_started', {
        'user_id': user_id,
        'username': users[user_id].username if user_id in users else 'Unknown'
    }, room=room_id, skip_sid=sid)

@sio.event
async def screen_share_stop(sid, data):
    """Handle screen share stop"""
    room_id = data['room_id']
    user_id = data['user_id']
    
    await sio.emit('screen_share_stopped', {
        'user_id': user_id
    }, room=room_id, skip_sid=sid)

# File sharing events
@sio.event
async def file_share(sid, data):
    """Handle file sharing"""
    room_id = data['room_id']
    user_id = data['user_id']
    file_info = data['file_info']
    
    user = users.get(user_id)
    if not user:
        return
    
    await sio.emit('file_shared', {
        'user_id': user_id,
        'username': user.username,
        'file_info': file_info,
        'timestamp': datetime.now().isoformat()
    }, room=room_id)

# Enhanced API Routes
@app.get("/", response_class=HTMLResponse)
async def get_home(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/room/{room_id}", response_class=HTMLResponse)
async def get_room(request: Request, room_id: str):
    return templates.TemplateResponse("room.html", {"request": request, "room_id": room_id})

@app.post("/api/rooms")
async def create_room():
    room_id = str(uuid.uuid4())
    room = RoomInfo(
        id=room_id,
        name=f"Room {room_id[:8]}",
        created_at=datetime.now(),
        participants=[],
        is_active=True
    )
    rooms[room_id] = room
    room_participants[room_id] = []
    
    return {"room_id": room_id, "room_name": room.name}

@app.get("/api/rooms/{room_id}")
async def get_room_info(room_id: str):
    if room_id in rooms:
        room = rooms[room_id]
        participants = []
        
        # Get participant details
        for user_id in room_participants.get(room_id, []):
            user = users.get(user_id)
            if user:
                participants.append({
                    "user_id": user_id,
                    "username": user.username,
                    "joined_at": user.joined_at.isoformat(),
                    "is_video_enabled": user.is_video_enabled,
                    "is_audio_enabled": user.is_audio_enabled
                })
        
        return {
            "room_id": room.id,
            "name": room.name,
            "created_at": room.created_at.isoformat(),
            "participants": participants,
            "participant_count": len(participants),
            "is_active": room.is_active
        }
    
    raise HTTPException(status_code=404, detail="Room not found")

@app.get("/api/rooms")
async def list_rooms():
    active_rooms = []
    for room_id, room in rooms.items():
        if room.is_active:
            participant_count = len(room_participants.get(room_id, []))
            active_rooms.append({
                "room_id": room.id,
                "name": room.name,
                "created_at": room.created_at.isoformat(),
                "participant_count": participant_count
            })
    
    return {"rooms": active_rooms}

@app.delete("/api/rooms/{room_id}")
async def delete_room(room_id: str):
    if room_id not in rooms:
        raise HTTPException(status_code=404, detail="Room not found")
    
    # Notify all participants
    await sio.emit('room_closed', {'room_id': room_id}, room=room_id)
    
    # Clean up
    if room_id in rooms:
        del rooms[room_id]
    if room_id in room_participants:
        del room_participants[room_id]
    
    return {"message": "Room deleted successfully"}

@app.get("/api/users/{user_id}")
async def get_user_info(user_id: str):
    if user_id not in users:
        raise HTTPException(status_code=404, detail="User not found")
    
    user = users[user_id]
    return {
        "user_id": user.id,
        "username": user.username,
        "room_id": user.room_id,
        "joined_at": user.joined_at.isoformat(),
        "is_video_enabled": user.is_video_enabled,
        "is_audio_enabled": user.is_audio_enabled
    }

# Health check endpoint
@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "active_rooms": len(rooms),
        "active_users": len(users)
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(socket_app, host="0.0.0.0", port=8000)
