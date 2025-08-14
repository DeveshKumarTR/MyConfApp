// Enhanced Room functionality with full WebRTC support
let username = '';
let userId = '';
let socket = null;
let localStream = null;
let localVideo = null;
let isVideoEnabled = true;
let isAudioEnabled = true;
let isScreenSharing = false;
let screenStream = null;

// WebRTC Configuration
const rtcConfiguration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
    ]
};

// Peer connections for each participant
let peerConnections = {};
let participants = {};
let dataChannels = {};

// Initialize room
document.addEventListener('DOMContentLoaded', function() {
    initializeRoom();
});

async function initializeRoom() {
    // Generate unique user ID
    userId = generateUserId();
    
    // Get username from storage or prompt
    username = localStorage.getItem('teams_username');
    
    if (!username) {
        const modal = new bootstrap.Modal(document.getElementById('usernameModal'));
        modal.show();
        
        document.getElementById('join-room-btn').addEventListener('click', function() {
            const input = document.getElementById('username-input');
            username = input.value.trim();
            
            if (username) {
                localStorage.setItem('teams_username', username);
                modal.hide();
                startRoom();
            } else {
                alert('Please enter your name');
            }
        });
    } else {
        startRoom();
    }
}

async function startRoom() {
    setupSocketConnection();
    setupEventListeners();
    await initializeMedia();
    joinSocketRoom();
    setupDataChannels();
    
    // Initialize new features
    initializeRecording();
    initializeParticipants();
    initializeSettings();
    initializeScheduler();
    initializeAttendeesList();
    setupEnhancedSocketEvents();
}

function setupSocketConnection() {
    socket = io();
    
    socket.on('connect', function() {
        console.log('Connected to server');
        addSystemMessage('🔗 Connected to server');
        addSystemMessage('💡 Tip: Use Ctrl+M (mute), Ctrl+E (video), Ctrl+D (screen share) | Right-click camera/mic buttons for device options');
    });
    
    socket.on('disconnect', function() {
        console.log('Disconnected from server');
        addSystemMessage('Disconnected from server');
    });
    
    socket.on('room_joined', function(data) {
        console.log('Room joined:', data);
        userId = data.user_id;
        
        // Clear existing participants
        participants = {};
        
        // Initialize connections with OTHER participants (not including self)
        if (data.other_participants) {
            console.log(`Connecting to ${data.other_participants.length} existing participants`);
            
            data.other_participants.forEach(participant => {
                console.log(`Adding participant: ${participant.username} (${participant.user_id})`);
                participants[participant.user_id] = participant;
                createPeerConnection(participant.user_id);
            });
        }
        
        // Update UI with all participants (including self)
        updateParticipantsList(data.participants);
        updateParticipantsCount(data.participants.length);
        addSystemMessage(`Joined room ${ROOM_ID} with ${data.participants.length} participant(s)`);
        
        console.log(`Room joined successfully. Total participants: ${data.participants.length}, WebRTC connections to establish: ${data.other_participants ? data.other_participants.length : 0}`);
    });
    
    socket.on('user_joined', function(data) {
        console.log('New user joined:', data);
        if (data.user_id !== userId) {
            // Add new participant
            participants[data.user_id] = {
                user_id: data.user_id,
                username: data.username,
                is_video_enabled: true,
                is_audio_enabled: true,
                joined_at: data.timestamp
            };
            
            // Create peer connection for new user
            createPeerConnection(data.user_id);
            
            // Update UI
            updateParticipantsList();
            updateParticipantsCount(Object.keys(participants).length + 1); // +1 for self
            addSystemMessage(`${data.username} joined the room`);
            
            // As an existing participant, initiate call to the new user
            console.log(`Initiating call to new participant: ${data.username}`);
            setTimeout(() => {
                initiateCall(data.user_id);
            }, 1000); // Small delay to ensure peer connection is ready
        }
    });
    
    socket.on('user_left', function(data) {
        console.log('User left:', data);
        if (data.user_id !== userId) {
            closePeerConnection(data.user_id);
            delete participants[data.user_id];
            updateParticipantsList();
            addSystemMessage(`${data.username} left the room`);
        }
    });
    
    socket.on('receive_message', function(data) {
        if (data.type === 'chat') {
            addChatMessage(data.username, data.message, data.timestamp);
        }
    });
    
    // WebRTC signaling events
    socket.on('webrtc_offer', async function(data) {
        console.log('Received offer from:', data.from_user);
        await handleOffer(data.from_user, data.offer);
    });
    
    socket.on('webrtc_answer', async function(data) {
        console.log('Received answer from:', data.from_user);
        await handleAnswer(data.from_user, data.answer);
    });
    
    socket.on('webrtc_ice_candidate', async function(data) {
        console.log('Received ICE candidate from:', data.from_user);
        await handleIceCandidate(data.from_user, data.candidate);
    });
    
    socket.on('user_video_toggle', function(data) {
        if (participants[data.user_id]) {
            participants[data.user_id].is_video_enabled = data.is_enabled;
            updateParticipantVideo(data.user_id, data.is_enabled);
        }
    });
    
    socket.on('user_audio_toggle', function(data) {
        if (participants[data.user_id]) {
            participants[data.user_id].is_audio_enabled = data.is_enabled;
            updateParticipantAudio(data.user_id, data.is_enabled);
        }
    });
    
    socket.on('screen_share_started', function(data) {
        showScreenShareNotification(`${data.username} started sharing screen`);
    });
    
    socket.on('screen_share_stopped', function(data) {
        hideScreenShare(data.user_id);
    });
    
    socket.on('file_shared', function(data) {
        addFileMessage(data.username, data.file_info, data.timestamp);
    });
    
    socket.on('room_closed', function(data) {
        alert('Room has been closed by the host');
        window.location.href = '/';
    });
}

function setupEventListeners() {
    // Chat functionality
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-message');
    
    if (sendButton) sendButton.addEventListener('click', sendMessage);
    if (messageInput) {
        messageInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
    }
    
    // Video controls with enhanced features
    const toggleVideoBtn = document.getElementById('toggle-video');
    const toggleAudioBtn = document.getElementById('toggle-audio');
    const shareScreenBtn = document.getElementById('share-screen');
    const leaveRoomBtn = document.getElementById('leave-room');
    const recordMeetingBtn = document.getElementById('record-meeting');
    const scheduleMeetingBtn = document.getElementById('schedule-meeting');
    const chatToggleBtn = document.getElementById('chat-toggle');
    const participantsToggleBtn = document.getElementById('participants-toggle');
    const settingsBtn = document.getElementById('settings');
    
    if (toggleVideoBtn) {
        toggleVideoBtn.addEventListener('click', toggleVideo);
        toggleVideoBtn.addEventListener('contextmenu', function(e) {
            e.preventDefault();
            showDeviceSelector('video', e.pageX, e.pageY);
        });
    }
    
    if (toggleAudioBtn) {
        toggleAudioBtn.addEventListener('click', toggleAudio);
        toggleAudioBtn.addEventListener('contextmenu', function(e) {
            e.preventDefault();
            showDeviceSelector('audio', e.pageX, e.pageY);
        });
    }
    
    if (shareScreenBtn) shareScreenBtn.addEventListener('click', toggleScreenShare);
    if (leaveRoomBtn) leaveRoomBtn.addEventListener('click', leaveRoom);
    if (recordMeetingBtn) recordMeetingBtn.addEventListener('click', toggleRecording);
    if (scheduleMeetingBtn) scheduleMeetingBtn.addEventListener('click', showScheduleMeeting);
    if (chatToggleBtn) chatToggleBtn.addEventListener('click', toggleChatSidebar);
    if (participantsToggleBtn) participantsToggleBtn.addEventListener('click', showParticipantsModal);
    if (settingsBtn) settingsBtn.addEventListener('click', showSettingsModal);
    
    // Debug: Log which buttons were found
    console.log('Button connection status:', {
        toggleVideo: !!toggleVideoBtn,
        toggleAudio: !!toggleAudioBtn,
        shareScreen: !!shareScreenBtn,
        leaveRoom: !!leaveRoomBtn,
        recordMeeting: !!recordMeetingBtn,
        scheduleMeeting: !!scheduleMeetingBtn,
        chatToggle: !!chatToggleBtn,
        participantsToggle: !!participantsToggleBtn,
        settings: !!settingsBtn
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboardShortcuts);
}

function handleKeyboardShortcuts(e) {
    // Only handle shortcuts when not typing in input fields
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
    }
    
    if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
            case 'm':
                e.preventDefault();
                toggleAudio();
                addSystemMessage('🎤 Toggled microphone via keyboard shortcut');
                break;
            case 'e':
                e.preventDefault();
                toggleVideo();
                addSystemMessage('📹 Toggled video via keyboard shortcut');
                break;
            case 'd':
                e.preventDefault();
                toggleScreenShare();
                addSystemMessage('🖥️ Toggled screen share via keyboard shortcut');
                break;
        }
    }
}

