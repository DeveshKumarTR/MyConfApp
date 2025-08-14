// Global variables
let username = '';
let socket = null;

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    loadStoredUsername();
    setupEventListeners();
    loadRooms();
});

function loadStoredUsername() {
    const stored = localStorage.getItem('teams_username');
    if (stored) {
        username = stored;
        document.getElementById('username').value = username;
        updateUsernameDisplay();
    }
}

function updateUsernameDisplay() {
    const display = document.getElementById('username-display');
    if (display && username) {
        display.textContent = `Welcome, ${username}`;
    }
}

function setupEventListeners() {
    // Username input
    const usernameInput = document.getElementById('username');
    if (usernameInput) {
        usernameInput.addEventListener('change', function() {
            username = this.value.trim();
            if (username) {
                localStorage.setItem('teams_username', username);
                updateUsernameDisplay();
            }
        });
    }

    // Room ID input - Enter key handler
    const roomInput = document.getElementById('room-id');
    if (roomInput) {
        roomInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                joinRoom();
            }
        });
    }
}

function validateUsername() {
    const usernameInput = document.getElementById('username');
    username = usernameInput.value.trim();
    
    if (!username) {
        alert('Please enter your name before joining a room.');
        usernameInput.focus();
        return false;
    }
    
    localStorage.setItem('teams_username', username);
    return true;
}

function createRoom() {
    if (!validateUsername()) return;
    
    fetch('/api/rooms', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.room_id) {
            window.location.href = `/room/${data.room_id}`;
        }
    })
    .catch(error => {
        console.error('Error creating room:', error);
        alert('Failed to create room. Please try again.');
    });
}

function joinRoom() {
    if (!validateUsername()) return;
    
    const roomId = document.getElementById('room-id').value.trim();
    
    if (!roomId) {
        alert('Please enter a room ID.');
        return;
    }
    
    // Validate room exists or join directly
    joinRoomById(roomId);
}

function joinRoomById(roomId) {
    // Store username for the room
    const username = document.getElementById('username').value.trim();
    localStorage.setItem('teams_username', username);
    
    // Navigate to room
    window.location.href = `/room/${roomId}`;
}

function shareRoom(roomId) {
    const roomUrl = `${window.location.origin}/room/${roomId}`;
    
    if (navigator.share) {
        // Use native sharing if available
        navigator.share({
            title: 'Join Teams Meeting',
            text: 'Join me in this Teams meeting',
            url: roomUrl,
        });
    } else if (navigator.clipboard) {
        // Copy to clipboard
        navigator.clipboard.writeText(roomUrl).then(() => {
            showToast('Room link copied to clipboard!');
        });
    } else {
        // Fallback: prompt with URL
        prompt('Copy this room link to share:', roomUrl);
    }
}

function showToast(message) {
    // Create a simple toast notification
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #28a745;
        color: white;
        padding: 12px 20px;
        border-radius: 5px;
        z-index: 1000;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Add CSS animation
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);

function validateRoomExists() {
    const roomId = document.getElementById('room-id').value.trim();
    if (!roomId) return;
    
    // Check if room exists
    fetch(`/api/rooms/${roomId}`)
    .then(response => {
        if (response.ok) {
            window.location.href = `/room/${roomId}`;
        } else {
            alert('Room not found. Please check the room ID.');
        }
    })
    .catch(error => {
        console.error('Error checking room:', error);
        // Allow joining anyway in case it's a new room
        window.location.href = `/room/${roomId}`;
    });
}

function createAndJoinRoom() {
    createRoom();
}

function loadRooms() {
    // This would load available rooms from the server
    // For now, we'll show some example rooms
    const roomsList = document.getElementById('rooms-list');
    if (!roomsList) return;
    
    const exampleRooms = [
        { id: 'general', name: 'General', participants: 5 },
        { id: 'development', name: 'Development', participants: 3 },
        { id: 'design', name: 'Design', participants: 2 }
    ];
    
    roomsList.innerHTML = '';
    exampleRooms.forEach(room => {
        const roomElement = document.createElement('div');
        roomElement.className = 'room-item';
        roomElement.innerHTML = `
            <div class="room-status"></div>
            <div class="flex-grow-1">
                <div class="fw-bold">${room.name}</div>
                <small class="text-muted">${room.participants} participants</small>
            </div>
        `;
        roomElement.addEventListener('click', () => {
            if (validateUsername()) {
                window.location.href = `/room/${room.id}`;
            }
        });
        roomsList.appendChild(roomElement);
    });
}

// Utility functions
function generateRoomId() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        // Show success message
        showNotification('Copied to clipboard!');
    });
}

function showNotification(message, type = 'success') {
    // Create a simple notification
    const notification = document.createElement('div');
    notification.className = `alert alert-${type} position-fixed`;
    notification.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 250px;';
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}
