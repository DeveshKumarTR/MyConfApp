# Microsoft Teams Clone - Full Featured

A comprehensive real-time communication platform built with Python, FastAPI, and WebRTC that provides complete Microsoft Teams-like functionality including video conferencing, screen sharing, file sharing, and real-time collaboration.

## 🚀 Enhanced Features

### Core Communication
- 🎥 **Full WebRTC Video Conferencing** - High-quality peer-to-peer video calls with multiple participants
- 🎤 **Crystal Clear Audio** - Enhanced audio with echo cancellation, noise suppression, and auto-gain control
- 💬 **Real-time Chat** - Instant messaging with typing indicators and emoji support
- 📁 **File Sharing** - Share files up to 10MB through WebRTC data channels
- 🔄 **Connection Recovery** - Automatic reconnection and ICE restart capabilities

### Advanced Video Features
- 🖥️ **Screen Sharing** - Full desktop sharing with high-quality streaming
- 📹 **Camera Controls** - Toggle video/audio with visual indicators
- 👥 **Dynamic Grid Layout** - Responsive video grid that adapts to participant count
- � **Picture-in-Picture** - Local video overlay for better user experience
- 📱 **Mobile Responsive** - Optimized for desktop, tablet, and mobile devices

### Collaboration Tools
- 👥 **Participant Management** - Real-time participant list with status indicators
- 🎯 **Room Management** - Create, join, and manage meeting rooms
- � **Connection Status** - Real-time connection quality indicators
- 🔔 **Smart Notifications** - In-app notifications for user actions
- ⚙️ **Settings Panel** - Customizable audio/video settings

### Technical Excellence
- 🔒 **Secure WebRTC** - End-to-end encrypted peer-to-peer connections
- ⚡ **Low Latency** - Optimized for minimal delay in communication
- 🔄 **Auto-Recovery** - Intelligent handling of connection failures
- 📈 **Scalable Architecture** - Built to handle multiple concurrent rooms
- 🛡️ **Error Handling** - Comprehensive error handling and user feedback

## Technology Stack

- **Backend**: Python 3.8+, FastAPI, WebSockets, Socket.IO
- **Frontend**: HTML5, CSS3, Modern JavaScript (ES6+), Bootstrap 5
- **Real-time Communication**: WebSocket + Socket.IO for signaling
- **Video/Audio**: WebRTC APIs with full peer-to-peer support
- **Data Transfer**: WebRTC Data Channels for file sharing
- **UI Framework**: Bootstrap 5 with custom responsive CSS
- **Icons**: Bootstrap Icons for consistent UI elements

## Enhanced Architecture

### WebRTC Implementation
- **Peer-to-Peer Connections**: Direct browser-to-browser communication
- **ICE Candidates**: STUN/TURN server support for NAT traversal
- **Media Streams**: High-quality audio/video with adaptive bitrate
- **Data Channels**: Reliable file transfer without server involvement
- **Connection Management**: Automatic reconnection and error recovery

### Signaling Server
- **Socket.IO Events**: Real-time signaling for WebRTC negotiation
- **Room Management**: Dynamic room creation and participant tracking
- **Message Broadcasting**: Efficient message distribution
- **Connection State**: Real-time connection status monitoring

## Project Structure

```
myteamsconfapp/
├── main.py                 # FastAPI server with WebSocket support
├── requirements.txt        # Python dependencies
├── templates/             # HTML templates
│   ├── index.html         # Home page
│   └── room.html          # Room/meeting page
├── static/               # Static files
│   ├── css/
│   │   ├── style.css     # Home page styles
│   │   └── room.css      # Room page styles
│   └── js/
│       ├── app.js        # Home page functionality
│       └── room.js       # Room functionality
└── README.md            # This file
```

## Installation & Setup

### Prerequisites

- Python 3.8 or higher
- pip (Python package installer)

### Installation Steps

1. **Clone or download the project** to your local machine

2. **Install Python dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

   Or install packages individually:
   ```bash
   pip install fastapi==0.104.1 uvicorn==0.24.0 websockets==12.0 python-socketio==5.10.0 python-multipart==0.0.6 jinja2==3.1.2 aiofiles==23.2.1 pydantic==2.5.0 python-jose[cryptography]==3.3.0 passlib[bcrypt]==1.7.4
   ```