async function showDeviceSelector(type, x, y) {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const filteredDevices = devices.filter(device => 
            device.kind === (type === 'video' ? 'videoinput' : 'audioinput')
        );
        
        if (filteredDevices.length <= 1) {
            addSystemMessage(`Only one ${type} device available`);
            return;
        }
        
        // Remove existing device selector
        const existingSelector = document.querySelector('.device-selector');
        if (existingSelector) {
            existingSelector.remove();
        }
        
        // Create device selector
        const selector = document.createElement('div');
        selector.className = 'device-selector';
        selector.style.cssText = `
            position: fixed;
            left: ${x}px;
            top: ${y}px;
            z-index: 1000;
            background: rgba(0,0,0,0.9);
            border-radius: 8px;
            padding: 10px;
            min-width: 200px;
            color: white;
            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        `;
        
        const title = document.createElement('div');
        title.textContent = `Select ${type === 'video' ? 'Camera' : 'Microphone'}`;
        title.style.cssText = 'font-weight: bold; margin-bottom: 10px; color: #fff;';
        selector.appendChild(title);
        
        filteredDevices.forEach(device => {
            const option = document.createElement('div');
            option.className = 'device-option';
            option.textContent = device.label || `${type === 'video' ? 'Camera' : 'Microphone'} ${device.deviceId.slice(0, 8)}`;
            option.style.cssText = `
                padding: 8px 12px;
                border-radius: 4px;
                cursor: pointer;
                transition: background 0.3s ease;
                margin: 2px 0;
            `;
            
            option.addEventListener('mouseenter', function() {
                option.style.background = 'rgba(255,255,255,0.1)';
            });
            
            option.addEventListener('mouseleave', function() {
                option.style.background = 'transparent';
            });
            
            option.addEventListener('click', function() {
                switchMediaDevice(device.deviceId, type);
                selector.remove();
            });
            
            selector.appendChild(option);
        });
        
        document.body.appendChild(selector);
        
        // Close selector when clicking outside
        setTimeout(() => {
            const closeHandler = function(e) {
                if (!selector.contains(e.target)) {
                    selector.remove();
                    document.removeEventListener('click', closeHandler);
                }
            };
            document.addEventListener('click', closeHandler);
        }, 100);
        
    } catch (error) {
        console.error('Error showing device selector:', error);
        addSystemMessage('❌ Could not list devices');
    }
}

async function switchMediaDevice(deviceId, type) {
    try {
        addSystemMessage(`🔄 Switching ${type === 'video' ? 'camera' : 'microphone'}...`);
        
        const constraints = {
            video: type === 'video' ? { 
                deviceId: { exact: deviceId },
                width: { ideal: 1280, min: 640 },
                height: { ideal: 720, min: 480 },
                frameRate: { ideal: 30, min: 15 }
            } : (isVideoEnabled ? {
                width: { ideal: 1280, min: 640 },
                height: { ideal: 720, min: 480 },
                frameRate: { ideal: 30, min: 15 }
            } : false),
            audio: type === 'audio' ? { 
                deviceId: { exact: deviceId },
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            } : isAudioEnabled
        };
        
        const newStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Replace tracks in existing peer connections
        for (const [remoteUserId, pc] of Object.entries(peerConnections)) {
            const newTrack = type === 'video' ? newStream.getVideoTracks()[0] : newStream.getAudioTracks()[0];
            const sender = pc.getSenders().find(s => 
                s.track && s.track.kind === type
            );
            
            if (sender && newTrack) {
                await sender.replaceTrack(newTrack);
            }
        }
        
        // Update local stream
        if (type === 'video') {
            const oldVideoTrack = localStream.getVideoTracks()[0];
            if (oldVideoTrack) {
                localStream.removeTrack(oldVideoTrack);
                oldVideoTrack.stop();
            }
            if (newStream.getVideoTracks()[0]) {
                localStream.addTrack(newStream.getVideoTracks()[0]);
                // Update local video display
                localVideo.srcObject = localStream;
            }
        } else {
            const oldAudioTrack = localStream.getAudioTracks()[0];
            if (oldAudioTrack) {
                localStream.removeTrack(oldAudioTrack);
                oldAudioTrack.stop();
            }
            if (newStream.getAudioTracks()[0]) {
                localStream.addTrack(newStream.getAudioTracks()[0]);
            }
        }
        
        addSystemMessage(`✅ Successfully switched ${type === 'video' ? 'camera' : 'microphone'}`);
        
    } catch (error) {
        console.error('Error switching device:', error);
        addSystemMessage(`❌ Failed to switch ${type === 'video' ? 'camera' : 'microphone'}: ${error.message}`);
    }
}

async function initializeMedia() {
    try {
        console.log('Starting media initialization...');
        
        // Check for media device permissions
        const permissions = await checkMediaPermissions();
        
        console.log('Requesting user media...');
        // Get user media with high quality settings
        localStream = await navigator.mediaDevices.getUserMedia({ 
            video: {
                width: { ideal: 1280, min: 640 },
                height: { ideal: 720, min: 480 },
                frameRate: { ideal: 30, min: 15 },
                facingMode: 'user'
            }, 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: 44100
            }
        });
        
        console.log('Media stream obtained:', localStream);
        console.log('Video tracks:', localStream.getVideoTracks());
        console.log('Audio tracks:', localStream.getAudioTracks());
        
        localVideo = document.getElementById('local-video');
        console.log('Local video element:', localVideo);
        
        if (localVideo) {
            localVideo.srcObject = localStream;
            console.log('Video source set to stream');
            
            // Force video to be visible
            localVideo.style.display = 'block';
            localVideo.style.width = '100%';
            localVideo.style.height = '100%';
            
            // Ensure video plays
            localVideo.onloadedmetadata = () => {
                console.log('Video metadata loaded, attempting to play...');
                localVideo.play().then(() => {
                    console.log('Video playing successfully');
                    // Make sure container is visible
                    const container = document.getElementById('local-video-container');
                    if (container) {
                        container.style.display = 'block';
                        container.style.background = 'transparent';
                    }
                }).catch(e => {
                    console.error('Error playing video:', e);
                });
            };
            
            // Add error handling
            localVideo.onerror = (e) => {
                console.error('Video element error:', e);
            };
        } else {
            console.error('Local video element not found!');
        }
        
        // Add video stream monitoring
        monitorVideoQuality();
        
        updateControlsState();
        addSystemMessage('✅ Camera and microphone initialized successfully');
        
        // Show media device info
        showMediaDeviceInfo();
        
    } catch (error) {
        console.error('Error accessing media devices:', error);
        
        // Show error in video container
        const localVideoContainer = document.getElementById('local-video-container');
        if (localVideoContainer) {
            localVideoContainer.innerHTML = `
                <div style="
                    width: 100%; 
                    height: 100%; 
                    background: #333; 
                    display: flex; 
                    align-items: center; 
                    justify-content: center;
                    color: white;
                    text-align: center;
                    padding: 20px;
                    box-sizing: border-box;
                ">
                    <div>
                        <div style="font-size: 3em; margin-bottom: 10px;">📹</div>
                        <div>Camera Access Denied</div>
                        <div style="font-size: 0.8em; margin-top: 10px;">Please allow camera access and refresh</div>
                    </div>
                </div>
                <div class="video-label">You</div>
            `;
            localVideoContainer.style.display = 'block';
        }
        
        handleMediaError(error);
    }
}

async function checkMediaPermissions() {
    try {
        const permissions = await navigator.permissions.query({ name: 'camera' });
        const audioPermissions = await navigator.permissions.query({ name: 'microphone' });
        
        console.log('Camera permission:', permissions.state);
        console.log('Microphone permission:', audioPermissions.state);
        
        return {
            camera: permissions.state,
            microphone: audioPermissions.state
        };
    } catch (error) {
        console.log('Permission API not supported');
        return null;
    }
}

function handleMediaError(error) {
    let errorMessage = 'Could not access media devices. ';
    
    switch (error.name) {
        case 'NotAllowedError':
            errorMessage += 'Permission denied. Please allow camera and microphone access.';
            showPermissionDialog();
            break;
        case 'NotFoundError':
            errorMessage += 'No camera or microphone found.';
            break;
        case 'NotReadableError':
            errorMessage += 'Hardware error. Device may be in use by another application.';
            break;
        case 'OverconstrainedError':
            errorMessage += 'Camera settings not supported. Trying fallback...';
            tryFallbackMedia();
            return;
        default:
            errorMessage += error.message;
    }
    
    addSystemMessage('❌ ' + errorMessage);
    
    // Try audio only as fallback
    tryAudioOnlyMode();
}