3. **Run the application**:
   ```bash
   python main.py
   ```

   Or using uvicorn directly:
   ```bash
   uvicorn main:socket_app --host 0.0.0.0 --port 8000
   ```

4. **Open your browser** and navigate to:
   ```
   http://localhost:8000
   ```

## Usage

### Starting a Meeting

1. Open the application in your web browser
2. Enter your name in the username field
3. Either:
   - Click "Create New Room" to start a new meeting
   - Enter a Room ID and click "Join Room" to join an existing meeting

### In a Meeting Room - Enhanced Experience

- **HD Video/Audio**: High-definition video calls with noise cancellation
- **Smart Controls**: 
  - Toggle camera/microphone with visual feedback
  - Start/stop screen sharing with one click
  - Real-time participant management
  - File sharing with drag-and-drop support
- **Advanced Features**:
  - Picture-in-picture local video
  - Grid layout that adapts to participant count
  - Connection quality indicators
  - Typing indicators in chat
  - Emoji reactions and file attachments
- **Mobile Experience**: Fully responsive design optimized for mobile devices

### WebRTC Features

- **Peer-to-Peer**: Direct communication between browsers
- **Screen Sharing**: Full desktop capture and sharing
- **File Transfer**: Direct file sharing through data channels
- **Connection Recovery**: Automatic reconnection on network issues
- **Quality Adaptation**: Automatic quality adjustment based on network conditions

## API Endpoints

### REST API

- `GET /` - Home page
- `GET /room/{room_id}` - Join specific room
- `POST /api/rooms` - Create new room
- `GET /api/rooms/{room_id}` - Get room information

### WebSocket Endpoints

- `WS /ws/{room_id}` - WebSocket connection for real-time communication

### Enhanced Socket.IO Events

- `join_room` - Join a room with user management
- `leave_room` - Leave a room with cleanup
- `send_message` - Send chat messages with metadata
- `webrtc_offer` - WebRTC offer signaling
- `webrtc_answer` - WebRTC answer signaling  
- `webrtc_ice_candidate` - ICE candidate exchange
- `toggle_video` - Video state synchronization
- `toggle_audio` - Audio state synchronization
- `screen_share_start/stop` - Screen sharing events
- `file_share` - File sharing notifications

### WebRTC Signaling Flow

1. **Join Room**: User joins and receives participant list
2. **Peer Discovery**: Establish connections with existing participants
3. **Media Negotiation**: Exchange offers/answers for media streams
4. **ICE Exchange**: Share network candidates for connectivity
5. **Connection Established**: Direct peer-to-peer communication
6. **State Synchronization**: Real-time updates for all participants

## Development

### Running in Development Mode

```bash
uvicorn main:socket_app --reload --host 0.0.0.0 --port 8000
```

### Customization

- **Styling**: Modify CSS files in `static/css/`
- **Functionality**: Update JavaScript files in `static/js/`
- **Templates**: Edit HTML templates in `templates/`
- **Server Logic**: Modify `main.py` for backend changes

## Browser Compatibility

- Chrome 70+ (recommended)
- Firefox 65+
- Safari 12+
- Edge 79+

**Note**: WebRTC features require HTTPS in production environments.

## Production Deployment

For production deployment:

1. Use a proper WSGI/ASGI server like Gunicorn with Uvicorn workers
2. Configure HTTPS (required for WebRTC)
3. Use a real database instead of in-memory storage
4. Add authentication and authorization
5. Configure CORS properly for your domain

Example production command:
```bash
gunicorn main:socket_app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is provided as-is for educational and development purposes.

## Troubleshooting

### Common Issues

1. **Python not found**: Install Python 3.8+ from python.org
2. **Port already in use**: Change the port in main.py or kill the process using port 8000
3. **Camera/microphone not working**: Ensure browser permissions are granted
4. **WebSocket connection failed**: Check firewall settings and network connectivity

### Getting Help

- Check the browser console for JavaScript errors
- Review the server logs for backend issues
- Ensure all dependencies are installed correctly
- Verify Python version compatibility