async function tryFallbackMedia() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ 
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                frameRate: { ideal: 15 }
            }, 
            audio: true
        });
        
        localVideo = document.getElementById('local-video');
        localVideo.srcObject = localStream;
        
        updateControlsState();
        addSystemMessage('📹 Camera initialized with reduced quality');
        
    } catch (fallbackError) {
        handleMediaError(fallbackError);
    }
}

async function tryAudioOnlyMode() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });
        
        isVideoEnabled = false;
        updateControlsState();
        addSystemMessage('🎤 Audio-only mode enabled');
        
    } catch (audioError) {
        console.error('Could not access audio:', audioError);
        addSystemMessage('❌ No media access available. You can still participate in chat.');
    }
}

function showPermissionDialog() {
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.innerHTML = `
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">Camera & Microphone Access Needed</h5>
                </div>
                <div class="modal-body">
                    <p>To participate in video calls, please allow access to your camera and microphone.</p>
                    <ol>
                        <li>Click the camera/microphone icon in your browser's address bar</li>
                        <li>Select "Allow" for camera and microphone</li>
                        <li>Refresh the page</li>
                    </ol>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-primary" onclick="location.reload()">Refresh Page</button>
                    <button class="btn btn-secondary" data-bs-dismiss="modal">Continue Without Media</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    const modalInstance = new bootstrap.Modal(modal);
    modalInstance.show();
}

function showMediaDeviceInfo() {
    navigator.mediaDevices.enumerateDevices().then(devices => {
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        const audioDevices = devices.filter(device => device.kind === 'audioinput');
        
        console.log(`Found ${videoDevices.length} camera(s) and ${audioDevices.length} microphone(s)`);
        
        if (videoDevices.length > 1 || audioDevices.length > 1) {
            addSystemMessage(`📱 Multiple devices available: ${videoDevices.length} camera(s), ${audioDevices.length} microphone(s)`);
        }
    });
}

function monitorVideoQuality() {
    if (!localStream) return;
    
    const videoTrack = localStream.getVideoTracks()[0];
    if (!videoTrack) return;
    
    setInterval(() => {
        const settings = videoTrack.getSettings();
        console.log('Video quality:', {
            width: settings.width,
            height: settings.height,
            frameRate: settings.frameRate
        });
    }, 10000); // Check every 10 seconds
}

function joinSocketRoom() {
    socket.emit('join_room', {
        room_id: ROOM_ID,
        username: username,
        user_id: userId
    });
}

function sendMessage() {
    const input = document.getElementById('message-input');
    const message = input.value.trim();
    
    if (message && socket) {
        socket.emit('send_message', {
            room_id: ROOM_ID,
            user_id: userId,
            username: username,
            message: message
        });
        
        input.value = '';
    }
}

function addChatMessage(author, message, timestamp) {
    const messagesContainer = document.getElementById('chat-messages');
    const messageElement = document.createElement('div');
    messageElement.className = 'message';
    
    const time = new Date(timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    messageElement.innerHTML = `
        <div class="message-header">
            <span class="message-author">${escapeHtml(author)}</span>
            <span class="message-time">${time}</span>
        </div>
        <div class="message-content">${escapeHtml(message)}</div>
    `;
    
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function addFileMessage(author, fileInfo, timestamp) {
    const messagesContainer = document.getElementById('chat-messages');
    const messageElement = document.createElement('div');
    messageElement.className = 'message file-message';
    
    const time = new Date(timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    messageElement.innerHTML = `
        <div class="message-header">
            <span class="message-author">${escapeHtml(author)}</span>
            <span class="message-time">${time}</span>
        </div>
        <div class="message-content">
            <div class="file-info">
                <i class="bi bi-file-earmark"></i>
                <span class="file-name">${escapeHtml(fileInfo.name)}</span>
                <span class="file-size">(${formatFileSize(fileInfo.size)})</span>
            </div>
        </div>
    `;
    
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function addSystemMessage(message) {
    const messagesContainer = document.getElementById('chat-messages');
    const messageElement = document.createElement('div');
    messageElement.className = 'system-message';
    messageElement.textContent = message;
    
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

async function toggleVideo() {
    try {
        if (!localStream) {
            addSystemMessage('❌ No video stream available');
            return;
        }
        
        isVideoEnabled = !isVideoEnabled;
        const videoTrack = localStream.getVideoTracks()[0];
        
        if (videoTrack) {
            videoTrack.enabled = isVideoEnabled;
            
            // Notify other participants
            socket.emit('toggle_video', {
                room_id: ROOM_ID,
                user_id: userId,
                is_enabled: isVideoEnabled
            });
            
            updateControlsState();
            
            // Show feedback message
            const status = isVideoEnabled ? 'enabled' : 'disabled';
            const icon = isVideoEnabled ? '📹' : '📷';
            addSystemMessage(`${icon} Video ${status}`);
            
            // Update local video display
            const localVideoContainer = document.getElementById('local-video-container');
            if (isVideoEnabled) {
                localVideoContainer.classList.remove('video-disabled');
            } else {
                localVideoContainer.classList.add('video-disabled');
            }
            
        } else {
            addSystemMessage('❌ No video track available');
        }
    } catch (error) {
        console.error('Error toggling video:', error);
        addSystemMessage('❌ Failed to toggle video');
    }
}

async function toggleAudio() {
    try {
        if (!localStream) {
            addSystemMessage('❌ No audio stream available');
            return;
        }
        
        isAudioEnabled = !isAudioEnabled;
        const audioTrack = localStream.getAudioTracks()[0];
        
        if (audioTrack) {
            audioTrack.enabled = isAudioEnabled;
            
            // Notify other participants
            socket.emit('toggle_audio', {
                room_id: ROOM_ID,
                user_id: userId,
                is_enabled: isAudioEnabled
            });
            
            updateControlsState();
            
            // Show feedback message
            const status = isAudioEnabled ? 'enabled' : 'muted';
            const icon = isAudioEnabled ? '🎤' : '🔇';
            addSystemMessage(`${icon} Microphone ${status}`);
            
            // Add visual indicator for mute state
            const localVideoContainer = document.getElementById('local-video-container');
            if (isAudioEnabled) {
                localVideoContainer.classList.remove('audio-muted');
            } else {
                localVideoContainer.classList.add('audio-muted');
            }
            
        } else {
            addSystemMessage('❌ No audio track available');
        }
    } catch (error) {
        console.error('Error toggling audio:', error);
        addSystemMessage('❌ Failed to toggle audio');
    }
}

async function toggleScreenShare() {
    if (!isScreenSharing) {
        try {
            screenStream = await navigator.mediaDevices.getDisplayMedia({ 
                video: {
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                }, 
                audio: true 
            });
            
            // Replace video track in all peer connections
            const videoTrack = screenStream.getVideoTracks()[0];
            for (const [remoteUserId, pc] of Object.entries(peerConnections)) {
                const sender = pc.getSenders().find(s => 
                    s.track && s.track.kind === 'video'
                );
                if (sender) {
                    await sender.replaceTrack(videoTrack);
                }
            }
            
            // Update local video
            localVideo.srcObject = screenStream;
            isScreenSharing = true;
            
            // Notify others
            socket.emit('screen_share_start', {
                room_id: ROOM_ID,
                user_id: userId
            });
            
            // Handle screen share end
            videoTrack.addEventListener('ended', () => {
                stopScreenShare();
            });
            
            updateControlsState();
            addSystemMessage('Screen sharing started');
        } catch (error) {
            console.error('Error sharing screen:', error);
            alert('Could not share screen: ' + error.message);
        }
    } else {
        stopScreenShare();
    }
}

async function stopScreenShare() {
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
        screenStream = null;
    }
    
    isScreenSharing = false;
    
    // Replace screen share track with camera track
    if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        for (const [remoteUserId, pc] of Object.entries(peerConnections)) {
            const sender = pc.getSenders().find(s => 
                s.track && s.track.kind === 'video'
            );
            if (sender && videoTrack) {
                await sender.replaceTrack(videoTrack);
            }
        }
        
        // Restore local video
        localVideo.srcObject = localStream;
    }
    
    // Notify others
    socket.emit('screen_share_stop', {
        room_id: ROOM_ID,
        user_id: userId
    });
    
    updateControlsState();
    addSystemMessage('Screen sharing stopped');
}

function updateControlsState() {
    // Update video button
    const videoBtn = document.getElementById('toggle-video');
    const videoIcon = videoBtn.querySelector('i');
    if (isVideoEnabled) {
        videoIcon.className = 'bi bi-camera-video';
        videoBtn.classList.remove('btn-outline-danger');
        videoBtn.classList.add('btn-outline-light');
    } else {
        videoIcon.className = 'bi bi-camera-video-off';
        videoBtn.classList.remove('btn-outline-light');
        videoBtn.classList.add('btn-outline-danger');
    }
    
    // Update audio button
    const audioBtn = document.getElementById('toggle-audio');
    const audioIcon = audioBtn.querySelector('i');
    if (isAudioEnabled) {
        audioIcon.className = 'bi bi-mic';
        audioBtn.classList.remove('btn-outline-danger');
        audioBtn.classList.add('btn-outline-light');
    } else {
        audioIcon.className = 'bi bi-mic-off';
        audioBtn.classList.remove('btn-outline-light');
        audioBtn.classList.add('btn-outline-danger');
    }
    
    // Update screen share button
    const screenBtn = document.getElementById('share-screen');
    if (isScreenSharing) {
        screenBtn.classList.remove('btn-outline-light');
        screenBtn.classList.add('btn-outline-success');
    } else {
        screenBtn.classList.remove('btn-outline-success');
        screenBtn.classList.add('btn-outline-light');
    }
}

function updateParticipantsList() {
    // This would be connected to actual participant data
    const participantsContainer = document.getElementById('participants');
    const participantAvatar = document.createElement('div');
    participantAvatar.className = 'participant-avatar';
    participantAvatar.textContent = username.charAt(0).toUpperCase();
    participantAvatar.title = username;
    
    participantsContainer.innerHTML = '';
    participantsContainer.appendChild(participantAvatar);
}

function leaveRoom() {
    if (confirm('Are you sure you want to leave the room?')) {
        // Clean up media streams
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }
        
        if (isScreenSharing) {
            stopScreenShare();
        }
        
        // Leave socket room
        if (socket) {
            socket.emit('leave_room', {
                room: ROOM_ID,
                username: username
            });
        }
        
        // Redirect to home
        window.location.href = '/';
    }
}

// WebRTC Functions
async function createPeerConnection(remoteUserId) {
    console.log(`Creating peer connection for user: ${remoteUserId}`);
    
    // Check if connection already exists
    if (peerConnections[remoteUserId]) {
        console.log(`Peer connection already exists for ${remoteUserId}, closing old one`);
        peerConnections[remoteUserId].close();
        delete peerConnections[remoteUserId];
    }
    
    const pc = new RTCPeerConnection(rtcConfiguration);
    peerConnections[remoteUserId] = pc;
    
    // Add local stream tracks if available
    if (localStream) {
        console.log(`Adding ${localStream.getTracks().length} local tracks to peer connection`);
        localStream.getTracks().forEach(track => {
            console.log(`Adding track: ${track.kind} enabled: ${track.enabled}`);
            pc.addTrack(track, localStream);
        });
    }
    
    // Handle remote stream
    pc.ontrack = (event) => {
        console.log(`Received remote ${event.track.kind} track from:`, remoteUserId);
        const participant = participants[remoteUserId];
        const participantName = participant ? participant.username : 'Unknown';
        
        let remoteVideo = document.getElementById(`remote-video-${remoteUserId}`);
        if (remoteVideo) {
            remoteVideo.srcObject = event.streams[0];
            console.log(`Updated existing video element for ${participantName}`);
        } else {
            createRemoteVideoElement(remoteUserId, event.streams[0], participantName);
            console.log(`Created new video element for ${participantName}`);
        }
    };
    
    // Handle ICE candidates
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            console.log(`Sending ICE candidate to ${remoteUserId}`);
            socket.emit('webrtc_ice_candidate', {
                room_id: ROOM_ID,
                from_user: userId,
                to_user: remoteUserId,
                candidate: event.candidate
            });
        } else {
            console.log(`ICE gathering complete for ${remoteUserId}`);
        }
    };
    
    // Handle connection state changes
    pc.onconnectionstatechange = () => {
        console.log(`Connection state for ${remoteUserId}: ${pc.connectionState}`);
        
        const participant = participants[remoteUserId];
        const participantName = participant ? participant.username : remoteUserId;
        
        switch (pc.connectionState) {
            case 'connected':
                console.log(`✅ Successfully connected to ${participantName}`);
                showToast(`Connected to ${participantName}`, 'success');
                break;
            case 'failed':
                console.log(`❌ Connection failed for ${participantName}, attempting restart`);
                showToast(`Connection issue with ${participantName}, reconnecting...`, 'warning');
                pc.restartIce();
                break;
            case 'disconnected':
                console.log(`⚠️ Disconnected from ${participantName}`);
                break;
            case 'closed':
                console.log(`🔒 Connection closed for ${participantName}`);
                break;
        }
    };
    
    // Handle ICE connection state changes
    pc.oniceconnectionstatechange = () => {
        console.log(`ICE connection state for ${remoteUserId}: ${pc.iceConnectionState}`);
    };
    
    // Create data channel for file sharing and messaging
    const dataChannel = pc.createDataChannel('fileTransfer', {
        ordered: true
    });
    dataChannels[remoteUserId] = dataChannel;
    
    setupDataChannel(dataChannel, remoteUserId);
    
    // Handle incoming data channels
    pc.ondatachannel = (event) => {
        console.log(`Received data channel from ${remoteUserId}`);
        const channel = event.channel;
        dataChannels[remoteUserId] = channel;
        setupDataChannel(channel, remoteUserId);
    };
    
    console.log(`✅ Peer connection created successfully for ${remoteUserId}`);
    return pc;
    
    dataChannel.onopen = () => {
        console.log('Data channel opened with:', remoteUserId);
    };
    
    dataChannel.onmessage = (event) => {
        handleDataChannelMessage(remoteUserId, event.data);
    };
    
    // Handle incoming data channels
    pc.ondatachannel = (event) => {
        const channel = event.channel;
        channel.onmessage = (event) => {
            handleDataChannelMessage(remoteUserId, event.data);
        };
    };
    
    return pc;
}

async function initiateCall(remoteUserId) {
    console.log('Initiating call to:', remoteUserId);
    
    const pc = peerConnections[remoteUserId];
    if (!pc) return;
    
    try {
        const offer = await pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
        });
        
        await pc.setLocalDescription(offer);
        
        socket.emit('webrtc_offer', {
            room_id: ROOM_ID,
            from_user: userId,
            to_user: remoteUserId,
            offer: offer
        });
    } catch (error) {
        console.error('Error creating offer:', error);
    }
}

async function handleOffer(remoteUserId, offer) {
    console.log('Handling offer from:', remoteUserId);
    
    let pc = peerConnections[remoteUserId];
    if (!pc) {
        pc = await createPeerConnection(remoteUserId);
    }
    
    try {
        await pc.setRemoteDescription(offer);
        
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        socket.emit('webrtc_answer', {
            room_id: ROOM_ID,
            from_user: userId,
            to_user: remoteUserId,
            answer: answer
        });
    } catch (error) {
        console.error('Error handling offer:', error);
    }
}

async function handleAnswer(remoteUserId, answer) {
    console.log('Handling answer from:', remoteUserId);
    
    const pc = peerConnections[remoteUserId];
    if (!pc) return;
    
    try {
        await pc.setRemoteDescription(answer);
    } catch (error) {
        console.error('Error handling answer:', error);
    }
}

async function handleIceCandidate(remoteUserId, candidate) {
    console.log('Handling ICE candidate from:', remoteUserId);
    
    const pc = peerConnections[remoteUserId];
    if (!pc) return;
    
    try {
        await pc.addIceCandidate(candidate);
    } catch (error) {
        console.error('Error adding ICE candidate:', error);
    }
}

function closePeerConnection(remoteUserId) {
    console.log('Closing peer connection for:', remoteUserId);
    
    if (peerConnections[remoteUserId]) {
        peerConnections[remoteUserId].close();
        delete peerConnections[remoteUserId];
    }
    
    if (dataChannels[remoteUserId]) {
        dataChannels[remoteUserId].close();
        delete dataChannels[remoteUserId];
    }
    
    // Remove remote video element
    const remoteVideo = document.getElementById(`remote-video-${remoteUserId}`);
    if (remoteVideo) {
        remoteVideo.remove();
    }
}

function createRemoteVideoElement(remoteUserId, stream, participantName = null) {
    const remoteVideos = document.getElementById('remote-videos');
    if (!remoteVideos) {
        console.error('Remote videos container not found');
        return;
    }
    
    // Remove existing video element if it exists
    const existingWrapper = document.getElementById(`remote-wrapper-${remoteUserId}`);
    if (existingWrapper) {
        existingWrapper.remove();
    }
    
    const participant = participants[remoteUserId];
    const displayName = participantName || (participant ? participant.username : 'Unknown User');
    
    console.log(`Creating video element for ${displayName} (${remoteUserId})`);
    
    const videoWrapper = document.createElement('div');
    videoWrapper.className = 'remote-video';
    videoWrapper.id = `remote-wrapper-${remoteUserId}`;
    
    const video = document.createElement('video');
    video.id = `remote-video-${remoteUserId}`;
    video.autoplay = true;
    video.playsInline = true;
    video.muted = false; // Remote videos should not be muted
    video.srcObject = stream;
    
    // Add error handling for video
    video.onerror = (e) => {
        console.error(`Video error for ${displayName}:`, e);
    };
    
    video.onloadedmetadata = () => {
        console.log(`Video metadata loaded for ${displayName}`);
    };
    
    const label = document.createElement('div');
    label.className = 'video-label';
    label.textContent = displayName;
    
    const controls = document.createElement('div');
    controls.className = 'video-controls';
    controls.innerHTML = `
        <span class="video-status ${participant?.is_video_enabled !== false ? '' : 'disabled'}" id="video-status-${remoteUserId}">
            <i class="bi bi-camera-video${participant?.is_video_enabled !== false ? '' : '-off'}"></i>
        </span>
        <span class="audio-status ${participant?.is_audio_enabled !== false ? '' : 'disabled'}" id="audio-status-${remoteUserId}">
            <i class="bi bi-mic${participant?.is_audio_enabled !== false ? '' : '-off'}"></i>
        </span>
    `;
    
    videoWrapper.appendChild(video);
    videoWrapper.appendChild(label);
    videoWrapper.appendChild(controls);
    
    remoteVideos.appendChild(videoWrapper);
    
    // Arrange videos in a grid layout
    arrangeVideoGrid();
    
    console.log(`✅ Video element created for ${displayName}`);
}

function arrangeVideoGrid() {
    const remoteVideos = document.getElementById('remote-videos');
    const videos = remoteVideos.querySelectorAll('.remote-video');
    const videoCount = videos.length;
    
    // Reset classes
    remoteVideos.className = 'remote-videos';
    
    // Apply grid layout based on participant count
    if (videoCount === 1) {
        remoteVideos.classList.add('single-video');
    } else if (videoCount === 2) {
        remoteVideos.classList.add('two-videos');
    } else if (videoCount <= 4) {
        remoteVideos.classList.add('four-videos');
    } else if (videoCount <= 6) {
        remoteVideos.classList.add('six-videos');
    } else {
        remoteVideos.classList.add('many-videos');
    }
    
    console.log(`Arranged ${videoCount} videos in grid layout`);
}

// Utility functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize participants list on load
updateParticipantsList();

function updateControlsState() {
    // Update video button
    const videoBtn = document.getElementById('toggle-video');
    const videoIcon = videoBtn.querySelector('i');
    if (isVideoEnabled) {
        videoIcon.className = 'bi bi-camera-video';
        videoBtn.classList.remove('btn-outline-danger');
        videoBtn.classList.add('btn-outline-light');
    } else {
        videoIcon.className = 'bi bi-camera-video-off';
        videoBtn.classList.remove('btn-outline-light');
        videoBtn.classList.add('btn-outline-danger');
    }
    
    // Update audio button
    const audioBtn = document.getElementById('toggle-audio');
    const audioIcon = audioBtn.querySelector('i');
    if (isAudioEnabled) {
        audioIcon.className = 'bi bi-mic';
        audioBtn.classList.remove('btn-outline-danger');
        audioBtn.classList.add('btn-outline-light');
    } else {
        audioIcon.className = 'bi bi-mic-off';
        audioBtn.classList.remove('btn-outline-light');
        audioBtn.classList.add('btn-outline-danger');
    }
    
    // Update screen share button
    const screenBtn = document.getElementById('share-screen');
    if (isScreenSharing) {
        screenBtn.classList.remove('btn-outline-light');
        screenBtn.classList.add('btn-outline-success');
    } else {
        screenBtn.classList.remove('btn-outline-success');
        screenBtn.classList.add('btn-outline-light');
    }
}

function updateParticipantVideo(userId, isEnabled) {
    const videoStatus = document.getElementById(`video-status-${userId}`);
    const videoElement = document.getElementById(`remote-video-${userId}`);
    
    if (videoStatus) {
        const icon = videoStatus.querySelector('i');
        if (isEnabled) {
            icon.className = 'bi bi-camera-video';
            videoStatus.classList.remove('disabled');
        } else {
            icon.className = 'bi bi-camera-video-off';
            videoStatus.classList.add('disabled');
        }
    }
    
    if (videoElement && !isEnabled) {
        videoElement.style.opacity = '0.5';
    } else if (videoElement) {
        videoElement.style.opacity = '1';
    }
}

function updateParticipantAudio(userId, isEnabled) {
    const audioStatus = document.getElementById(`audio-status-${userId}`);
    
    if (audioStatus) {
        const icon = audioStatus.querySelector('i');
        if (isEnabled) {
            icon.className = 'bi bi-mic';
            audioStatus.classList.remove('disabled');
        } else {
            icon.className = 'bi bi-mic-off';
            audioStatus.classList.add('disabled');
        }
    }
}

function updateParticipantsList(participantsList = null) {
    const participantsContainer = document.getElementById('participants');
    const participantsCount = document.querySelector('.participants-count');
    
    if (!participantsContainer) return;
    
    participantsContainer.innerHTML = '';
    
    // Use provided list or current participants
    let allParticipants = [];
    
    if (participantsList) {
        // Use the complete list from server (includes self)
        allParticipants = participantsList;
    } else {
        // Build from current participants + self
        allParticipants = Object.values(participants);
        // Add current user
        allParticipants.push({
            user_id: userId,
            username: username,
            is_video_enabled: isVideoEnabled,
            is_audio_enabled: isAudioEnabled
        });
    }
    
    // Sort participants by join time or name
    allParticipants.sort((a, b) => {
        if (a.user_id === userId) return -1; // Current user first
        if (b.user_id === userId) return 1;
        return a.username.localeCompare(b.username);
    });
    
    // Create avatar for each participant
    allParticipants.forEach(participant => {
        const participantAvatar = document.createElement('div');
        participantAvatar.className = 'participant-avatar';
        participantAvatar.textContent = participant.username.charAt(0).toUpperCase();
        
        const isCurrentUser = participant.user_id === userId;
        participantAvatar.title = `${participant.username}${isCurrentUser ? ' (You)' : ''}`;
        
        // Add status indicators
        if (!participant.is_video_enabled) {
            participantAvatar.classList.add('video-off');
        }
        if (!participant.is_audio_enabled) {
            participantAvatar.classList.add('audio-off');
        }
        
        // Highlight current user
        if (isCurrentUser) {
            participantAvatar.classList.add('current-user');
        }
        
        participantsContainer.appendChild(participantAvatar);
    });
    
    // Update count
    const totalCount = allParticipants.length;
    if (participantsCount) {
        participantsCount.textContent = `Participants (${totalCount})`;
    }
    
    console.log(`Updated participants list: ${totalCount} total participants`);
}

function updateParticipantsCount(count) {
    const participantsCount = document.querySelector('.participants-count');
    if (participantsCount) {
        participantsCount.textContent = `Participants (${count})`;
    }
    
    // Also update navbar if it exists
    const navParticipants = document.getElementById('participants-toggle');
    if (navParticipants) {
        const badge = navParticipants.querySelector('.badge') || document.createElement('span');
        badge.className = 'badge bg-primary ms-1';
        badge.textContent = count;
        if (!navParticipants.querySelector('.badge')) {
            navParticipants.appendChild(badge);
        }
    }
}

function showScreenShareNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'alert alert-info position-fixed';
    notification.style.cssText = 'top: 80px; right: 20px; z-index: 9999; min-width: 300px;';
    notification.innerHTML = `
        <i class="bi bi-display"></i> ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 5000);
}

function hideScreenShare(userId) {
    console.log('Screen share stopped by:', userId);
}

// File sharing functionality
function setupDataChannels() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.multiple = true;
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
    
    const chatInput = document.querySelector('.chat-input .input-group');
    const fileButton = document.createElement('button');
    fileButton.className = 'btn btn-outline-secondary';
    fileButton.innerHTML = '<i class="bi bi-paperclip"></i>';
    fileButton.title = 'Share file';
    fileButton.onclick = () => fileInput.click();
    
    chatInput.insertBefore(fileButton, chatInput.lastElementChild);
    
    fileInput.onchange = (event) => {
        const files = Array.from(event.target.files);
        files.forEach(file => shareFile(file));
    };
}

function shareFile(file) {
    if (file.size > 10 * 1024 * 1024) {
        alert('File too large. Maximum size is 10MB.');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = () => {
        const fileData = {
            name: file.name,
            size: file.size,
            type: file.type,
            data: reader.result
        };
        
        socket.emit('file_share', {
            room_id: ROOM_ID,
            user_id: userId,
            file_info: {
                name: file.name,
                size: file.size,
                type: file.type
            }
        });
        
        Object.values(dataChannels).forEach(channel => {
            if (channel.readyState === 'open') {
                channel.send(JSON.stringify(fileData));
            }
        });
    };
    
    reader.readAsDataURL(file);
}

function handleDataChannelMessage(fromUserId, data) {
    try {
        const fileData = JSON.parse(data);
        const blob = dataURLtoBlob(fileData.data);
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = fileData.name;
        a.click();
        
        URL.revokeObjectURL(url);
        
        const fromUser = participants[fromUserId];
        addSystemMessage(`File "${fileData.name}" received from ${fromUser?.username || 'Unknown'}`);
    } catch (error) {
        console.error('Error handling file data:', error);
    }
}

function generateUserId() {
    return 'user_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function dataURLtoBlob(dataURL) {
    const arr = dataURL.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
}

// ===== RECORDING FUNCTIONALITY =====
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let recordingStartTime = null;
let recordingTimer = null;

// Initialize recording functionality
function initializeRecording() {
    const recordBtn = document.getElementById('record-meeting');
    if (recordBtn) {
        recordBtn.addEventListener('click', toggleRecording);
    }
}

async function toggleRecording() {
    if (!isRecording) {
        await startRecording();
    } else {
        stopRecording();
    }
}

async function startRecording() {
    try {
        // Get display media for recording
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
            video: { mediaSource: 'screen' },
            audio: true
        });

        // Combine with local audio
        const audioContext = new AudioContext();
        const destination = audioContext.createMediaStreamDestination();
        
        if (localStream) {
            const localAudioSource = audioContext.createMediaStreamSource(localStream);
            localAudioSource.connect(destination);
        }

        const displayAudioSource = audioContext.createMediaStreamSource(displayStream);
        displayAudioSource.connect(destination);

        // Create combined stream
        const combinedStream = new MediaStream([
            ...displayStream.getVideoTracks(),
            ...destination.stream.getAudioTracks()
        ]);

        mediaRecorder = new MediaRecorder(combinedStream, {
            mimeType: 'video/webm;codecs=vp9,opus'
        });

        recordedChunks = [];
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = handleRecordingStop;

        mediaRecorder.start(1000); // Collect data every second
        isRecording = true;
        recordingStartTime = Date.now();

        // Update UI
        updateRecordingUI(true);
        startRecordingTimer();

        // Notify server and other participants
        socket.emit('start_recording', {
            room_id: ROOM_ID,
            user_id: userId,
            username: username
        });

        // Stop screen sharing when stream ends
        displayStream.getVideoTracks()[0].onended = () => {
            if (isRecording) {
                stopRecording();
            }
        };

    } catch (error) {
        console.error('Error starting recording:', error);
        showToast('Failed to start recording. Please check permissions.', 'error');
    }
}

function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;

        // Update UI
        updateRecordingUI(false);
        stopRecordingTimer();

        // Notify server and other participants
        socket.emit('stop_recording', {
            room_id: ROOM_ID,
            user_id: userId,
            username: username
        });
    }
}

function handleRecordingStop() {
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    
    // Create download link
    const a = document.createElement('a');
    a.href = url;
    a.download = `meeting-recording-${new Date().toISOString().slice(0, 19)}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    // Cleanup
    URL.revokeObjectURL(url);
    recordedChunks = [];
    
    showToast('Recording saved successfully!', 'success');
}

function updateRecordingUI(recording) {
    const recordBtn = document.getElementById('record-meeting');
    const recordingStatus = document.getElementById('recording-status');
    
    if (recording) {
        recordBtn.classList.add('recording');
        recordBtn.innerHTML = '<i class="bi bi-stop-circle"></i>';
        recordBtn.title = 'Stop Recording';
        recordingStatus.style.display = 'block';
    } else {
        recordBtn.classList.remove('recording');
        recordBtn.innerHTML = '<i class="bi bi-record-circle"></i>';
        recordBtn.title = 'Start Recording';
        recordingStatus.style.display = 'none';
    }
}

function startRecordingTimer() {
    const timerElement = document.getElementById('recording-timer');
    recordingTimer = setInterval(() => {
        const elapsed = Date.now() - recordingStartTime;
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }, 1000);
}

function stopRecordingTimer() {
    if (recordingTimer) {
        clearInterval(recordingTimer);
        recordingTimer = null;
    }
}

// ===== PARTICIPANTS MANAGEMENT =====
function initializeParticipants() {
    const participantsBtn = document.getElementById('participants-toggle');
    if (participantsBtn) {
        participantsBtn.addEventListener('click', showParticipantsModal);
    }

    // Request participants list when modal is shown
    const participantsModal = document.getElementById('participantsModal');
    if (participantsModal) {
        participantsModal.addEventListener('show.bs.modal', requestParticipantsList);
    }

    // Search functionality
    const searchInput = document.getElementById('participants-search');
    if (searchInput) {
        searchInput.addEventListener('input', filterParticipants);
    }
}

function showParticipantsModal() {
    const modal = new bootstrap.Modal(document.getElementById('participantsModal'));
    modal.show();
}

function requestParticipantsList() {
    socket.emit('request_participants_list', {
        room_id: ROOM_ID
    });
}

function updateParticipantsList(participantsList) {
    const container = document.getElementById('participants-list');
    const totalParticipants = document.getElementById('total-participants');
    const participantsWithVideo = document.getElementById('participants-with-video');
    const participantsWithAudio = document.getElementById('participants-with-audio');

    if (!container) return;

    // Update stats
    const videoCount = participantsList.filter(p => p.is_video_enabled).length;
    const audioCount = participantsList.filter(p => p.is_audio_enabled).length;

    totalParticipants.textContent = `${participantsList.length} Participants`;
    participantsWithVideo.textContent = `${videoCount} with video`;
    participantsWithAudio.textContent = `${audioCount} with audio`;

    // Update list
    container.innerHTML = '';
    participantsList.forEach(participant => {
        const participantElement = createParticipantElement(participant);
        container.appendChild(participantElement);
    });
}

function createParticipantElement(participant) {
    const div = document.createElement('div');
    div.className = 'participant-item';
    div.setAttribute('data-user-id', participant.user_id);

    const isCurrentUser = participant.user_id === userId;
    const initials = participant.username.substring(0, 2).toUpperCase();

    div.innerHTML = `
        <div class="participant-info">
            <div class="participant-avatar">${initials}</div>
            <div class="participant-details">
                <h6>${participant.username} ${isCurrentUser ? '(You)' : ''}</h6>
                <small>Joined at ${new Date().toLocaleTimeString()}</small>
            </div>
        </div>
        <div class="participant-status">
            <span class="status-badge ${participant.is_video_enabled ? 'status-video-on' : 'status-video-off'}">
                <i class="bi bi-camera-video${participant.is_video_enabled ? '' : '-off'}"></i>
            </span>
            <span class="status-badge ${participant.is_audio_enabled ? 'status-audio-on' : 'status-audio-off'}">
                <i class="bi bi-mic${participant.is_audio_enabled ? '' : '-mute'}"></i>
            </span>
        </div>
        <div class="participant-actions">
            ${!isCurrentUser ? `
                <button class="btn btn-sm btn-outline-warning" onclick="muteParticipant('${participant.user_id}')" title="Mute">
                    <i class="bi bi-mic-mute"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="removeParticipant('${participant.user_id}')" title="Remove">
                    <i class="bi bi-person-x"></i>
                </button>
            ` : ''}
        </div>
    `;

    return div;
}

function filterParticipants() {
    const searchTerm = document.getElementById('participants-search').value.toLowerCase();
    const participantItems = document.querySelectorAll('.participant-item');

    participantItems.forEach(item => {
        const username = item.querySelector('.participant-details h6').textContent.toLowerCase();
        if (username.includes(searchTerm)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

function muteParticipant(targetUserId) {
    socket.emit('mute_participant', {
        room_id: ROOM_ID,
        target_user_id: targetUserId,
        muted_by: userId
    });
    showToast('Mute request sent', 'info');
}

function removeParticipant(targetUserId) {
    if (confirm('Are you sure you want to remove this participant?')) {
        // In a real implementation, you'd need proper authorization
        showToast('Remove participant feature requires admin privileges', 'warning');
    }
}

// ===== SETTINGS MANAGEMENT =====
let userSettings = {
    videoQuality: '720p',
    mirrorVideo: true,
    noiseSuppression: true,
    echoCancellation: true,
    joinWithVideo: true,
    joinWithAudio: true,
    displayName: ''
};

function initializeSettings() {
    const settingsBtn = document.getElementById('settings');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', showSettingsModal);
    }

    const saveSettingsBtn = document.getElementById('save-settings');
    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', saveSettings);
    }

    // Load saved settings
    loadSettings();
    
    // Populate device lists when modal is shown
    const settingsModal = document.getElementById('settingsModal');
    if (settingsModal) {
        settingsModal.addEventListener('show.bs.modal', populateDeviceLists);
    }
}

function showSettingsModal() {
    console.log('Settings button clicked - opening modal');
    const modal = new bootstrap.Modal(document.getElementById('settingsModal'));
    if (modal) {
        console.log('Modal found, showing...');
        modal.show();
    } else {
        console.error('Settings modal not found!');
    }
}

async function populateDeviceLists() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        
        const cameraSelect = document.getElementById('video-device-select');
        const micSelect = document.getElementById('audio-device-select');
        const speakerSelect = document.getElementById('speaker-select');

        // Clear existing options
        [cameraSelect, micSelect, speakerSelect].forEach(select => {
            if (select) select.innerHTML = '';
        });

        devices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.textContent = device.label || `${device.kind} ${device.deviceId.substring(0, 8)}`;

            if (device.kind === 'videoinput' && cameraSelect) {
                cameraSelect.appendChild(option.cloneNode(true));
            } else if (device.kind === 'audioinput' && micSelect) {
                micSelect.appendChild(option.cloneNode(true));
            } else if (device.kind === 'audiooutput' && speakerSelect) {
                speakerSelect.appendChild(option.cloneNode(true));
            }
        });

        // Load current settings
        loadSettingsToModal();

    } catch (error) {
        console.error('Error enumerating devices:', error);
        showToast('Could not load device list', 'error');
    }
}

function loadSettings() {
    const savedSettings = localStorage.getItem('teams_settings');
    if (savedSettings) {
        userSettings = { ...userSettings, ...JSON.parse(savedSettings) };
    }
}

function loadSettingsToModal() {
    // Video settings
    document.getElementById('video-quality').value = userSettings.videoQuality;
    document.getElementById('mirror-video').checked = userSettings.mirrorVideo;
    
    // Audio settings
    document.getElementById('noise-suppression').checked = userSettings.noiseSuppression;
    document.getElementById('echo-cancellation').checked = userSettings.echoCancellation;
    
    // General settings
    document.getElementById('display-name').value = userSettings.displayName || username;
    document.getElementById('join-with-video').checked = userSettings.joinWithVideo;
    document.getElementById('join-with-audio').checked = userSettings.joinWithAudio;
}

function saveSettings() {
    // Collect settings from modal
    userSettings.videoQuality = document.getElementById('video-quality').value;
    userSettings.mirrorVideo = document.getElementById('mirror-video').checked;
    userSettings.noiseSuppression = document.getElementById('noise-suppression').checked;
    userSettings.echoCancellation = document.getElementById('echo-cancellation').checked;
    userSettings.displayName = document.getElementById('display-name').value;
    userSettings.joinWithVideo = document.getElementById('join-with-video').checked;
    userSettings.joinWithAudio = document.getElementById('join-with-audio').checked;

    // Save to localStorage
    localStorage.setItem('teams_settings', JSON.stringify(userSettings));

    // Apply settings
    applySettings();

    // Notify server
    socket.emit('update_settings', {
        user_id: userId,
        settings: userSettings
    });

    // Close modal
    const modal = bootstrap.Modal.getInstance(document.getElementById('settingsModal'));
    modal.hide();

    showToast('Settings saved successfully!', 'success');
}

function applySettings() {
    // Apply video mirroring
    const localVideoElement = document.getElementById('local-video');
    if (localVideoElement) {
        localVideoElement.style.transform = userSettings.mirrorVideo ? 'scaleX(-1)' : 'scaleX(1)';
    }

    // Update display name if changed
    if (userSettings.displayName && userSettings.displayName !== username) {
        username = userSettings.displayName;
        localStorage.setItem('teams_username', username);
    }
}

// ===== SOCKET EVENT HANDLERS FOR NEW FEATURES =====
function setupEnhancedSocketEvents() {
    // Recording events
    socket.on('recording_started', (data) => {
        showToast(`${data.username} started recording`, 'info');
    });

    socket.on('recording_stopped', (data) => {
        showToast(`${data.username} stopped recording`, 'info');
    });

    // Participants events
    socket.on('participants_list', (data) => {
        updateParticipantsList(data.participants);
    });

    socket.on('participant_muted', (data) => {
        if (data.target_user_id === userId) {
            showToast('You have been muted by the host', 'warning');
            // Auto-mute the user
            toggleAudio();
        }
    });

    // Settings events
    socket.on('settings_updated', (data) => {
        if (data.user_id === userId) {
            console.log('Settings updated on server');
        }
    });
}

// ===== ATTENDEES LIST MANAGEMENT =====
function initializeAttendeesList() {
    updateAttendeesList();
}

function updateAttendeesList(participantsList = null) {
    const attendeesContainer = document.getElementById('attendees-list');
    const attendeesCount = document.getElementById('attendees-count');
    
    if (!attendeesContainer) return;
    
    attendeesContainer.innerHTML = '';
    
    // Use provided list or current participants
    let allParticipants = [];
    
    if (participantsList) {
        allParticipants = participantsList;
    } else {
        allParticipants = Object.values(participants);
        // Add current user
        allParticipants.push({
            user_id: userId,
            username: username,
            is_video_enabled: isVideoEnabled,
            is_audio_enabled: isAudioEnabled
        });
    }
    
    // Sort participants (current user first)
    allParticipants.sort((a, b) => {
        if (a.user_id === userId) return -1;
        if (b.user_id === userId) return 1;
        return a.username.localeCompare(b.username);
    });
    
    // Create attendee item for each participant
    allParticipants.forEach(participant => {
        const attendeeElement = createAttendeeElement(participant);
        attendeesContainer.appendChild(attendeeElement);
    });
    
    // Update count
    if (attendeesCount) {
        attendeesCount.textContent = allParticipants.length;
    }
    
    console.log(`Updated attendees list: ${allParticipants.length} attendees`);
}

function createAttendeeElement(participant) {
    const div = document.createElement('div');
    div.className = 'attendee-item';
    div.setAttribute('data-user-id', participant.user_id);
    
    const isCurrentUser = participant.user_id === userId;
    const initials = participant.username.substring(0, 2).toUpperCase();
    const joinTime = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    div.innerHTML = `
        <div class="attendee-info">
            <div class="attendee-avatar ${isCurrentUser ? 'current-user' : ''}">${initials}</div>
            <div class="attendee-details">
                <h6>${participant.username} ${isCurrentUser ? '(You)' : ''}</h6>
                <small>Joined at ${joinTime}</small>
            </div>
        </div>
        <div class="attendee-controls">
            <button class="mic-control ${participant.is_audio_enabled ? '' : 'muted'}" 
                    onclick="toggleParticipantMute('${participant.user_id}', ${participant.is_audio_enabled})"
                    title="${participant.is_audio_enabled ? 'Mute' : 'Unmute'}">
                <i class="bi bi-mic${participant.is_audio_enabled ? '' : '-mute'}"></i>
            </button>
            ${!isCurrentUser ? `
                <button class="btn btn-sm btn-outline-danger" 
                        onclick="removeParticipant('${participant.user_id}')"
                        title="Remove">
                    <i class="bi bi-person-x"></i>
                </button>
            ` : ''}
        </div>
    `;
    
    return div;
}

function toggleParticipantMute(targetUserId, currentAudioState) {
    if (targetUserId === userId) {
        // Toggle own microphone
        toggleAudio();
    } else {
        // Send mute request to other participant
        socket.emit('mute_participant_request', {
            room_id: ROOM_ID,
            target_user_id: targetUserId,
            muted_by: userId,
            action: currentAudioState ? 'mute' : 'unmute'
        });
        
        showToast(`${currentAudioState ? 'Mute' : 'Unmute'} request sent`, 'info');
    }
}

// ===== MEETING SCHEDULER =====
let scheduledMeetings = [];

function initializeScheduler() {
    const scheduleBtn = document.getElementById('schedule-meeting');
    if (scheduleBtn) {
        scheduleBtn.addEventListener('click', showScheduleModal);
    }
    
    const scheduleFormBtn = document.getElementById('schedule-meeting-btn');
    if (scheduleFormBtn) {
        scheduleFormBtn.addEventListener('click', scheduleMeeting);
    }
    
    // Set default date to today
    const dateInput = document.getElementById('meeting-date');
    if (dateInput) {
        dateInput.valueAsDate = new Date();
    }
    
    // Set default time to next hour
    const timeInput = document.getElementById('meeting-start-time');
    if (timeInput) {
        const now = new Date();
        now.setHours(now.getHours() + 1, 0, 0, 0);
        timeInput.value = now.toTimeString().slice(0, 5);
    }
}

function showScheduleModal() {
    const modal = new bootstrap.Modal(document.getElementById('scheduleModal'));
    modal.show();
    
    // Generate meeting link preview
    updateMeetingLinkPreview();
}

function updateMeetingLinkPreview() {
    const title = document.getElementById('meeting-title').value || 'Scheduled Meeting';
    const previewElement = document.getElementById('meeting-link-preview');
    const meetingId = generateMeetingId();
    const meetingUrl = `${window.location.origin}/room/${meetingId}`;
    
    if (previewElement) {
        previewElement.textContent = meetingUrl;
    }
}

function generateMeetingId() {
    return 'meeting-' + Math.random().toString(36).substring(2, 15);
}

function scheduleMeeting() {
    const form = document.getElementById('schedule-form');
    const formData = new FormData(form);
    
    const meetingData = {
        id: generateMeetingId(),
        title: document.getElementById('meeting-title').value,
        date: document.getElementById('meeting-date').value,
        startTime: document.getElementById('meeting-start-time').value,
        duration: parseInt(document.getElementById('meeting-duration').value),
        description: document.getElementById('meeting-description').value,
        attendees: document.getElementById('meeting-attendees').value.split(',').map(email => email.trim()).filter(email => email),
        recurring: document.getElementById('meeting-recurring').checked,
        recordingEnabled: document.getElementById('meeting-recording').checked,
        organizer: username,
        organizerId: userId,
        roomId: ROOM_ID,
        createdAt: new Date().toISOString()
    };
    
    // Validate form
    if (!meetingData.title || !meetingData.date || !meetingData.startTime) {
        showToast('Please fill in all required fields', 'error');
        return;
    }
    
    // Save meeting
    scheduledMeetings.push(meetingData);
    localStorage.setItem('scheduled_meetings', JSON.stringify(scheduledMeetings));
    
    // Send to server
    socket.emit('schedule_meeting', {
        room_id: ROOM_ID,
        meeting_data: meetingData
    });
    
    // Close modal
    const modal = bootstrap.Modal.getInstance(document.getElementById('scheduleModal'));
    modal.hide();
    
    // Show success message with meeting details
    const meetingUrl = `${window.location.origin}/room/${meetingData.id}`;
    showToast(`Meeting "${meetingData.title}" scheduled successfully!`, 'success');
    
    // Copy meeting link to clipboard
    if (navigator.clipboard) {
        navigator.clipboard.writeText(meetingUrl);
        showToast('Meeting link copied to clipboard!', 'info');
    }
    
    // Reset form
    form.reset();
    
    console.log('Meeting scheduled:', meetingData);
}

// ===== TOAST NOTIFICATIONS =====
function showToast(message, type = 'info') {
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast align-items-center text-white bg-${type === 'error' ? 'danger' : type === 'success' ? 'success' : type === 'warning' ? 'warning' : 'primary'} border-0`;
    toast.setAttribute('role', 'alert');
    toast.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">${message}</div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
        </div>
    `;

    // Add to container
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.className = 'toast-container position-fixed top-0 end-0 p-3';
        toastContainer.style.zIndex = '1055';
        document.body.appendChild(toastContainer);
    }

    toastContainer.appendChild(toast);

    // Show toast
    const bsToast = new bootstrap.Toast(toast);
    bsToast.show();

    // Auto-remove after hide
    toast.addEventListener('hidden.bs.toast', () => {
        toast.remove();
    });
}

// ===== ATTENDEES LIST MANAGEMENT =====
function initializeAttendeesList() {
    updateAttendeesList();
}

function updateAttendeesList(participantsList = null) {
    const attendeesContainer = document.getElementById('attendees-list');
    const attendeesCount = document.getElementById('attendees-count');
    
    if (!attendeesContainer) return;
    
    attendeesContainer.innerHTML = '';
    
    // Use provided list or current participants
    let allParticipants = [];
    
    if (participantsList) {
        allParticipants = participantsList;
    } else {
        allParticipants = Object.values(participants);
        // Add current user
        allParticipants.push({
            user_id: userId,
            username: username,
            is_video_enabled: isVideoEnabled,
            is_audio_enabled: isAudioEnabled
        });
    }
    
    // Sort participants (current user first)
    allParticipants.sort((a, b) => {
        if (a.user_id === userId) return -1;
        if (b.user_id === userId) return 1;
        return a.username.localeCompare(b.username);
    });
    
    // Create attendee item for each participant
    allParticipants.forEach(participant => {
        const attendeeElement = createAttendeeElement(participant);
        attendeesContainer.appendChild(attendeeElement);
    });
    
    // Update count
    if (attendeesCount) {
        attendeesCount.textContent = allParticipants.length;
    }
    
    console.log(`Updated attendees list: ${allParticipants.length} attendees`);
}

function createAttendeeElement(participant) {
    const div = document.createElement('div');
    div.className = 'attendee-item';
    div.setAttribute('data-user-id', participant.user_id);
    
    const isCurrentUser = participant.user_id === userId;
    const initials = participant.username.substring(0, 2).toUpperCase();
    const joinTime = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    div.innerHTML = `
        <div class="attendee-info">
            <div class="attendee-avatar ${isCurrentUser ? 'current-user' : ''}">${initials}</div>
            <div class="attendee-details">
                <h6>${participant.username} ${isCurrentUser ? '(You)' : ''}</h6>
                <small>Joined at ${joinTime}</small>
            </div>
        </div>
        <div class="attendee-controls">
            <button class="mic-control ${participant.is_audio_enabled ? '' : 'muted'}" 
                    onclick="toggleParticipantMute('${participant.user_id}', ${participant.is_audio_enabled})"
                    title="${participant.is_audio_enabled ? 'Mute' : 'Unmute'}">
                <i class="bi bi-mic${participant.is_audio_enabled ? '' : '-mute'}"></i>
            </button>
            ${!isCurrentUser ? `
                <button class="btn btn-sm btn-outline-danger" 
                        onclick="removeParticipant('${participant.user_id}')"
                        title="Remove">
                    <i class="bi bi-person-x"></i>
                </button>
            ` : ''}
        </div>
    `;
    
    return div;
}

function toggleParticipantMute(targetUserId, currentAudioState) {
    if (targetUserId === userId) {
        // Toggle own microphone
        toggleAudio();
    } else {
        // Send mute request to other participant
        socket.emit('mute_participant_request', {
            room_id: ROOM_ID,
            target_user_id: targetUserId,
            muted_by: userId,
            action: currentAudioState ? 'mute' : 'unmute'
        });
        
        showToast(`${currentAudioState ? 'Mute' : 'Unmute'} request sent`, 'info');
    }
}

// ===== MISSING BUTTON FUNCTIONS =====

function toggleChatSidebar() {
    const chatSidebar = document.getElementById('chat-sidebar');
    const chatToggleBtn = document.getElementById('chat-toggle');
    
    if (chatSidebar) {
        const isVisible = chatSidebar.classList.contains('show');
        
        if (isVisible) {
            chatSidebar.classList.remove('show');
            chatToggleBtn.classList.remove('active');
            addSystemMessage('💬 Chat hidden');
        } else {
            chatSidebar.classList.add('show');
            chatToggleBtn.classList.add('active');
            addSystemMessage('💬 Chat shown');
        }
    }
}

function showScheduleMeeting() {
    const modal = new bootstrap.Modal(document.getElementById('scheduleMeetingModal'));
    if (modal) {
        modal.show();
    } else {
        // Fallback if modal doesn't exist
        showToast('📅 Schedule Meeting feature available', 'info');
        console.log('Opening schedule meeting interface...');
    }
}
